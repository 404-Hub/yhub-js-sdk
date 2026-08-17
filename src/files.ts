import type { YhubClient } from './client.js'

export interface YhubFile {
  id: string
  name: string
  size: number
  mime_type: string
  visibility: 'public' | 'private'
  metadata: Record<string, unknown>
  url: string
  created_at: string
}

export interface FileUploadOptions {
  visibility?: 'public' | 'private'
  metadata?: Record<string, unknown>
  onProgress?: (progress: FileUploadProgress) => void
}

export interface FileUploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface FileListOptions extends Record<string, number | undefined> {
  limit?: number
  offset?: number
}

export class FilesClient {
  constructor(private readonly client: YhubClient) {}

  async upload(file: Blob, options: FileUploadOptions = {}): Promise<YhubFile> {
    const form = new FormData()
    const fileName = typeof File !== 'undefined' && file instanceof File ? file.name : 'file'
    form.append('file', file, fileName)
    if (options.visibility) form.append('visibility', options.visibility)
    if (options.metadata) form.append('metadata', JSON.stringify(options.metadata))
    const response = await this.client.requestFormData<{ data: YhubFile }>('POST', '/files', form, options.onProgress)
    return response.data
  }

  async list(options: FileListOptions = {}): Promise<YhubFile[]> {
    const response = await this.client.request<{ data: YhubFile[] }>('GET', '/files', { query: options })
    return response.data
  }

  async get(id: string): Promise<YhubFile> {
    const response = await this.client.request<{ data: YhubFile }>('GET', this.path(id))
    return response.data
  }

  async url(id: string): Promise<string> {
    return this.client.absoluteUrl(`${this.path(id)}/download`)
  }

  async delete(id: string): Promise<void> {
    await this.client.request<void>('DELETE', this.path(id))
  }

  private path(id: string): string {
    return `/files/${encodeURIComponent(id)}`
  }
}
