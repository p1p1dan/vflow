---
name: vflow-collab
description: "Team collaboration commands for vflow. Use when the user says 'join team', 'team status', 'sync', 'claim task', 'release task', 'preflight check', 'search archive', or any team-related action."
---

# vflow-collab — Team Collaboration

Manage team collaboration features: join, status, sync, claim/release tasks, spec review.

## Commands Reference

All commands use `node .vflow/scripts/collab.mjs <command>`.

| Command | Purpose |
| :--- | :--- |
| `join [--role admin\|member]` | Register as team member (enables team mode) |
| `whoami` | Show current member identity |
| `status [--window N]` | Show team activity (last N minutes, default 30) |
| `preflight --task <slug>` | Check if another member is working on this task |
| `sync [--dry-run]` | One-key sync: stash → pull --rebase → pop → push |
| `claim <slug>` | Claim ownership of a task |
| `release <slug>` | Release task ownership |
| `search <query>` | Full-text search across all archived tasks |
| `daily` | Show today's activity summary |
| `staging <content> --target <path> --action <append\|replace\|new> --summary "..."` | Stage a spec change for review |
| `review <staging-file> <approve\|reject>` | Review a staged spec change |

## Workflows

### First-time Setup
```bash
node .vflow/scripts/collab.mjs join
```
This registers your git identity, enables team mode, and sets up `.gitattributes` for conflict-free merging.

### Before Starting Work
```bash
node .vflow/scripts/collab.mjs preflight --task <slug>
```
Check if anyone else is working on the same task.

### Claiming a Task
```bash
node .vflow/scripts/collab.mjs claim <slug>
```
Sets you as the task owner and updates the per-uid current-task pointer.

### Syncing with Team
```bash
node .vflow/scripts/collab.mjs sync
```
Safely syncs your local changes with the remote: stashes local changes, pulls with rebase, pops stash, and pushes.

### Spec Review Flow
When team mode is enabled and `spec_review` is true, spec writeback goes through staging:
1. AI stages spec change via `staging` command
2. Team member reviews via `review <file> approve` or `review <file> reject`
3. Approved changes merge into the target spec file

## Hard Rules

1. Always run `preflight` before claiming a task someone else might be working on
2. Team mode is advisory — warnings don't block operations
3. Activity logging is fire-and-forget — never blocks the main workflow
4. Non-team-mode projects are completely unaffected by team code paths
