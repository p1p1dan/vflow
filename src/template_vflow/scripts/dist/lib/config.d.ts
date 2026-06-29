export declare const ROOT: string;
export declare const SCRIPTS_DIR: string;
export declare const PROJECT_ROOT: string;
export declare const PROPOSALS_DIR: string;
export declare const ARCHIVE_DIR: string;
export declare const RUNTIME_DIR: string;
export declare const SESSIONS_DIR: string;
export declare const KNOWLEDGE_DIR: string;
export declare const TEMPLATES_DIR: string;
export declare const SPEC_DIR: string;
export declare const CONFIG_PATH: string;
export declare const REPO_INDEX_PATH: string;
export declare const WORKFLOW_PATH: string;
export interface VflowConfig {
    schema_version: number;
    project: string;
    language: string;
    enabled: boolean;
    test_required: boolean;
    build: {
        command: string;
        test_command: string;
    };
    features: Record<string, boolean>;
}
export declare function readJson<T = unknown>(path: string, defaultVal?: T | null): T | null;
export declare function readText(path: string): string;
export declare function loadConfig(): VflowConfig;
export declare function isoNow(): string;
export declare function isoToday(): string;
export declare function yearMonth(): string;
export declare function todayCompact(): string;
//# sourceMappingURL=config.d.ts.map