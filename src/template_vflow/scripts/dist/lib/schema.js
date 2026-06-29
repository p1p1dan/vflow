// schema.ts — Pure types and enums for the vflow2 proposal system.
export const STAGES = [
    'intake', 'analysis', 'design', 'plan', 'execution',
    'verify', 'pending_acceptance', 'done', 'archived',
];
export const LIFECYCLE = [
    'active', 'blocked', 'on_hold', 'done', 'archived', 'cancelled',
];
export const PROPOSAL_TYPES = ['bug', 'feature', 'refactor', 'reference_build'];
export const TIERS = ['T0', 'T1', 'T2', 'T3'];
export const ITEM_STATUSES = ['todo', 'doing', 'blocked', 'done', 'cancelled'];
//# sourceMappingURL=schema.js.map