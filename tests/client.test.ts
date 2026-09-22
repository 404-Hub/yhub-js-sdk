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
    expect(new Headers(createOptions?.headers).get('X-YHub-SDK-Version')).toBe('1.2.0')
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

  it('waits for an asynchronous initial token before the first request', async () => {
    let releaseInitialToken!: () => void
    const initialTokenReady = new Promise<void>(resolve => { releaseInitialToken = resolve })
    const tokens = {
      get: vi.fn(() => 'yusr_initial'),
      set: vi.fn((_token: string) => initialTokenReady),
      remove: vi.fn(),
    }
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    const client = new YhubClient({
      baseUrl: 'https://demo.yhub.net',
      fetch: fetchMock,
      token: 'yusr_initial',
      tokenStore: tokens,
    })

    const request = client.db.collection('posts').list()
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()

    releaseInitialToken()
    await request

    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer yusr_initial')
  })

  it('surfaces an asynchronous initial token failure', async () => {
    const initializationError = new Error('token store unavailable')
    const tokens = {
      get: vi.fn(() => null),
      set: vi.fn((_token: string) => Promise.reject(initializationError)),
      remove: vi.fn(),
    }
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, token: 'yusr_initial', tokenStore: tokens })

    await expect(client.auth.token()).rejects.toThrow(initializationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to memory when browser localStorage access is denied', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage(): never {
          throw new Error('localStorage is unavailable')
        },
      },
    })
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 1, email: 'a@example.com' } }))

    try {
      const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, token: 'yusr_memory' })

      await client.auth.me()
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer yusr_memory')
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    }
  })

  it('keeps auth usable when localStorage methods throw', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const unavailableStorage = {
      getItem(): never { throw new Error('read denied') },
      setItem(): never { throw new Error('write denied') },
      removeItem(): never { throw new Error('remove denied') },
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: unavailableStorage } })
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 1, email: 'a@example.com' } }))

    try {
      const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, token: 'yusr_memory' })

      await client.auth.me()
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer yusr_memory')
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    }
  })

  it('does not resurrect a stale storage token after access fails', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    let storageAvailable = true
    let storedToken: string | null = 'yusr_stale'
    const storage = {
      getItem(): string | null {
        if (!storageAvailable) throw new Error('read denied')
        return storedToken
      },
      setItem(_key: string, token: string): void {
        if (!storageAvailable) throw new Error('write denied')
        storedToken = token
      },
      removeItem(): void {
        if (!storageAvailable) throw new Error('remove denied')
        storedToken = null
      },
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1, email: 'a@example.com' } }))
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1, email: 'a@example.com' } }))

    try {
      const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })

      await client.auth.me()
      storageAvailable = false
      await client.auth.logout()
      await client.auth.me()

      expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBeNull()
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    }
  })

  it('exchanges Telegram init data and stores the returned app-user token', async () => {
    const tokens = { value: null as string | null, get: () => tokens.value, set: (token: string) => { tokens.value = token }, remove: () => { tokens.value = null } }
    fetchMock.mockResolvedValue(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, tokenStore: tokens })

    await expect(client.auth.loginWithTelegram('user=%7B%22id%22%3A7%7D')).resolves.toMatchObject({ token: 'yusr_telegram' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ init_data: 'user=%7B%22id%22%3A7%7D' })
    expect(tokens.value).toBe('yusr_telegram')
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

  it('lists models, sends provider-neutral chats, and reads AI usage', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'small-model' }] }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          id: 'chat_1',
          model: 'small-model',
          message: { role: 'assistant', content: 'Hello!' },
          usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { requests: 1, tokens: 6, request_budget: 100, token_budget: 10000 },
      }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, token: 'ydb_ai' })

    await expect(client.ai.models()).resolves.toEqual([{ id: 'small-model' }])
    await expect(client.ai.chat([{ role: 'user', content: 'Hi' }], { maxOutputTokens: 64 })).resolves.toMatchObject({
      message: { content: 'Hello!' },
      usage: { total_tokens: 6 },
    })
    await expect(client.ai.usage()).resolves.toMatchObject({ requests: 1, tokens: 6 })

    const [, chatOptions] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(chatOptions?.body))).toEqual({
      messages: [{ role: 'user', content: 'Hi' }],
      max_output_tokens: 64,
    })
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
