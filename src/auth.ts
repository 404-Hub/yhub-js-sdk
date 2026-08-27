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

const defaultTokenStore = (): TokenStore =>
  typeof window !== 'undefined' && window.localStorage
    ? new LocalStorageTokenStore()
    : new MemoryTokenStore()

export class AuthClient {
  private readonly store: TokenStore

  constructor(
    private readonly client: YhubClient,
    store?: TokenStore,
    initialToken?: string,
  ) {
    this.store = store ?? defaultTokenStore()

    if (initialToken) {
      void this.store.set(initialToken)
    }
  }

  async token(): Promise<string | null> {
    return this.store.get()
  }

  async register(input: Registration): Promise<AuthResult> {
    const result = await this.client.request<AuthResult>('POST', '/auth/register', { body: input, token: null })
    await this.store.set(result.token)
    return result
  }

  async login(input: AuthCredentials): Promise<AuthResult> {
    const result = await this.client.request<AuthResult>('POST', '/auth/login', { body: input, token: null })
    await this.store.set(result.token)
    return result
  }

  async loginWithTelegram(initData: string): Promise<AuthResult> {
    const result = await this.client.request<AuthResult>('POST', '/auth/telegram', {
      body: { init_data: initData },
      token: null,
    })
    await this.store.set(result.token)
    return result
  }

  async me(): Promise<YhubUser> {
    const result = await this.client.request<{ user: YhubUser }>('GET', '/auth/me')
    return result.user
  }

  async logout(): Promise<void> {
    try {
      await this.client.request<void>('POST', '/auth/logout')
    } finally {
      await this.store.remove()
    }
  }
}
