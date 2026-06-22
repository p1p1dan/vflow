export declare const ROOT: string;
export declare const SCRIPTS_DIR: string;
export declare const PROJECT_ROOT: string;
export declare const TASKS: string;
export declare const RUNTIME: string;
export declare const POINTER: string;
export declare const JOURNAL_DIR: string;
export declare const CONFIG_PATH: string;
export declare const GRAPHS_DIR: string;
export declare const TEMPLATES_DIR: string;
export declare const STATES: readonly ["created", "analyzed", "designed", "implementing", "verified", "archived"];
export type TaskState = typeof STATES[number];
export declare const STATES_V2: readonly ["no_task", "planning", "executing", "completed"];
export type TaskStateV2 = typeof STATES_V2[number];
export declare const TEST_OUTPUT_TAIL = 3000;
export declare const TEST_TIMEOUT = 600;
export declare const MACHINE_BLOCK_HEADER = "## \u673A\u5668\u6267\u884C\u8BB0\u5F55\uFF08task.mjs \u5199\u5165\uFF0C\u8BF7\u52FF\u624B\u6539\uFF09";
export interface VflowConfig {
    project: string;
    enabled: boolean;
    language: string;
    features: Record<string, boolean>;
    build: {
        command: string;
        test_command: string;
    };
    core_paths: string[];
    journal: {
        notebook_path: string | null;
    };
    test_required: boolean;
    execution_log: boolean;
    team?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    module_spec_map?: Record<string, string[]>;
}
export interface TaskJson {
    id: string;
    title: string;
    tier?: string;
    state?: string;
    status?: string;
    phase?: string;
    risk?: string;
    created?: string;
    owner?: string;
    claimed_at?: string;
    verified_at?: string;
    completed?: string;
    test_scope?: string;
    bypasses?: Array<{
        transition: string;
        time: string;
    }>;
    backs?: string[];
    force_archived?: boolean;
    planning_skipped?: boolean;
    followup_tasks?: FollowupTask[];
    current_node?: string;
    artifacts?: ArtifactEntry[];
    walker_session?: string | null;
}
export interface FollowupTask {
    id: string;
    title: string;
    priority: string;
    done: boolean;
    impl_task: string | null;
}
export interface ArtifactEntry {
    id: string;
    type: string;
    path?: string;
    status: string;
    rid?: string;
    depends_on?: string | string[] | null;
    commit?: string;
}
export declare function readJson<T = unknown>(path: string, defaultVal?: T | null): T | null;
export declare function readText(path: string): string;
export declare function loadConfig(): VflowConfig;
export declare function isoNow(): string;
export declare function isoToday(): string;
export declare function monthDay(): string;
export declare function yearMonth(): string;
