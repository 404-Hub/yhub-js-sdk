import type { YhubClient } from './client.js';
export type AiRole = 'system' | 'user' | 'assistant';
export interface AiMessage {
    role: AiRole;
    content: string;
}
export interface AiChatOptions {
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
}
export interface AiModel {
    id: string;
}
export interface AiChatResult {
    id: string | null;
    model: string;
    message: AiMessage;
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
}
export interface AiUsage {
    period_start: string | null;
    period_end: string | null;
    requests: number;
    request_budget: number;
    input_tokens: number;
    output_tokens: number;
    tokens: number;
    token_budget: number;
}
export declare class AiClient {
    private readonly client;
    constructor(client: YhubClient);
    models(): Promise<AiModel[]>;
    chat(messages: AiMessage[], options?: AiChatOptions): Promise<AiChatResult>;
    usage(): Promise<AiUsage>;
}
