/**
 * Expand a path reference used in required_reading.
 *
 * Supported prefixes:
 *   @task/xxx       → current task directory / xxx
 *   @.vflow/xxx     → .vflow/ root / xxx
 *   @~/xxx          → user home / xxx
 *   @spec/xxx       → .vflow/spec/ xxx
 *   absolute path   → as-is
 *   relative path   → relative to contextDir
 */
export declare function expandPath(ref: string, taskDir: string | null, contextDir?: string): string;
export interface ResolvedReading {
    path: string;
    ref: string;
    content: string;
    exists: boolean;
}
/**
 * Resolve and load all required_reading paths for a step.
 */
export declare function resolveRequiredReading(refs: string[], taskDir: string | null): ResolvedReading[];
export interface SkillManifest {
    name: string;
    description: string;
    body: string;
}
/**
 * Load a skill SKILL.md file and parse its frontmatter.
 */
export declare function loadSkill(skillName: string): SkillManifest | null;
/**
 * Assemble the full prompt output for `task.js next`.
 * Includes: required reading (inlined) + skill body + completion protocol.
 */
export declare function assembleStepPrompt(stepIndex: number, totalSteps: number, skillName: string, description: string, readings: ResolvedReading[], taskId: string): string;
