/**
 * Execute the `next` command.
 *
 * Exit codes:
 *   0 — step loaded, prompt written to stdout
 *   2 — no pending steps (all done)
 *   3 — active_step_index occupied (a step is already running)
 *   1 — error
 */
export declare function cmdNext(taskSlug?: string): number;
