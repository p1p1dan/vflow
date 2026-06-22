#!/usr/bin/env node
// ---------------------------------------------------------------------------
// vflow coordinate — Graph-based workflow coordinator.
// Ported from maestro-flow's coordinate.ts, adapted for vflow context.
//
// Subcommands: list, start, next, status, run (default: autonomous run), report
//
// Usage:
//   node .vflow/scripts/dist/coordinate.js start [intent...] --graph <name>
//   node .vflow/scripts/dist/coordinate.js next [sessionId]
//   node .vflow/scripts/dist/coordinate.js status [sessionId]
//   node .vflow/scripts/dist/coordinate.js run [intent...] --graph <name>
//   node .vflow/scripts/dist/coordinate.js list
//   node .vflow/scripts/dist/coordinate.js report --session <id> --node <id> --status <SUCCESS|FAILURE>
// ---------------------------------------------------------------------------
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { GraphLoader } from './lib/graph-loader.js';
import { GraphWalker } from './lib/graph-walker.js';
import { DefaultPromptAssembler } from './lib/assembler.js';
import { CliExecutor } from './lib/cli-executor.js';
import { DefaultExprEvaluator } from './lib/evaluator.js';
import { DefaultOutputParser } from './lib/output-parser.js';
import { HookManager } from './lib/hooks.js';
import { GRAPHS_DIR } from './lib/config.js';
const execFileAsync = promisify(execFile);
// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------
function resolvePaths(workflowRoot) {
    const graphsDir = join(workflowRoot, '.vflow', 'graphs');
    const chainsRoot = existsSync(graphsDir) ? graphsDir : GRAPHS_DIR;
    const templateDir = join(workflowRoot, '.vflow', 'templates');
    const sessionDir = join(workflowRoot, '.vflow', '.runtime', '.coordinator');
    return { chainsRoot, templateDir, sessionDir };
}
export function resolveReportPath(sessionDir, sessionId, nodeId) {
    return join(sessionDir, sessionId, 'reports', `${nodeId}.json`);
}
// ---------------------------------------------------------------------------
// SpawnFn — agent process spawner
// ---------------------------------------------------------------------------
function createSpawnFn() {
    return async (config) => {
        const startTime = Date.now();
        const execId = `coord-${Date.now().toString(36)}`;
        const tool = config.type === 'claude-code' ? 'claude' : config.type;
        const mode = config.approvalMode === 'auto' ? 'write' : 'analysis';
        console.error(`[coordinate] Spawning ${tool} agent...`);
        console.error(`[coordinate] Prompt: ${config.prompt.slice(0, 200)}...`);
        console.error(`[coordinate] WorkDir: ${config.workDir}`);
        try {
            // Use the claude CLI directly
            const { stdout, stderr } = await execFileAsync('claude', [
                '-p', config.prompt,
                '--allowedTools', mode === 'write' ? 'Edit,Write,Bash,Read,Grep,Glob,MultiEdit' : 'Read,Grep,Glob',
            ], {
                cwd: config.workDir,
                timeout: 600000,
                maxBuffer: 10 * 1024 * 1024,
                env: { ...process.env },
                signal: config.signal,
            });
            const output = stdout + (stderr ? '\n' + stderr : '');
            return {
                output,
                success: true,
                execId,
                durationMs: Date.now() - startTime,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                output: `--- COORDINATE RESULT ---\nSTATUS: FAILURE\nSUMMARY: ${message}\n`,
                success: false,
                execId,
                durationMs: Date.now() - startTime,
            };
        }
    };
}
// ---------------------------------------------------------------------------
// Walker factory
// ---------------------------------------------------------------------------
async function createWalker(workflowRoot) {
    const { chainsRoot, templateDir, sessionDir } = resolvePaths(workflowRoot);
    const loader = new GraphLoader(chainsRoot);
    const evaluator = new DefaultExprEvaluator();
    const parser = new DefaultOutputParser();
    const assembler = new DefaultPromptAssembler(workflowRoot, templateDir);
    const spawnFn = createSpawnFn();
    const executor = new CliExecutor(spawnFn);
    const hookManager = new HookManager();
    const walker = new GraphWalker(loader, assembler, executor, null, // no step analyzer
    parser, evaluator, undefined, // no event emitter
    sessionDir, undefined, // no parallel executor (for now)
    null, // no LLM decider
    hookManager.getRegistry());
    return { walker, loader };
}
function printState(state) {
    console.log(JSON.stringify({
        session_id: state.session_id,
        status: state.status,
        graph_id: state.graph_id,
        current_node: state.current_node,
        steps_completed: state.history.filter(h => h.node_type === 'command' && h.outcome === 'success').length,
        steps_failed: state.history.filter(h => h.node_type === 'command' && h.outcome === 'failure').length,
        last_step: state.history.filter(h => h.node_type === 'command').pop() ?? null,
        history: state.history.filter(h => h.node_type === 'command').map(h => ({
            node_id: h.node_id, outcome: h.outcome, summary: h.summary,
        })),
    }, null, 2));
}
// ---------------------------------------------------------------------------
// CLI argument parsing (minimal, no commander dependency)
// ---------------------------------------------------------------------------
function parseCliArgs() {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.log('Usage: coordinate.js <list|start|next|status|run|report> [options]');
        process.exit(1);
    }
    const subcommand = argv[0];
    const args = [];
    const opts = {};
    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
                opts[key] = argv[i + 1];
                i++;
            }
            else {
                opts[key] = true;
            }
        }
        else if (arg === '-y') {
            opts['yes'] = true;
        }
        else if (arg === '-c') {
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                opts['continue'] = argv[i + 1];
                i++;
            }
            else {
                opts['continue'] = true;
            }
        }
        else {
            args.push(arg);
        }
    }
    return { subcommand, args, opts };
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const { subcommand, args, opts } = parseCliArgs();
    const workflowRoot = resolve(opts['workflow-root'] ?? process.cwd());
    switch (subcommand) {
        case 'list': {
            const { chainsRoot } = resolvePaths(workflowRoot);
            const loader = new GraphLoader(chainsRoot);
            const graphs = loader.listAll();
            console.log('\n  ID'.padEnd(30) + 'Name'.padEnd(22) + 'Cmds'.padEnd(6) + 'Description');
            console.log('  ' + '-'.repeat(80));
            for (const graphId of graphs) {
                try {
                    const g = await loader.load(graphId);
                    const cmdCount = Object.values(g.nodes).filter(n => n.type === 'command').length;
                    const desc = g.description ?? '';
                    console.log('  ' + graphId.padEnd(28) + (g.name ?? '').padEnd(22) +
                        String(cmdCount).padEnd(6) + desc.slice(0, 50));
                }
                catch { /* skip invalid */ }
            }
            console.log('');
            break;
        }
        case 'start': {
            const intent = args.join(' ');
            const { walker } = await createWalker(workflowRoot);
            const graphId = opts['graph'];
            if (!graphId) {
                console.error('[coordinate] --graph is required for start');
                process.exit(1);
            }
            console.error(`[coordinate] Graph: ${graphId}`);
            const state = await walker.start(graphId, intent, {
                tool: opts['tool'] ?? 'claude',
                autoMode: !!opts['yes'],
                stepMode: true,
                workflowRoot,
                inputs: { description: intent },
            });
            printState(state);
            process.exit(state.status === 'completed' || state.status === 'step_paused' ? 0 : 1);
            break;
        }
        case 'next': {
            const sessionId = args[0];
            const { walker } = await createWalker(workflowRoot);
            const state = await walker.next(sessionId);
            printState(state);
            process.exit(state.status === 'completed' || state.status === 'step_paused' ? 0 : 1);
            break;
        }
        case 'status': {
            const sessionId = args[0];
            const { walker } = await createWalker(workflowRoot);
            const state = walker.getState(sessionId);
            printState(state);
            break;
        }
        case 'run': {
            const intent = args.join(' ');
            const { walker } = await createWalker(workflowRoot);
            let state;
            if (opts['continue']) {
                const sessionId = typeof opts['continue'] === 'string' ? opts['continue'] : undefined;
                console.error(`[coordinate] Resuming session${sessionId ? `: ${sessionId}` : ''}...`);
                state = await walker.resume(sessionId);
            }
            else {
                const graphId = opts['graph'];
                if (!graphId) {
                    console.error('[coordinate] --graph is required for run');
                    process.exit(1);
                }
                console.error(`[coordinate] Graph: ${graphId}`);
                console.error(`[coordinate] Intent: ${intent || '(none)'}`);
                if (opts['dry-run'])
                    console.error('[coordinate] Dry-run mode');
                state = await walker.start(graphId, intent, {
                    tool: opts['tool'] ?? 'claude',
                    autoMode: !!opts['yes'],
                    dryRun: !!opts['dry-run'],
                    workflowRoot,
                    inputs: { description: intent },
                });
            }
            printState(state);
            process.exit(state.status === 'completed' ? 0 : 1);
            break;
        }
        case 'report': {
            const session = opts['session'];
            const node = opts['node'];
            const status = opts['status']?.toUpperCase();
            if (!session || !node || !status) {
                console.error('Usage: coordinate.js report --session <id> --node <id> --status <SUCCESS|FAILURE> [--summary "..."]');
                process.exit(2);
            }
            if (status !== 'SUCCESS' && status !== 'FAILURE') {
                console.error(`[coordinate report] --status must be SUCCESS or FAILURE (got "${status}")`);
                process.exit(2);
            }
            const { sessionDir } = resolvePaths(workflowRoot);
            const reportPath = resolveReportPath(sessionDir, session, node);
            const payload = {
                status,
                phase: opts['phase'] ?? null,
                verification_status: opts['verification'] ?? null,
                review_verdict: opts['review'] ?? null,
                uat_status: opts['uat'] ?? null,
                artifacts: opts['artifact']?.split(',') ?? [],
                summary: opts['summary'] ?? '',
                reported_at: new Date().toISOString(),
            };
            try {
                mkdirSync(dirname(reportPath), { recursive: true });
                const tmpPath = `${reportPath}.tmp`;
                writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
                renameSync(tmpPath, reportPath);
            }
            catch (err) {
                console.error(`[coordinate report] Failed to write report: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
            console.error(`[coordinate report] Wrote ${reportPath}`);
            break;
        }
        default:
            console.error(`Unknown subcommand: ${subcommand}`);
            console.error('Usage: coordinate.js <list|start|next|status|run|report>');
            process.exit(1);
    }
}
main().catch((err) => {
    console.error(`[coordinate] Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
