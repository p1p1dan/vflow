import type { AgentType } from './graph-types.js';
export interface BranchTask {
    branchId: string;
    nodeId: string;
    prompt: string;
    workDir: string;
    agentType: AgentType;
}
export interface BranchResult {
    branchId: string;
    success: boolean;
    output: string;
    durationMs: number;
}
export interface ParallelCommandExecutor {
    executeBranches(branches: BranchTask[], joinStrategy: 'all' | 'any' | 'majority', signal?: AbortSignal): Promise<BranchResult[]>;
}
export interface ParallelRunner {
    runAll(tasks: Array<{
        id: string;
        prompt: string;
        tool: string;
        workDir: string;
        mode: string;
    }>, opts: {
        joinStrategy: string;
        signal?: AbortSignal;
    }): Promise<{
        results: Array<{
            id: string;
            success: boolean;
            output: string;
            durationMs: number;
        }>;
    }>;
}
export declare class DefaultParallelExecutor implements ParallelCommandExecutor {
    private readonly runner;
    constructor(runner: ParallelRunner);
    executeBranches(branches: BranchTask[], joinStrategy: 'all' | 'any' | 'majority', signal?: AbortSignal): Promise<BranchResult[]>;
}
