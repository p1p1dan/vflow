// ralph-schema.ts — Step execution model types (adapted from maestro-flow ralph).
// -- Step completion status --
export const VALID_COMPLETION_STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_RETRY', 'BLOCKED'];
export const STEP_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed'];
// -- Factory --
export function createStep(index, nodeId, nodeType, skill, description, requiredReading = [], completionChecks = []) {
    return {
        index,
        node_id: nodeId,
        node_type: nodeType,
        skill,
        description,
        required_reading: requiredReading,
        completion_checks: completionChecks,
        status: 'pending',
        completion_confirmed: false,
        completion_status: null,
        completion_evidence: null,
        concerns: null,
        retried: false,
        load: null,
        started_at: null,
        completed_at: null,
    };
}
