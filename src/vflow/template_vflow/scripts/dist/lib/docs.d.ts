/** Returns true if the task uses the v2 document model (task-spec.md). */
export declare function isV2Docs(taskDir: string): boolean;
/** Resolve the primary design document path. v2: task-spec.md, v1: design.md / plan.md. */
export declare function designPath(taskDir: string): string;
/** Resolve the requirement source path. v2: task-spec.md, v1: requirement.md. */
export declare function requirementPath(taskDir: string): string;
/** Resolve the verification/ledger path. v2: ledger.md, v1: verify.md. */
export declare function verifyPath(taskDir: string): string;
/** Resolve the worklog source path. v2: ledger.md §1, v1: worklog.md. */
export declare function worklogPath(taskDir: string): string;
export declare function isFilled(path: string): boolean;
/** Extract unchecked items. v2: from task-spec.md §6, v1: from design.md. */
export declare function uncheckedItems(taskDir: string): string[];
/** Extract file paths from worklog table. v2: ledger.md §1, v1: worklog.md. */
export declare function worklogFiles(taskDir: string): string[];
export declare function latestWorklogMtime(taskDir: string, projectRoot: string): number;
/** Parse a §N section from a markdown file. Returns the body text between §N and the next ## heading. */
export declare function parseSection(filePath: string, sectionNo: number): string;
