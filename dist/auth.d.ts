import type { YhubClient } from './client.js';
export type MaybePromise<T> = T | Promise<T>;
export interface TokenStore {
    get(): MaybePromise<string | null>;
    set(token: string): MaybePromise<void>;
    remove(): MaybePromise<void>;
}
export interface AuthCredentials {
    email: string;
    password: string;
}
export interface Registration extends AuthCredentials {
    name?: string;
}
export interface YhubUser {
    id: number;
    email: string | null;
    name: string | null;
    created_at: string;
    updated_at: string;
}
export interface AuthResult {
    token: string;
    user: YhubUser;
}
export declare class AuthClient {
    private readonly client;
    private readonly store;
    constructor(client: YhubClient, store?: TokenStore, initialToken?: string);
    token(): Promise<string | null>;
    register(input: Registration): Promise<AuthResult>;
    login(input: AuthCredentials): Promise<AuthResult>;
    loginWithTelegram(initData: string): Promise<AuthResult>;
    me(): Promise<YhubUser>;
    logout(): Promise<void>;
}
