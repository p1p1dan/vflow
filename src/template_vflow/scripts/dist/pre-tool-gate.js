#!/usr/bin/env node
// pre-tool-gate.ts — PreToolUse hook that blocks Write/Edit/NotebookEdit when no active proposal exists.
//
// Exit codes:
//   0 = allow (no objection)
//   2 = block (hard denial, bypass-proof)
//
// Blocking reason must be written to stderr (not stdout).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
// Check for active proposal
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const repoIndexPath = join(cwd, '.vflow', 'scripts', 'repo.json');
let hasActiveProposal = false;
try {
    const repoIndex = JSON.parse(readFileSync(repoIndexPath, 'utf-8'));
    hasActiveProposal = repoIndex.proposals?.some((p) => p.lifecycle_status === 'active' || p.lifecycle_status === 'blocked') ?? false;
}
catch {
    // Fail-safe: if repo.json is missing or corrupt, allow (do not block)
    process.exit(0);
}
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