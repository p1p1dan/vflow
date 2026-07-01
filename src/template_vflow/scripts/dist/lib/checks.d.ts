import type { Pointer, StateFile, ItemStatus, Tier, Proposal } from './schema.js';
export interface GateResult {
    ok: boolean;
    errors: string[];
}
export declare function nextPointer(current: Pointer): Pointer | null;
export declare function checkLedgerCaughtUp(dir: string, state: StateFile): GateResult;
export declare function checkGateBuild(scopeArg: string | undefined, specRefs: StateFile['spec_refs']): GateResult;
export declare function checkGateDesignReconfirm(dir: string, tier: Tier): GateResult;
export declare function checkArchiveReady(proposal: Proposal, state: StateFile | null): GateResult;
export declare const VALID_ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]>;
export interface ItemTransitionResult {
    ok: boolean;
    error?: string;
}
export declare function canTransitionItem(state: StateFile, itemId: string, to: ItemStatus): ItemTransitionResult;
//# sourceMappingURL=checks.d.ts.map