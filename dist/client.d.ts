import { AuthClient, type TokenStore } from './auth.js';
import { DatabaseClient } from './db.js';
import { FeatureNamespace } from './feature.js';
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
    readonly files: FeatureNamespace;
    readonly ai: FeatureNamespace;
    readonly realtime: FeatureNamespace;
    private readonly baseUrl;
    private readonly fetcher;
    private metaRequest?;
    constructor(options?: YhubClientOptions);
    meta(): Promise<YhubMeta>;
    request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
    private readPayload;
}
export {};
