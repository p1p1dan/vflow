import type { Proposal, RepoIndex, RepoIndexEntry, StateFile, StateItem, ItemStatus } from './schema.js';
export declare function nextProposalId(): string;
export declare function proposalDir(id: string, slug: string): string;
export declare function findProposalDir(id: string): string | null;
export declare function readProposal(dir: string): Proposal | null;
export declare function writeProposal(dir: string, proposal: Proposal): void;
export declare function readState(dir: string): StateFile | null;
export declare function writeState(dir: string, state: StateFile): void;
export declare function initLedger(dir: string, id: string, title: string): void;
export declare function readLedgerText(dir: string): string;
export interface LedgerTransitionEntry {
    ts: string;
    from: string;
    to: string;
    satisfied: string;
}
export declare function parseLedgerTransitions(dir: string): LedgerTransitionEntry[];
export declare function lastLedgerTransition(dir: string): LedgerTransitionEntry | null;
export declare function lastDecideRelatedTransition(dir: string): LedgerTransitionEntry | null;
export declare function readRepoIndex(): RepoIndex;
export declare function writeRepoIndex(index: RepoIndex): void;
export declare function upsertRepoIndex(entry: RepoIndexEntry): void;
export declare function removeFromIndex(id: string): void;
export declare function activeItem(state: StateFile): StateItem | null;
export declare function findItem(state: StateFile, itemId: string): StateItem | null;
export declare function setItemStatus(state: StateFile, itemId: string, status: ItemStatus): StateItem | null;
//# sourceMappingURL=store.d.ts.map