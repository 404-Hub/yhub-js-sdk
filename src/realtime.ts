import type { YhubClient } from './client.js'
import { YhubError } from './error.js'

export interface RealtimeMember { id: string; subject: string }
export interface RealtimeEvent { from: string; event: string; payload: unknown }
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed'
export interface RealtimeOptions {
  reconnect?: boolean
  maxReconnectAttempts?: number
}
export type WebSocketFactory = (url: string) => WebSocket
interface Ticket { token: string; room: string; expires_at: number; max_payload_bytes: number }

export class RealtimeRoom {
  private socket?: WebSocket
  private stopped = false
  private generation = 0
  private attempts = 0
  private timer?: ReturnType<typeof setTimeout>
  private deadline?: ReturnType<typeof setTimeout>
  private heartbeat?: ReturnType<typeof setInterval>
  private maxPayload = 2048
  private eventHandlers = new Map<string, Set<(event: RealtimeEvent) => void>>()
  private presenceHandlers = new Set<(users: RealtimeMember[]) => void>()
  private errorHandlers = new Set<(error: Error) => void>()
  private statusHandlers = new Set<(status: RealtimeStatus) => void>()
  private members: RealtimeMember[] = []
  private state: RealtimeStatus = 'connecting'
  private resolveJoin?: () => void
  private rejectJoin?: (error: Error) => void

  readonly presence = {
    onChange: (handler: (users: RealtimeMember[]) => void): (() => void) => {
      this.presenceHandlers.add(handler)
      handler(this.members.map(member => ({ ...member })))
      return () => { this.presenceHandlers.delete(handler) }
    },
  }

  constructor(
    readonly name: string,
    private readonly client: YhubClient,
    private readonly createSocket: WebSocketFactory,
    private readonly options: RealtimeOptions,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolveJoin = resolve
      this.rejectJoin = reject
      void this.connect()
    })
  }

  on(event: string, handler: (event: RealtimeEvent) => void): () => void {
    const handlers = this.eventHandlers.get(event) ?? new Set()
    handlers.add(handler)
    this.eventHandlers.set(event, handlers)
    return () => {
      handlers.delete(handler)
      if (!handlers.size) this.eventHandlers.delete(event)
    }
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler)
    return () => { this.errorHandlers.delete(handler) }
  }

  onStatus(handler: (status: RealtimeStatus) => void): () => void {
    this.statusHandlers.add(handler)
    handler(this.state)
    return () => { this.statusHandlers.delete(handler) }
  }

  send(event: string, payload: unknown): void {
    if (this.state !== 'connected' || this.socket?.readyState !== 1) {
      throw new YhubError('Realtime room is not connected.', 0)
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(event)) {
      throw new YhubError('Invalid realtime event name.', 422)
    }
    const message = JSON.stringify({ type: 'event', room: this.name, event, payload })
    if (new TextEncoder().encode(message).byteLength > this.maxPayload) {
      throw new YhubError('Realtime message is too large.', 413)
    }
    if (this.socket.bufferedAmount > this.maxPayload * 8) {
      throw new YhubError('Realtime connection is congested.', 429)
    }
    this.socket.send(message)
  }

  close(): void {
    if (this.stopped) return
    this.stopped = true
    this.generation++
    clearTimeout(this.timer)
    this.clearConnection()
    this.rejectJoin?.(new YhubError('Realtime room was closed.', 0))
    this.resolveJoin = undefined
    this.rejectJoin = undefined
    this.updatePresence([])
    this.setStatus('closed')
    this.eventHandlers.clear()
    this.presenceHandlers.clear()
    this.errorHandlers.clear()
    this.statusHandlers.clear()
  }

  private clearConnection(): void {
    clearTimeout(this.deadline)
    clearInterval(this.heartbeat)
    const socket = this.socket
    this.socket = undefined
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close()
    }
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation
    let admitted = false
    try {
      const response = await this.client.request<{ data: Ticket }>('POST', '/realtime/token', { body: { room: this.name } })
      if (this.stopped || generation !== this.generation) return
      const ticket = response.data
      const url = new URL(this.client.absoluteUrl('/realtime/token'))
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.pathname = '/ws'
      url.search = ''
      url.hash = ''
      this.maxPayload = ticket.max_payload_bytes
      const socket = this.createSocket(url.toString())
      this.socket = socket
      this.deadline = setTimeout(() => socket.close(), 10_000)
      socket.onopen = () => socket.send(JSON.stringify({ type: 'join', room: this.name, token: ticket.token }))
      socket.onmessage = event => {
        if (this.stopped || generation !== this.generation || typeof event.data !== 'string') return
        let message: Record<string, unknown>
        try { message = JSON.parse(event.data) } catch { socket.close(); return }
        if (message.type === 'joined') {
          admitted = true
          this.attempts = 0
          clearTimeout(this.deadline)
          this.setStatus('connected')
          this.resolveJoin?.()
          this.resolveJoin = undefined
          this.rejectJoin = undefined
          this.heartbeat = setInterval(() => {
            if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }))
          }, 20_000)
        } else if (message.type === 'presence' && Array.isArray(message.members)) {
          this.updatePresence(message.members as RealtimeMember[])
        } else if (message.type === 'event' && typeof message.event === 'string') {
          this.eventHandlers.get(message.event)?.forEach(handler => handler(message as unknown as RealtimeEvent))
        } else if (message.type === 'error') {
          const error = new YhubError(String(message.message ?? 'Realtime request failed.'), Number(message.status ?? 0))
          this.errorHandlers.forEach(handler => handler(error))
          if (!admitted) this.fail(error, false)
        }
      }
      socket.onerror = () => { /* The close event drives reconnects. */ }
      socket.onclose = event => {
        if (generation !== this.generation || this.stopped) return
        this.fail(new YhubError('Realtime connection closed.', event.code), ![1008, 1009, 4001, 4003, 4029].includes(event.code))
      }
    } catch (error) {
      if (this.stopped || generation !== this.generation) return
      const failure = error instanceof Error ? error : new Error('Realtime connection failed.')
      const retry = !(failure instanceof YhubError) || ![400, 401, 403, 404, 422, 429].includes(failure.status)
      this.fail(failure, retry)
    }
  }

  private fail(error: Error, retry: boolean): void {
    this.generation++
    this.clearConnection()
    this.updatePresence([])
    this.errorHandlers.forEach(handler => handler(error))
    const maxAttempts = Math.min(10, Math.max(0, this.options.maxReconnectAttempts ?? 5))
    if (retry && this.options.reconnect !== false && this.attempts < maxAttempts) {
      this.setStatus('reconnecting')
      const delay = Math.min(10_000, 500 * 2 ** this.attempts++) + Math.random() * 250
      this.timer = setTimeout(() => { void this.connect() }, delay)
    } else {
      this.rejectJoin?.(error)
      this.rejectJoin = undefined
      this.close()
    }
  }

  private setStatus(status: RealtimeStatus): void {
    this.state = status
    this.statusHandlers.forEach(handler => handler(status))
  }

  private updatePresence(members: RealtimeMember[]): void {
    this.members = members
    this.presenceHandlers.forEach(handler => handler(members.map(member => ({ ...member }))))
  }
}

export class RealtimeClient {
  constructor(private readonly client: YhubClient, private readonly createSocket: WebSocketFactory = url => new WebSocket(url)) {}

  async join(name: string, options: RealtimeOptions = {}): Promise<RealtimeRoom> {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/.test(name)) throw new YhubError('Invalid room name.', 422)
    const room = new RealtimeRoom(name, this.client, this.createSocket, options)
    await room.start()
    return room
  }
}
