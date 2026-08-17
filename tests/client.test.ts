import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YhubClient, YhubError } from '../src/index.js'

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('YhubClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => fetchMock.mockReset())

  it('performs collection CRUD and sends the SDK version', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: 1, title: 'Hello' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, title: 'Hello' }] }))
    const posts = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock }).db.collection('posts')

    await expect(posts.create({ title: 'Hello' })).resolves.toEqual({ id: 1, title: 'Hello' })
    await expect(posts.list({ limit: 20, offset: 0 })).resolves.toHaveLength(1)

    const [createUrl, createOptions] = fetchMock.mock.calls[0]
    expect(String(createUrl)).toBe('https://demo.yhub.net/api/posts')
    expect(new Headers(createOptions?.headers).get('X-YHub-SDK-Version')).toBe('1.0.0')
    expect(fetchMock.mock.calls[1][0].toString()).toContain('limit=20&offset=0')
  })

  it('stores auth tokens and attaches them to later requests', async () => {
    const tokens = {
      value: null as string | null,
      get: vi.fn(() => tokens.value),
      set: vi.fn((token: string) => { tokens.value = token }),
      remove: vi.fn(() => { tokens.value = null }),
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'yusr_test', user: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1, email: 'a@example.com' } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, tokenStore: tokens })

    await client.auth.login({ email: 'a@example.com', password: 'password' })
    await client.auth.me()

    expect(tokens.set).toHaveBeenCalledWith('yusr_test')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer yusr_test')
  })

  it('preserves validation errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      message: 'The given data was invalid.',
      errors: { title: ['This field is required.'] },
    }, 422))
    const posts = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock }).db.collection('posts')

    const error = await posts.create({}).catch(value => value)
    expect(error).toBeInstanceOf(YhubError)
    expect(error.status).toBe(422)
    expect(error.errors).toEqual({ title: ['This field is required.'] })
  })

  it('caches metadata and gracefully infers database support after a 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Not found.' }, 404))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })

    await expect(client.meta()).resolves.toMatchObject({ inferred: true, features: { database: true } })
    await client.meta()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uploads, lists, resolves URLs, and deletes runtime files', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'file_1', name: 'avatar.png', size: 4, visibility: 'public' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'file_1', name: 'avatar.png' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
    const file = await client.files.upload(new Blob(['test'], { type: 'image/png' }), {
      visibility: 'public',
      metadata: { source: 'test' },
    })

    expect(file.id).toBe('file_1')
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData)
    await expect(client.files.list()).resolves.toHaveLength(1)
    await expect(client.files.url('file_1')).resolves.toBe('https://demo.yhub.net/api/files/file_1/download')
    await expect(client.files.delete('file_1')).resolves.toBeUndefined()
  })

  it('reports browser upload progress through XMLHttpRequest', async () => {
    const OriginalXHR = globalThis.XMLHttpRequest
    class MockXHR {
      upload = { onprogress: (_event: ProgressEvent): void => {} }
      status = 201
      responseText = JSON.stringify({ data: { id: 'file_progress', name: 'file.txt' } })
      open(): void {}
      setRequestHeader(): void {}
      send(): void {
        this.upload.onprogress({ loaded: 5, total: 10, lengthComputable: true } as ProgressEvent)
        queueMicrotask(() => this.onload?.())
      }
      onload?: () => void
      onerror?: () => void
    }
    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

    try {
      const progress: number[] = []
      const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
      await client.files.upload(new Blob(['test'], { type: 'text/plain' }), {
        onProgress: event => progress.push(event.percentage),
      })
      expect(progress).toEqual([50])
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      globalThis.XMLHttpRequest = OriginalXHR
    }
  })
})
