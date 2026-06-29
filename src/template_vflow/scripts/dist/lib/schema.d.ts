export declare const STAGES: readonly ["intake", "analysis", "design", "plan", "execution", "verify", "pending_acceptance", "done", "archived"];
export type Stage = typeof STAGES[number];
export declare const LIFECYCLE: readonly ["active", "blocked", "on_hold", "done", "archived", "cancelled"];
export type LifecycleStatus = typeof LIFECYCLE[number];
export declare const PROPOSAL_TYPES: readonly ["bug", "feature", "refactor", "reference_build"];
export type ProposalType = typeof PROPOSAL_TYPES[number];
export declare const TIERS: readonly ["T0", "T1", "T2", "T3"];
export type Tier = typeof TIERS[number];
export declare const ITEM_STATUSES: readonly ["todo", "doing", "blocked", "done", "cancelled"];
export type ItemStatus = typeof ITEM_STATUSES[number];
export interface Blocking {
    status: 'blocked' | 'none';
    type?: string;
    reason?: string;
    since?: string;
}
export interface Workspace {
    isolate_intent: boolean;
    branch: string | null;
}
export interface Proposal {
    id: string;
    title: string;
    slug: string;
    stage: Stage;
    lifecycle_status: LifecycleStatus;
    blocking: Blocking;
    tier: Tier;
    type: ProposalType;
    workspace?: Workspace;
    created_at: string;
    updated_at: string;
    summary?: string;
    knowledge_processed?: boolean;
    schema_version: 1;
}
export interface ExecutionItem {
    id: string;
    title: string;
    status: ItemStatus;
    depends_on: string[];
    evidence: string[];
    note?: string;
}
export interface ExecutionArtifact {
    items: ExecutionItem[];
}
export interface VerifyCheck {
    id: string;
    description: string;
    gating: boolean;
}
export interface VerifyPlan {
    checks: VerifyCheck[];
    evidence_required: string[];
}
export interface VerifyResult {
    id: string;
    passed: boolean;
    evidence: string;
    waiver?: string;
}
export interface VerifyArtifact {
    results: VerifyResult[];
    all_gating_passed: boolean;
    verify_round?: number;
}
export interface AnalysisArtifact {
    problem: string;
    scope: string;
    constraints: string[];
    investigation: string;
}
export interface DesignDecision {
    id: string;
    decision: string;
    rationale: string;
    tradeoffs: string;
}
export interface DesignArtifact {
    decisions: DesignDecision[];
}
export interface PlanArtifact {
    execution_outline: string;
    verify_plan: VerifyPlan;
}
export type EventType = 'proposal_created' | 'stage_changed' | 'lifecycle_changed' | 'blocking_changed' | 'tier_changed' | 'type_changed' | 'item_added' | 'item_status_changed' | 'item_cancelled' | 'plan_adjusted' | 'user_confirmation' | 'waiver_granted' | 'verify_completed' | 'acceptance' | 'archived' | 'knowledge_saved' | 'verify_result_recorded' | 'gate_bypassed' | 'design_confirmed';
export interface VflowEvent {
    ts: string;
    type: EventType;
    from?: string;
    to?: string;
    item_id?: string;
    detail?: string;
    verify_round?: number;
}
export interface SessionRuntime {
    session_id: string;
    active_proposal_id: string | null;
    active_execution_item_id: string | null;
    pending_user_confirmation: boolean;
    last_seen_at: string;
}
export interface RepoIndexEntry {
    id: string;
    slug: string;
    dir: string;
    title: string;
    stage: Stage;
    lifecycle_status: LifecycleStatus;
    type: ProposalType;
    updated_at: string;
}
export interface RepoIndex {
    schema_version: 1;
    proposals: RepoIndexEntry[];
}
//# sourceMappingURL=schema.d.ts.map