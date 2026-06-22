import type { ArtifactEntry } from './config.js';
export interface TraceRow {
    rid: string;
    definition: string;
    designItems: string[];
    artifacts: ArtifactEntry[];
    verifyResult: string;
}
export declare function generateTraceMatrix(taskDir: string): TraceRow[];
export declare function formatTraceMatrix(rows: TraceRow[]): string;
