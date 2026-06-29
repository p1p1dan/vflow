import type { SessionRuntime } from './schema.js';
export declare function resolveSessionKey(payload?: Record<string, unknown>): string | null;
export declare function writeLastActiveSession(sessionKey: string): void;
export declare function readLastActiveSession(): string | null;
export declare function sessionFilePath(sessionKey: string): string;
export declare function readSession(sessionKey: string): SessionRuntime | null;
export declare function writeSession(session: SessionRuntime): void;
export declare function bindSession(sessionKey: string, proposalId: string): void;
export declare function updateSessionExecutionItem(sessionKey: string, itemId: string | null): void;
export declare function updateSessionConfirmation(sessionKey: string, pending: boolean): void;
export declare function clearSessionBinding(sessionKey: string): void;
export declare function clearProposalFromSessions(proposalId: string): number;
export type ProposalSource = 'session' | 'session-fallback' | 'repo-single-active' | 'none';
export declare function resolveActiveProposalId(payload: Record<string, unknown> | undefined, repoFallback: () => string | null): {
    id: string | null;
    source: ProposalSource;
};
export declare function resolveCliProposalId(repoFallback: () => string | null): {
    id: string | null;
    source: ProposalSource;
};
//# sourceMappingURL=session-runtime.d.ts.map