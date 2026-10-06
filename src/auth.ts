import type { YhubClient } from './client.js'
import { YhubError } from './error.js'

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

export type AccessAction = 'read' | 'create' | 'update' | 'delete'
export type AccessScope = 'owner' | 'all'
export type AccessGrant = { entity: string } & (
  { action: 'create'; scope?: never } |
  { action: Exclude<AccessAction, 'create'>; scope: AccessScope }
)

export interface YhubUser {
  id: number
  email: string | null
  name: string | null
  created_at: string
  updated_at: string
  roles?: string[]
  permissions?: AccessGrant[]
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
  private profile: YhubUser | null = null
  private generation = 0
  private tokenMutation: Promise<void> = Promise.resolve()

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

  get rolesSupported(): boolean {
    return Array.isArray(this.profile?.roles) && Array.isArray(this.profile?.permissions)
  }

  can(entity: string, action: AccessAction, scope?: AccessScope): boolean {
    if (!this.rolesSupported) return false
    return this.profile!.permissions!.some(grant => grant.entity === entity && grant.action === action && (
      scope === undefined || (grant.action !== 'create' && (grant.scope === 'all' || grant.scope === scope))
    ))
  }

  private async persistToken(generation: number, token: string | null): Promise<void> {
    const mutation = this.tokenMutation.then(async () => {
      if (generation !== this.generation) return
      if (token === null) await this.store.remove()
      else await this.store.set(token)
    })
    this.tokenMutation = mutation.catch(() => undefined)
    await mutation
  }

  async token(): Promise<string | null> {
    await this.initialization

    return this.store.get()
  }

  async register(input: Registration): Promise<AuthResult> {
    const generation = ++this.generation
    this.profile = null
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/register', { body: input, token: null })
    await this.persistToken(generation, result.token)
    if (generation === this.generation) this.profile = result.user
    return result
  }

  async login(input: AuthCredentials): Promise<AuthResult> {
    const generation = ++this.generation
    this.profile = null
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/login', { body: input, token: null })
    await this.persistToken(generation, result.token)
    if (generation === this.generation) this.profile = result.user
    return result
  }

  async loginWithTelegram(initData: string): Promise<AuthResult> {
    const generation = ++this.generation
    this.profile = null
    await this.initialization
    const result = await this.client.request<AuthResult>('POST', '/auth/telegram', {
      body: { init_data: initData },
      token: null,
    })
    await this.persistToken(generation, result.token)
    if (generation === this.generation) this.profile = result.user
    return result
  }

  async me(): Promise<YhubUser> {
    const generation = this.generation
    await this.initialization
    try {
      const result = await this.client.request<{ user: YhubUser }>('GET', '/auth/me')
      if (generation === this.generation) this.profile = result.user
      return result.user
    } catch (error) {
      if (error instanceof YhubError && error.status === 401 && generation === this.generation) this.profile = null
      throw error
    }
  }

  async logout(): Promise<void> {
    const generation = ++this.generation
    this.profile = null
    await this.initialization

    try {
      const token = await this.token()
      if (generation !== this.generation) return
      await this.client.request<void>('POST', '/auth/logout', { token })
    } finally {
      await this.persistToken(generation, null)
    }
  }
}
