import type { AuthResult } from './auth.js'
import type { YhubClient } from './client.js'

export interface TelegramInsets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface TelegramWebApp {
  initData: string
  isFullscreen?: boolean
  isActive?: boolean
  themeParams?: Readonly<Record<string, string>>
  safeAreaInset?: TelegramInsets
  contentSafeAreaInset?: TelegramInsets
  ready?(): void
  expand?(): void
  requestFullscreen?(): void | Promise<void>
  onEvent?(event: TelegramWebAppEvent, listener: () => void): void
  offEvent?(event: TelegramWebAppEvent, listener: () => void): void
}

export type TelegramWebAppEvent =
  | 'activated'
  | 'contentSafeAreaChanged'
  | 'fullscreenChanged'
  | 'safeAreaChanged'
  | 'themeChanged'

export type TelegramLifecycleEvent =
  | 'activated'
  | 'content_safe_area_changed'
  | 'fullscreen_changed'
  | 'safe_area_changed'
  | 'theme_changed'

export type TelegramSessionStatus = 'authenticated' | 'login_failed' | 'missing_init_data' | 'not_available'

export interface TelegramSession {
  available: boolean
  authenticated: boolean
  status: TelegramSessionStatus
  auth?: AuthResult
  fullscreen: boolean
  fullscreenSupported: boolean
}

export interface TelegramStartOptions {
  fullscreen?: boolean
}

type TelegramWindow = Window & typeof globalThis & {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

const emptyInsets = (): TelegramInsets => ({ top: 0, bottom: 0, left: 0, right: 0 })

export class TelegramClient {
  private readonly listeners = new Map<TelegramLifecycleEvent, Set<() => void>>()
  private readonly webAppListeners: Array<[TelegramWebAppEvent, () => void]> = []
  private activeWebApp?: TelegramWebApp

  constructor(private readonly client: YhubClient) {}

  get isAvailable(): boolean {
    return this.webApp() !== undefined
  }

  get themeParams(): Readonly<Record<string, string>> {
    return this.webApp()?.themeParams ?? {}
  }

  get safeAreaInset(): TelegramInsets {
    return this.webApp()?.safeAreaInset ?? emptyInsets()
  }

  get contentSafeAreaInset(): TelegramInsets {
    return this.webApp()?.contentSafeAreaInset ?? emptyInsets()
  }

  get isFullscreen(): boolean {
    return this.webApp()?.isFullscreen === true
  }

  get isActive(): boolean {
    return this.webApp()?.isActive === true
  }

  on(event: TelegramLifecycleEvent, listener: () => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(event, listeners)

    return () => {
      listeners.delete(listener)

      if (listeners.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  async start(options: TelegramStartOptions = {}): Promise<TelegramSession> {
    const webApp = this.webApp()

    if (!webApp) {
      this.detachWebAppListeners()

      return this.session('not_available', false, undefined, false)
    }

    this.detachWebAppListeners()
    this.activeWebApp = webApp
    this.attachWebAppListeners(webApp)
    webApp.ready?.()
    webApp.expand?.()

    const fullscreenSupported = typeof webApp.requestFullscreen === 'function'

    if (options.fullscreen && fullscreenSupported) {
      try {
        await webApp.requestFullscreen?.()
      } catch {
      }
    }

    if (!webApp.initData) {
      return this.session('missing_init_data', false, undefined, fullscreenSupported)
    }

    try {
      const auth = await this.client.auth.loginWithTelegram(webApp.initData)

      return this.session('authenticated', true, auth, fullscreenSupported)
    } catch {
      return this.session('login_failed', false, undefined, fullscreenSupported)
    }
  }

  dispose(): void {
    this.detachWebAppListeners()
    this.listeners.clear()
  }

  private session(
    status: TelegramSessionStatus,
    authenticated: boolean,
    auth: AuthResult | undefined,
    fullscreenSupported: boolean,
  ): TelegramSession {
    return {
      available: status !== 'not_available',
      authenticated,
      status,
      ...(auth ? { auth } : {}),
      fullscreen: this.isFullscreen,
      fullscreenSupported,
    }
  }

  private webApp(): TelegramWebApp | undefined {
    if (typeof window === 'undefined') {
      return undefined
    }

    return (window as TelegramWindow).Telegram?.WebApp
  }

  private attachWebAppListeners(webApp: TelegramWebApp): void {
    if (!webApp.onEvent || !webApp.offEvent) {
      return
    }

    const events: Array<[TelegramWebAppEvent, TelegramLifecycleEvent]> = [
      ['activated', 'activated'],
      ['contentSafeAreaChanged', 'content_safe_area_changed'],
      ['fullscreenChanged', 'fullscreen_changed'],
      ['safeAreaChanged', 'safe_area_changed'],
      ['themeChanged', 'theme_changed'],
    ]

    for (const [webAppEvent, lifecycleEvent] of events) {
      const listener = (): void => this.notify(lifecycleEvent)
      webApp.onEvent(webAppEvent, listener)
      this.webAppListeners.push([webAppEvent, listener])
    }
  }

  private detachWebAppListeners(): void {
    if (this.activeWebApp?.offEvent) {
      for (const [event, listener] of this.webAppListeners) {
        this.activeWebApp.offEvent(event, listener)
      }
    }

    this.webAppListeners.length = 0
    this.activeWebApp = undefined
  }

  private notify(event: TelegramLifecycleEvent): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener()
    }
  }
}
