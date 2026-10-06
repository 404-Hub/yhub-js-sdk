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
export type AccessAction = 'read' | 'create' | 'update' | 'delete';
export type AccessScope = 'owner' | 'all';
export type AccessGrant = {
    entity: string;
} & ({
    action: 'create';
    scope?: never;
} | {
    action: Exclude<AccessAction, 'create'>;
    scope: AccessScope;
});
export interface YhubUser {
    id: number;
    email: string | null;
    name: string | null;
    created_at: string;
    updated_at: string;
    roles?: string[];
    permissions?: AccessGrant[];
}
export interface AuthResult {
    token: string;
    user: YhubUser;
}
export declare class AuthClient {
    private readonly client;
    private readonly store;
    private readonly initialization;
    private profile;
    private generation;
    private tokenMutation;
    constructor(client: YhubClient, store?: TokenStore, initialToken?: string);
    get rolesSupported(): boolean;
    can(entity: string, action: AccessAction, scope?: AccessScope): boolean;
    private persistToken;
    token(): Promise<string | null>;
    register(input: Registration): Promise<AuthResult>;
    login(input: AuthCredentials): Promise<AuthResult>;
    loginWithTelegram(initData: string): Promise<AuthResult>;
    me(): Promise<YhubUser>;
    logout(): Promise<void>;
}
