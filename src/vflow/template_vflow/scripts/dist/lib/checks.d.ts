import type { VflowConfig, TaskJson } from './config.js';
export declare function checkAnalyzed(taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[];
export declare function checkDesigned(taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[];
export declare function checkImplementing(_taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[];
export declare function checkVerified(taskDir: string, cfg: VflowConfig, task: TaskJson): string[];
export declare function checkArchived(taskDir: string, cfg: VflowConfig, task: TaskJson): string[];
export type TransitionCheckFn = (taskDir: string, cfg: VflowConfig, task: TaskJson) => string[];
export declare const TRANSITION_CHECKS: Record<string, TransitionCheckFn>;
