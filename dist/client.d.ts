import { AuthClient, type TokenStore } from './auth.js';
import { AiClient } from './ai.js';
import { DatabaseClient } from './db.js';
import { FeatureNamespace } from './feature.js';
import { FilesClient } from './files.js';
import type { FileUploadProgress } from './files.js';
export declare const SDK_VERSION = "1.0.0";
export interface YhubMeta {
    site?: string;
    features: {
        database: boolean;
        auth: boolean;
        files: boolean;
        ai: boolean;
        realtime: boolean;
    };
    database: {
        entities: string[];
        max_limit?: number;
    };
    inferred?: boolean;
}
export interface YhubClientOptions {
    baseUrl?: string;
    apiPath?: string;
    token?: string;
    tokenStore?: TokenStore;
    fetch?: typeof fetch;
}
interface RequestOptions {
    body?: unknown;
    query?: Record<string, string | number | boolean | null | undefined>;
    token?: string | null;
}
export declare class YhubClient {
    readonly db: DatabaseClient;
    readonly auth: AuthClient;
    readonly files: FilesClient;
    readonly ai: AiClient;
    readonly realtime: FeatureNamespace;
    private readonly baseUrl;
    private readonly fetcher;
    private metaRequest?;
    constructor(options?: YhubClientOptions);
    meta(): Promise<YhubMeta>;
    request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
    requestFormData<T>(method: string, path: string, body: FormData, onProgress?: (progress: FileUploadProgress) => void): Promise<T>;
    private requestFormDataWithXhr;
    absoluteUrl(path: string): string;
    private readPayload;
}
export {};
