import type { YhubClient } from './client.js'

export type RecordId = string | number
export type YhubRecord = Record<string, unknown>

export interface ListOptions extends Record<string, number | undefined> {
  limit?: number
  offset?: number
}

export class Collection<T extends YhubRecord = YhubRecord> {
  constructor(private readonly client: YhubClient, readonly name: string) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new TypeError(`Invalid YHub collection name: ${name}`)
    }
  }

  async list(options: ListOptions = {}): Promise<T[]> {
    const response = await this.client.request<{ data: T[] }>('GET', `/${this.name}`, { query: options })
    return response.data
  }

  async get(id: RecordId): Promise<T> {
    const response = await this.client.request<{ data: T }>('GET', this.path(id))
    return response.data
  }

  async create(data: Partial<T>): Promise<T> {
    const response = await this.client.request<{ data: T }>('POST', `/${this.name}`, { body: data })
    return response.data
  }

  async update(id: RecordId, data: Partial<T>): Promise<T> {
    const response = await this.client.request<{ data: T }>('PUT', this.path(id), { body: data })
    return response.data
  }

  async patch(id: RecordId, data: Partial<T>): Promise<T> {
    const response = await this.client.request<{ data: T }>('PATCH', this.path(id), { body: data })
    return response.data
  }

  async delete(id: RecordId): Promise<void> {
    await this.client.request<void>('DELETE', this.path(id))
  }

  private path(id: RecordId): string {
    return `/${this.name}/${encodeURIComponent(String(id))}`
  }
}

export class DatabaseClient {
  constructor(private readonly client: YhubClient) {}

  collection<T extends YhubRecord = YhubRecord>(name: string): Collection<T> {
    return new Collection<T>(this.client, name)
  }
}
