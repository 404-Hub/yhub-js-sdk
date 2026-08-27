import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelegramWebApp } from '../src/index.js'
import { YhubClient } from '../src/index.js'

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

const setWebApp = (webApp?: TelegramWebApp): void => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: webApp ? { Telegram: { WebApp: webApp } } : undefined,
  })
}

const createWebApp = (overrides: Partial<TelegramWebApp> = {}) => {
  const listeners = new Map<string, Set<() => void>>()
  const webApp: TelegramWebApp = {
    initData: 'user=%7B%22id%22%3A7%7D&hash=signature',
    isActive: true,
    isFullscreen: false,
    themeParams: { bg_color: '#ffffff' },
    safeAreaInset: { top: 1, bottom: 2, left: 3, right: 4 },
    contentSafeAreaInset: { top: 5, bottom: 6, left: 7, right: 8 },
    ready: vi.fn(),
    expand: vi.fn(),
    requestFullscreen: vi.fn(() => { webApp.isFullscreen = true }),
    onEvent: vi.fn((event: string, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? new Set<() => void>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
    }),
    offEvent: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
    ...overrides,
  }

  return {
    webApp,
    emit(event: string): void {
      for (const listener of listeners.get(event) ?? []) {
        listener()
      }
    },
  }
}

describe('TelegramClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => fetchMock.mockReset())
  afterEach(() => setWebApp())

  it('returns not_available without creating a user outside Telegram', async () => {
    setWebApp()
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })

    await expect(client.telegram.start()).resolves.toMatchObject({
      available: false,
      authenticated: false,
      status: 'not_available',
      fullscreen: false,
      fullscreenSupported: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('initializes Telegram, authenticates with raw init data, and stores the app-user token', async () => {
    const telegram = createWebApp()
    const tokens = { value: null as string | null, get: () => tokens.value, set: (token: string) => { tokens.value = token }, remove: () => { tokens.value = null } }
    setWebApp(telegram.webApp)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock, tokenStore: tokens })

    await expect(client.telegram.start({ fullscreen: true })).resolves.toMatchObject({
      available: true,
      authenticated: true,
      status: 'authenticated',
      auth: { token: 'yusr_telegram' },
      fullscreen: true,
      fullscreenSupported: true,
    })
    await client.db.collection('progress').list()

    expect(telegram.webApp.ready).toHaveBeenCalledOnce()
    expect(telegram.webApp.expand).toHaveBeenCalledOnce()
    expect(telegram.webApp.requestFullscreen).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ init_data: telegram.webApp.initData })
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer yusr_telegram')
  })

  it('keeps an older Telegram client running when fullscreen is unavailable', async () => {
    const telegram = createWebApp({ requestFullscreen: undefined })
    setWebApp(telegram.webApp)
    fetchMock.mockResolvedValue(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })

    await expect(client.telegram.start({ fullscreen: true })).resolves.toMatchObject({
      authenticated: true,
      fullscreen: false,
      fullscreenSupported: false,
    })
  })

  it('reflects Telegram state changes and removes listeners on dispose', async () => {
    const telegram = createWebApp()
    setWebApp(telegram.webApp)
    fetchMock.mockResolvedValue(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
    const onThemeChanged = vi.fn()
    const onSafeAreaChanged = vi.fn()
    client.telegram.on('theme_changed', onThemeChanged)
    client.telegram.on('safe_area_changed', onSafeAreaChanged)

    await client.telegram.start()
    telegram.webApp.themeParams = { bg_color: '#000000' }
    telegram.webApp.safeAreaInset = { top: 10, bottom: 20, left: 30, right: 40 }
    telegram.emit('themeChanged')
    telegram.emit('safeAreaChanged')

    expect(client.telegram.themeParams).toEqual({ bg_color: '#000000' })
    expect(client.telegram.safeAreaInset).toEqual({ top: 10, bottom: 20, left: 30, right: 40 })
    expect(onThemeChanged).toHaveBeenCalledOnce()
    expect(onSafeAreaChanged).toHaveBeenCalledOnce()

    client.telegram.dispose()
    client.telegram.dispose()
    telegram.emit('themeChanged')

    expect(telegram.webApp.offEvent).toHaveBeenCalledTimes(5)
    expect(onThemeChanged).toHaveBeenCalledOnce()
  })

  it('does not duplicate Telegram callbacks when start is repeated', async () => {
    const telegram = createWebApp()
    setWebApp(telegram.webApp)
    fetchMock.mockResolvedValue(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
    const onActivated = vi.fn()
    client.telegram.on('activated', onActivated)

    await client.telegram.start()
    await client.telegram.start()
    telegram.emit('activated')

    expect(onActivated).toHaveBeenCalledOnce()
    expect(telegram.webApp.offEvent).toHaveBeenCalledTimes(5)
  })

  it('does not register lifecycle callbacks when the bridge cannot remove them', async () => {
    const telegram = createWebApp({ offEvent: undefined })
    setWebApp(telegram.webApp)
    fetchMock.mockResolvedValue(jsonResponse({ token: 'yusr_telegram', user: { id: 7, email: null } }))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
    const onActivated = vi.fn()
    client.telegram.on('activated', onActivated)

    await client.telegram.start()
    await client.telegram.start()
    telegram.emit('activated')
    client.telegram.dispose()

    expect(telegram.webApp.onEvent).not.toHaveBeenCalled()
    expect(onActivated).not.toHaveBeenCalled()
  })

  it('does not expose raw init data after a failed login', async () => {
    const telegram = createWebApp({ initData: 'user=secret-profile&hash=secret-hash' })
    setWebApp(telegram.webApp)
    fetchMock.mockResolvedValue(jsonResponse({ message: telegram.webApp.initData }, 401))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })

    const session = await client.telegram.start()

    expect(session).toMatchObject({ authenticated: false, status: 'login_failed' })
    expect(JSON.stringify(session)).not.toContain(telegram.webApp.initData)
  })
})
