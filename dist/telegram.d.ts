import type { AuthResult } from './auth.js';
import type { YhubClient } from './client.js';
export interface TelegramInsets {
    top: number;
    bottom: number;
    left: number;
    right: number;
}
export interface TelegramWebApp {
    initData: string;
    isFullscreen?: boolean;
    isActive?: boolean;
    themeParams?: Readonly<Record<string, string>>;
    safeAreaInset?: TelegramInsets;
    contentSafeAreaInset?: TelegramInsets;
    ready?(): void;
    expand?(): void;
    requestFullscreen?(): void | Promise<void>;
    onEvent?(event: TelegramWebAppEvent, listener: () => void): void;
    offEvent?(event: TelegramWebAppEvent, listener: () => void): void;
}
export type TelegramWebAppEvent = 'activated' | 'contentSafeAreaChanged' | 'fullscreenChanged' | 'safeAreaChanged' | 'themeChanged';
export type TelegramLifecycleEvent = 'activated' | 'content_safe_area_changed' | 'fullscreen_changed' | 'safe_area_changed' | 'theme_changed';
export type TelegramSessionStatus = 'authenticated' | 'login_failed' | 'missing_init_data' | 'not_available';
export interface TelegramSession {
    available: boolean;
    authenticated: boolean;
    status: TelegramSessionStatus;
    auth?: AuthResult;
    fullscreen: boolean;
    fullscreenSupported: boolean;
}
export interface TelegramStartOptions {
    fullscreen?: boolean;
}
export declare class TelegramClient {
    private readonly client;
    private readonly listeners;
    private readonly webAppListeners;
    private activeWebApp?;
    constructor(client: YhubClient);
    get isAvailable(): boolean;
    get themeParams(): Readonly<Record<string, string>>;
    get safeAreaInset(): TelegramInsets;
    get contentSafeAreaInset(): TelegramInsets;
    get isFullscreen(): boolean;
    get isActive(): boolean;
    on(event: TelegramLifecycleEvent, listener: () => void): () => void;
    start(options?: TelegramStartOptions): Promise<TelegramSession>;
    dispose(): void;
    private session;
    private webApp;
    private attachWebAppListeners;
    private detachWebAppListeners;
    private notify;
}
