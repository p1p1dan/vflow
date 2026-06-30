// proposal-skills.test.mjs — Path A invariants for cli.mjs managed skills.
// Run with: node --test ../tests/proposal-skills.test.mjs
//
// Dev-only: NOT in cli.mjs MANAGED_VFLOW. Imports ../../cli.mjs which only
// exists in the dev repo, so it never ships into user .vflow/tests.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_MJS = join(__dirname, '..', '..', 'cli.mjs');
const CLAUDE_SKILLS_SRC = join(__dirname, '..', '..', 'template_claude', 'skills');

const cli = await import(pathToFileURL(CLI_MJS).href);

describe('vflow2 path A — managed project skills', () => {
  test('1. MANAGED_CLAUDE_SKILLS has the kept skills + vflow-proposal', () => {
    assert.deepEqual(
      [...cli.MANAGED_CLAUDE_SKILLS].sort(),
      ['vflow-brainstorm', 'vflow-commit', 'vflow-debug', 'vflow-proposal', 'vflow-think'],
    );
  });

  test('1b. vflow-proposal migrated from .vflow/skills to .claude/skills (triggerable)', () => {
    // It must be a managed project skill (discoverable/triggerable by Claude Code)...
    assert.ok(cli.MANAGED_CLAUDE_SKILLS.includes('vflow-proposal'));
    // ...and must NOT still be shipped as a passive .vflow/skills file.
    assert.ok(
      !cli.MANAGED_VFLOW.includes('skills/vflow-proposal/SKILL.md'),
      'vflow-proposal must not remain in MANAGED_VFLOW after migration',
    );
  });

  test('2. kept skills are NOT in OLD_CLAUDE_SKILLS (no install-then-delete)', () => {
    const conflict = cli.MANAGED_CLAUDE_SKILLS.filter(s => cli.OLD_CLAUDE_SKILLS.includes(s));
    assert.deepEqual(conflict, [], `OLD_CLAUDE_SKILLS would delete: ${conflict.join(', ')}`);
  });

  test('3. kept skills are NOT in OLD_VFLOW_SKILLS (skills/<name> form)', () => {
    const conflict = cli.MANAGED_CLAUDE_SKILLS.filter(s => cli.OLD_VFLOW_SKILLS.includes(`skills/${s}`));
    assert.deepEqual(conflict, [], `OLD_VFLOW_SKILLS would delete: ${conflict.join(', ')}`);
  });

  test('4. deprecated old skills are still cleaned (regression guard)', () => {
    // These were removed from the system and must still be purged on update.
    for (const s of ['vflow-review', 'vflow-spec', 'vflow-go', 'vflow-code']) {
      assert.ok(cli.OLD_CLAUDE_SKILLS.includes(s), `${s} should remain in cleanup list`);
    }
  });

  test('5. source SKILL.md exists for every managed skill', () => {
    for (const s of cli.MANAGED_CLAUDE_SKILLS) {
      const p = join(CLAUDE_SKILLS_SRC, s, 'SKILL.md');
      assert.ok(existsSync(p), `missing source skill file: ${p}`);
    }
  });
});
