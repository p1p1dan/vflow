/**
 * Run a list of named checks against a task directory.
 * Returns array of failure messages (empty = all passed).
 */
export declare function runCompletionChecks(checkNames: string[], taskDir: string): string[];
