import type { Stage, Proposal, ExecutionArtifact, ItemStatus } from './schema.js';
export type GateCheckFn = (dir: string, proposal: Proposal) => string[];
export declare const STAGE_GATES: Partial<Record<Stage, GateCheckFn>>;
export declare function canArchive(dir: string, proposal: Proposal): {
    ok: boolean;
    errors: string[];
};
export declare function canAdvance(dir: string, proposal: Proposal): {
    ok: boolean;
    errors: string[];
};
export declare function nextStage(current: Stage): Stage | null;
export declare function prevStage(current: Stage): Stage | null;
export interface ItemTransitionResult {
    ok: boolean;
    error?: string;
}
export declare function canTransitionItem(exec: ExecutionArtifact, itemId: string, to: ItemStatus): ItemTransitionResult;
export type BackTarget = 'execution' | 'design' | 'analysis';
export declare function canBack(proposal: Proposal, to: BackTarget): {
    ok: boolean;
    error?: string;
};
//# sourceMappingURL=checks.d.ts.map