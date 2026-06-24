export type TaskSource = 'session' | 'session-fallback' | 'last-active' | 'pointer' | 'none';
export declare function resolveSessionKey(payload?: Record<string, unknown>): string | null;
export declare function sessionFilePath(sessionKey: string): string;
export declare function writeLastActiveSession(sessionKey: string): void;
export declare function readLastActiveSession(): string | null;
export declare function resolveCliSessionKey(): string | null;
export declare function readSessionBinding(sessionKey: string): string | null;
export declare function writeSessionBinding(sessionKey: string, taskSlug: string): void;
export declare function clearSessionBinding(sessionKey: string): void;
export declare function listSessionFiles(): string[];
export declare function clearTaskFromSessions(taskSlug: string): number;
export declare function resolveCurrentTaskSlug(payload: Record<string, unknown> | undefined, pointerFallback: () => string | null): {
    slug: string | null;
    source: TaskSource;
};
export declare function resolveCliTaskSlug(pointerFallback: () => string | null): {
    slug: string | null;
    source: TaskSource;
};
