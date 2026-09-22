import type { YhubClient } from './client.js';
export interface RealtimeMember {
    id: string;
    subject: string;
}
export interface RealtimeEvent {
    from: string;
    event: string;
    payload: unknown;
}
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';
export interface RealtimeOptions {
    reconnect?: boolean;
    maxReconnectAttempts?: number;
}
export type WebSocketFactory = (url: string) => WebSocket;
export declare class RealtimeRoom {
    readonly name: string;
    private readonly client;
    private readonly createSocket;
    private readonly options;
    private socket?;
    private stopped;
    private generation;
    private attempts;
    private timer?;
    private deadline?;
    private heartbeat?;
    private maxPayload;
    private eventHandlers;
    private presenceHandlers;
    private errorHandlers;
    private statusHandlers;
    private members;
    private state;
    private resolveJoin?;
    private rejectJoin?;
    readonly presence: {
        onChange: (handler: (users: RealtimeMember[]) => void) => (() => void);
    };
    constructor(name: string, client: YhubClient, createSocket: WebSocketFactory, options: RealtimeOptions);
    start(): Promise<void>;
    on(event: string, handler: (event: RealtimeEvent) => void): () => void;
    onError(handler: (error: Error) => void): () => void;
    onStatus(handler: (status: RealtimeStatus) => void): () => void;
    send(event: string, payload: unknown): void;
    close(): void;
    private clearConnection;
    private connect;
    private fail;
    private setStatus;
    private updatePresence;
}
export declare class RealtimeClient {
    private readonly client;
    private readonly createSocket;
    constructor(client: YhubClient, createSocket?: WebSocketFactory);
    join(name: string, options?: RealtimeOptions): Promise<RealtimeRoom>;
}
