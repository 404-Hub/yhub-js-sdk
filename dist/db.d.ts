import type { YhubClient } from './client.js';
export type RecordId = string | number;
export type YhubRecord = Record<string, unknown>;
export type WriteResult<T extends YhubRecord = YhubRecord> = Partial<T> & {
    id: RecordId;
};
export interface ListOptions extends Record<string, number | undefined> {
    limit?: number;
    offset?: number;
}
export declare class Collection<T extends YhubRecord = YhubRecord> {
    private readonly client;
    readonly name: string;
    constructor(client: YhubClient, name: string);
    list(options?: ListOptions): Promise<T[]>;
    get(id: RecordId): Promise<T>;
    create(data: Partial<T>): Promise<WriteResult<T>>;
    update(id: RecordId, data: Partial<T>): Promise<WriteResult<T>>;
    patch(id: RecordId, data: Partial<T>): Promise<WriteResult<T>>;
    delete(id: RecordId): Promise<void>;
    private path;
}
export declare class DatabaseClient {
    private readonly client;
    constructor(client: YhubClient);
    collection<T extends YhubRecord = YhubRecord>(name: string): Collection<T>;
}
