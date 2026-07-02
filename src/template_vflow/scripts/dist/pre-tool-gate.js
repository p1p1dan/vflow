#!/usr/bin/env node
// pre-tool-gate.ts — PreToolUse hook that blocks Write/Edit/NotebookEdit when no active proposal exists.
//
// Exit codes:
//   0 = allow (no objection)
//   2 = block (hard denial, bypass-proof)
//
// Blocking reason must be written to stderr (not stdout).
import { readFileSync } from 'node:fs';
import { readRepoIndex } from './lib/store.js';
import { loadConfig } from './lib/config.js';
// Read hook payload from stdin (Claude Code passes tool call metadata as JSON)
let payload = {};
try {
    const stdin = readFileSync(0, 'utf-8').trim();
    if (stdin)
        payload = JSON.parse(stdin);
}
catch {
    // No stdin or invalid JSON — fail open (allow)
    process.exit(0);
}
const toolName = payload.tool_name;
// Only gate write operations; reads and Bash are allowed
const blockedTools = ['Write', 'Edit', 'NotebookEdit'];
if (!toolName || !blockedTools.includes(toolName)) {
    process.exit(0);
}
// Respect the features.gate config toggle. When explicitly disabled, this hook
// must not block — otherwise the config flag is a lie. Default (undefined) keeps
// the gate ON, so a missing/corrupt config still enforces the workflow.
const config = loadConfig();
if (config.features?.gate === false) {
    process.exit(0);
}
// readRepoIndex() shares the same ROOT resolution as every other CLI command
// (lib/config.ts resolveRoot()), so this can never drift from where store.ts
// actually writes repo.json. A missing/corrupt index yields {proposals: []}
// (readJson logs+swallows), which correctly falls through to the block below —
// no active proposal is exactly the state this gate exists to catch.
const repoIndex = readRepoIndex();
const hasActiveProposal = repoIndex.proposals?.some((p) => p.lifecycle_status === 'active' || p.lifecycle_status === 'blocked') ?? false;
if (hasActiveProposal) {
    // Active proposal exists — allow the tool call
    process.exit(0);
}
// No active proposal — block the tool call with exit 2
const blockReason = `vflow gate: ${toolName} blocked. No active proposal exists.

To create a proposal:
  node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type feature --tier T2

Or invoke the intake skill:
  Skill("vflow-go")

Read/Grep/Glob/Bash are not blocked — you can explore the codebase before creating the proposal.
`;
process.stderr.write(blockReason);
process.exit(2);
//# sourceMappingURL=pre-tool-gate.js.map