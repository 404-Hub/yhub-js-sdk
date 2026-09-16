import type { YhubClient } from './client.js'

export type MaybePromise<T> = T | Promise<T>

export interface TokenStore {
  get(): MaybePromise<string | null>
  set(token: string): MaybePromise<void>
  remove(): MaybePromise<void>
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface Registration extends AuthCredentials {
  name?: string
}

export interface YhubUser {
  id: number
  email: string | null
  name: string | null
  created_at: string
  updated_at: string
}

export interface AuthResult {
  token: string
  user: YhubUser
}

class MemoryTokenStore implements TokenStore {
  constructor(private value: string | null = null) {}

  get(): string | null { return this.value }
  set(token: string): void { this.value = token }
  remove(): void { this.value = null }
}

class LocalStorageTokenStore implements TokenStore {
  constructor(private readonly key = 'yhub.auth.token') {}

  get(): string | null { return window.localStorage.getItem(this.key) }
  set(token: string): void { window.localStorage.setItem(this.key, token) }
  remove(): void { window.localStorage.removeItem(this.key) }
}

class ResilientTokenStore implements TokenStore {
  private readonly fallback = new MemoryTokenStore()
  private primaryAvailable = true

  constructor(private readonly primary: TokenStore) {}

  async get(): Promise<string | null> {
    if (!this.primaryAvailable) {
      return this.fallback.get()
    }

    try {
      const token = await this.primary.get()

      if (token) {
        this.fallback.set(token)
      } else {
        this.fallback.remove()
      }

      return token
    } catch {
      this.primaryAvailable = false
      return this.fallback.get()
    }
  }

  async set(token: string): Promise<void> {
    if (this.primaryAvailable) {
      try {
        await this.primary.set(token)
      } catch {
        this.primaryAvailable = false
      }
    }

    this.fallback.set(token)
  }

  async remove(): Promise<void> {
    if (this.primaryAvailable) {
      try {
        await this.primary.remove()
      } catch {
        this.primaryAvailable = false
      }
    }

    this.fallback.remove()
  }
}

const defaultTokenStore = (): TokenStore => {
  if (typeof window === 'undefined') {
    return new MemoryTokenStore()
  }

  try {
    const storage = window.localStorage

    if (!storage) {
      return new MemoryTokenStore()
    }

    return new ResilientTokenStore(new LocalStorageTokenStore())
  } catch {
    return new MemoryTokenStore()
  }
}

export class AuthClient {
  private readonly store: TokenStore
  private readonly initialization: Promise<void>

  constructor(
    private readonly client: YhubClient,
    store?: TokenStore,
    initialToken?: string,
  ) {
    this.store = store ?? defaultTokenStore()
    this.initialization = Promise.resolve().then(async () => {
      if (initialToken) {
        await this.store.set(initialToken)
      }
    })
    void this.initialization.catch(() => undefined)
  }

  async token(): Promise<string | null> {
    await this.initialization

    return this.store.get()
  }

  async register(input: Registration): Promise<AuthResult> {
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/register', { body: input, token: null })
    await this.store.set(result.token)
    return result
  }

  async login(input: AuthCredentials): Promise<AuthResult> {
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/login', { body: input, token: null })
    await this.store.set(result.token)
    return result
  }

  async loginWithTelegram(initData: string): Promise<AuthResult> {
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/telegram', {
      body: { init_data: initData },
      token: null,
    })
    await this.store.set(result.token)
    return result
  }

  async me(): Promise<YhubUser> {
    await this.initialization
    const result = await this.client.request<{ user: YhubUser }>('GET', '/auth/me')
    return result.user
  }

  async logout(): Promise<void> {
    await this.initialization

    try {
      await this.client.request<void>('POST', '/auth/logout')
    } finally {
      await this.store.remove()
    }
  }
}
