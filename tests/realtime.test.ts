import { afterEach, describe, expect, it, vi } from 'vitest'
import { YhubClient } from '../src/client.js'
import type { RealtimeRoom } from '../src/realtime.js'

class FakeSocket {
  readyState = 0
  bufferedAmount = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(readonly url: string) {}
  send(value: string) { this.sent.push(value) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
  disconnect(code: number) { this.readyState = 3; this.onclose?.({ code }) }
}
const rooms: RealtimeRoom[] = []
afterEach(() => { rooms.forEach(room => room.close()); rooms.length = 0; vi.useRealTimers() })
function fixture() {
  const sockets: FakeSocket[] = []
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { token: 'room-ticket', room: 'game:abc', max_payload_bytes: 2048, expires_at: 9999999999 } }), { status: 200 }))
  const client = new YhubClient({ baseUrl: 'https://site.test', token: 'yusr_secret', fetch: fetcher,
    webSocketFactory: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocket },
  })
  return { client, sockets, fetcher }
}
async function admit(client: YhubClient, sockets: FakeSocket[]) {
  const result = client.realtime.join('game:abc')
  await vi.waitFor(() => expect(sockets).toHaveLength(1))
  sockets[0].open(); sockets[0].receive({ type: 'joined', id: 'first' })
  const room = await result; rooms.push(room)
  return room
}

describe('realtime SDK', () => {
  it('sends credentials only in the HTTP exchange and joins via a frame without URL secrets', async () => {
    const { client, sockets, fetcher } = fixture()
    const room = await admit(client, sockets)
    expect(sockets[0].url).toBe('wss://site.test/ws')
    expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'join', room: 'game:abc', token: 'room-ticket' })
    expect(new Headers((fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1].headers).get('Authorization')).toBe('Bearer yusr_secret')
    const events = vi.fn(); const unsubscribe = room.on('move', events)
    sockets[0].receive({ type: 'event', event: 'move', from: 'other', payload: { x: 1 } })
    expect(events).toHaveBeenCalledWith({ type: 'event', event: 'move', from: 'other', payload: { x: 1 } })
    unsubscribe(); sockets[0].receive({ type: 'event', event: 'move', payload: {} }); expect(events).toHaveBeenCalledTimes(1)
    const presence = vi.fn(); const stopPresence = room.presence.onChange(presence)
    sockets[0].receive({ type: 'presence', members: [{ id: 'other', subject: 'user:2' }] })
    expect(presence).toHaveBeenLastCalledWith([{ id: 'other', subject: 'user:2' }]); stopPresence()
    room.send('move', { x: 2 }); expect(JSON.parse(sockets[0].sent[1]).payload).toEqual({ x: 2 })
    expect(() => room.send('move', 'x'.repeat(3000))).toThrow('too large')
    room.close(); expect(sockets[0].onmessage).toBeNull(); expect(() => room.send('move', {})).toThrow('not connected')
  })

  it('uses a fresh ticket after reconnect and retains subscriptions', async () => {
    const { client, sockets, fetcher } = fixture(); const room = await admit(client, sockets)
    vi.useFakeTimers(); const events = vi.fn(); room.on('move', events)
    sockets[0].disconnect(1012)
    expect(() => room.send('move', {})).toThrow('not connected')
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(2); expect(sockets).toHaveLength(2)
    sockets[1].open(); sockets[1].receive({ type: 'joined' }); sockets[1].receive({ type: 'event', event: 'move', payload: 3 })
    expect(events).toHaveBeenCalledTimes(1)
    sockets[1].disconnect(1012); room.close(); await vi.advanceTimersByTimeAsync(20_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('retains subscriptions across rotation and a temporarily stale runtime', async () => {
    const { client, sockets, fetcher } = fixture(); const room = await admit(client, sockets)
    vi.useFakeTimers(); const events = vi.fn(); room.on('move', events)
    const status = vi.fn(); room.onStatus(status)
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Realtime credentials are being refreshed.' }), { status: 503 }))
    sockets[0].disconnect(1012)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(1)
    expect(status).toHaveBeenLastCalledWith('reconnecting')
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(3)
    sockets[1].open(); sockets[1].receive({ type: 'joined' })
    sockets[1].receive({ type: 'event', event: 'move', payload: 4 })
    expect(events).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenLastCalledWith('connected')
  })

  it('stops renewal when the refreshed runtime rejects a revoked token', async () => {
    const { client, sockets, fetcher } = fixture(); const room = await admit(client, sockets)
    vi.useFakeTimers(); const status = vi.fn(); room.onStatus(status)
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Realtime credentials are being refreshed.' }), { status: 503 }))
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'A server token is required.' }), { status: 401 }))
    sockets[0].disconnect(1012)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sockets).toHaveLength(1)
    expect(status).toHaveBeenLastCalledWith('closed')
  })

  it('rejects invalid tickets and authorization failures without reconnect loops', async () => {
    const { client, sockets, fetcher } = fixture()
    const result = client.realtime.join('owner:secret')
    const failure = expect(result).rejects.toThrow('connection closed')
    await vi.waitFor(() => expect(sockets).toHaveLength(1)); sockets[0].open(); sockets[0].disconnect(4003)
    await failure; expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ message: 'Authentication required' }), { status: 401 }))
    await expect(client.realtime.join('user:secret')).rejects.toThrow('Authentication required')
    expect(sockets).toHaveLength(1)
  })

  it('rejects invalid names before networking and congested sockets before sending', async () => {
    const { client, sockets, fetcher } = fixture()
    await expect(client.realtime.join('../private')).rejects.toThrow('Invalid room')
    expect(fetcher).not.toHaveBeenCalled()
    const room = await admit(client, sockets); sockets[0].bufferedAmount = 1_000_000
    expect(() => room.send('move', {})).toThrow('congested')
  })
})
