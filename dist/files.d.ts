import type { YhubClient } from './client.js';
export interface YhubFile {
    id: string;
    name: string;
    size: number;
    mime_type: string;
    visibility: 'public' | 'private';
    metadata: Record<string, unknown>;
    url: string;
    created_at: string;
}
export interface FileUploadOptions {
    visibility?: 'public' | 'private';
    metadata?: Record<string, unknown>;
    onProgress?: (progress: FileUploadProgress) => void;
}
export interface FileUploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}
export interface FileListOptions extends Record<string, number | undefined> {
    limit?: number;
    offset?: number;
}
export declare class FilesClient {
    private readonly client;
    constructor(client: YhubClient);
    upload(file: Blob, options?: FileUploadOptions): Promise<YhubFile>;
    list(options?: FileListOptions): Promise<YhubFile[]>;
    get(id: string): Promise<YhubFile>;
    url(id: string): Promise<string>;
    delete(id: string): Promise<void>;
    private path;
}
