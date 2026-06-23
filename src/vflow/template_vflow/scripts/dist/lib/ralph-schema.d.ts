export declare const VALID_COMPLETION_STATUSES: readonly ["DONE", "DONE_WITH_CONCERNS", "NEEDS_RETRY", "BLOCKED"];
export type CompletionStatus = typeof VALID_COMPLETION_STATUSES[number];
export declare const STEP_STATUSES: readonly ["pending", "running", "completed", "skipped", "failed"];
export type StepStatus = typeof STEP_STATUSES[number];
export interface StepLoad {
    loaded_at: string;
    required_files: string[];
    deferred_files: string[];
}
export interface RalphStep {
    index: number;
    /** Graph node ID this step maps to */
    node_id: string;
    /** Node type: command (execute), gate (pause for user), terminal */
    node_type: 'command' | 'gate' | 'terminal';
    /** Skill name to execute (for command nodes) */
    skill: string;
    /** Human-readable description */
    description: string;
    /** Files to inline when loading this step */
    required_reading: string[];
    /** Document checks to run on completion */
    completion_checks: string[];
    status: StepStatus;
    completion_confirmed: boolean;
    completion_status: CompletionStatus | null;
    completion_evidence: string | string[] | null;
    concerns: string | null;
    retried: boolean;
    load: StepLoad | null;
    started_at: string | null;
    completed_at: string | null;
}
export interface RalphTaskFields {
    /** Ordered steps for this task */
    steps: RalphStep[];
    /** Index of the currently executing step (null = no step active) */
    active_step_index: number | null;
    /** Ralph protocol version */
    ralph_protocol_version: '1';
}
export declare function createStep(index: number, nodeId: string, nodeType: 'command' | 'gate' | 'terminal', skill: string, description: string, requiredReading?: string[], completionChecks?: string[]): RalphStep;
