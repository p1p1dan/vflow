import type { CompletionStatus } from './ralph-schema.js';
export interface CompleteArgs {
    index: number;
    status: CompletionStatus;
    evidence?: string[];
    concerns?: string;
    reason?: string;
    task?: string;
}
/**
 * Execute the `complete` command.
 *
 * Exit codes:
 *   0 — step completed successfully
 *   1 — error (validation failure, wrong index, etc.)
 */
export declare function cmdComplete(args: CompleteArgs): number;
