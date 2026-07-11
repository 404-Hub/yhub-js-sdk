import { AuthClient, type TokenStore } from './auth.js'
import { DatabaseClient } from './db.js'
import { YhubError } from './error.js'
import { FeatureNamespace } from './feature.js'

export const SDK_VERSION = '1.0.0'

export interface YhubMeta {
  site?: string
  features: {
    database: boolean
    auth: boolean
    files: boolean
    ai: boolean
    realtime: boolean
  }
  database: {
    entities: string[]
    max_limit?: number
  }
  inferred?: boolean
}

export interface YhubClientOptions {
  baseUrl?: string
  apiPath?: string
  token?: string
  tokenStore?: TokenStore
  fetch?: typeof fetch
}

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  token?: string | null
}

const browserOrigin = (): string =>
  typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''

export class YhubClient {
  readonly db: DatabaseClient
  readonly auth: AuthClient
  readonly files = new FeatureNamespace('files')
  readonly ai = new FeatureNamespace('ai')
  readonly realtime = new FeatureNamespace('realtime')

  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private metaRequest?: Promise<YhubMeta>

  constructor(options: YhubClientOptions = {}) {
    const origin = (options.baseUrl ?? browserOrigin()).replace(/\/$/, '')
    const apiPath = `/${(options.apiPath ?? '/api').replace(/^\/+|\/+$/g, '')}`
    this.baseUrl = `${origin}${apiPath}`
    this.fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis)

    if (!this.fetcher) {
      throw new Error('YHub SDK requires a Fetch API implementation.')
    }

    this.auth = new AuthClient(this, options.tokenStore, options.token)
    this.db = new DatabaseClient(this)
  }

  meta(): Promise<YhubMeta> {
    this.metaRequest ??= this.request<YhubMeta>('GET', '/_meta', { token: null }).catch(error => {
      if (error instanceof YhubError && error.status === 404) {
        return {
          features: { database: true, auth: false, files: false, ai: false, realtime: false },
          database: { entities: [] },
          inferred: true,
        }
      }

      this.metaRequest = undefined
      throw error
    })

    return this.metaRequest
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }

    const headers = new Headers({
      Accept: 'application/json',
      'X-YHub-SDK-Version': SDK_VERSION,
    })
    const token = options.token === undefined ? await this.auth.token() : options.token

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetcher(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    const payload = response.status === 204 ? undefined : await this.readPayload(response)

    if (!response.ok) {
      const errorPayload = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      throw new YhubError(
        typeof errorPayload.message === 'string' ? errorPayload.message : `YHub request failed with status ${response.status}.`,
        response.status,
        isValidationErrors(errorPayload.errors) ? errorPayload.errors : undefined,
      )
    }

    return payload as T
  }

  private async readPayload(response: Response): Promise<unknown> {
    const text = await response.text()

    if (!text) {
      return undefined
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new YhubError('YHub returned an invalid JSON response.', response.status)
    }
  }
}

const isValidationErrors = (value: unknown): value is Record<string, string[]> => {
  if (value === null || typeof value !== 'object') {
    return false
  }

  return Object.values(value).every(
    messages => Array.isArray(messages) && messages.every(message => typeof message === 'string'),
  )
}
