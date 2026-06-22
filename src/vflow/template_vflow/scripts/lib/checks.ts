// vflow checks — state transition validation.
// Supports both v1 (requirement.md + design.md + verify.md) and v2 (task-spec.md + ledger.md).

import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import type { VflowConfig, TaskJson } from './config.js';
import { readText, ROOT } from './config.js';
import { parseRidDefinitions, parseRidReferences, checkRidCoverage, verifySection } from './rid.js';
import {
  isFilled, uncheckedItems, designPath, requirementPath, verifyPath,
  latestWorklogMtime, isV2Docs, parseSection,
} from './docs.js';
import { runVerification } from './verify.js';

// ---------------------------------------------------------------------------
// R-ID source resolution
// ---------------------------------------------------------------------------

/** Read R-ID definitions from the appropriate document. */
function ridSource(taskDir: string): { text: string; label: string } {
  if (isV2Docs(taskDir)) {
    const body = parseSection(join(taskDir, 'task-spec.md'), 2);
    return { text: body, label: 'task-spec.md §2' };
  }
  return { text: readText(join(taskDir, 'requirement.md')), label: 'requirement.md' };
}

// ---------------------------------------------------------------------------
// Transition checks
// ---------------------------------------------------------------------------

export function checkAnalyzed(taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[] {
  const errors: string[] = [];
  const reqPath = requirementPath(taskDir);

  if (isV2Docs(taskDir)) {
    // v2: check task-spec.md is filled and §2 has R-IDs
    if (!isFilled(reqPath)) {
      errors.push('task-spec.md is not filled (still template or missing)');
    } else {
      const section2 = parseSection(reqPath, 2);
      if (parseRidDefinitions(section2).size === 0) {
        errors.push("task-spec.md §2 defines no R-ID entries (need lines like '- R1: ...')");
      }
    }
  } else {
    // v1: check requirement.md
    if (!isFilled(reqPath)) {
      errors.push('requirement.md is not filled (still template or missing)');
    } else if (parseRidDefinitions(readText(reqPath)).size === 0) {
      errors.push("requirement.md defines no R-ID entries (need lines like '- R1: ...')");
    }
  }
  return errors;
}

export function checkDesigned(taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[] {
  const dp = designPath(taskDir);
  const errors: string[] = [];

  if (!isFilled(dp)) {
    errors.push(`${basename(dp)} is not filled (still template or missing)`);
    return errors;
  }

  const { text: ridText, label: ridLabel } = ridSource(taskDir);
  const required = parseRidDefinitions(ridText);

  let covered: Set<string>;
  if (isV2Docs(taskDir)) {
    // v2: checklist is in task-spec.md §6
    const section6 = parseSection(join(taskDir, 'task-spec.md'), 6);
    covered = parseRidReferences(section6);
  } else {
    covered = parseRidReferences(readText(dp));
  }

  const [_ok, msgs] = checkRidCoverage(required, covered, basename(dp));
  for (const m of msgs) {
    if (m.startsWith('warning:')) {
      console.log(`  [vflow] ${m}`);
    } else {
      errors.push(m + " (checklist items must carry trailing '(R<n>)' tags)");
    }
  }
  return errors;
}

export function checkImplementing(_taskDir: string, _cfg: VflowConfig, _task: TaskJson): string[] {
  return [];
}

export function checkVerified(taskDir: string, cfg: VflowConfig, task: TaskJson): string[] {
  const errors: string[] = [];
  const items = uncheckedItems(taskDir);
  if (items.length) {
    errors.push(`${items.length} unchecked items in ${basename(designPath(taskDir))}:`);
    for (const item of items) errors.push(`  - [ ] ${item}`);
    return errors;
  }
  const [ok, msg] = runVerification(taskDir, cfg, task);
  console.log(`  [vflow] ${msg}`);
  if (!ok) errors.push(msg);
  return errors;
}

export function checkArchived(taskDir: string, cfg: VflowConfig, task: TaskJson): string[] {
  const errors: string[] = [];
  const vp = verifyPath(taskDir);

  if (!isFilled(vp)) {
    errors.push(`${basename(vp)} is not filled`);
    return errors;
  }

  const { text: ridText } = ridSource(taskDir);
  const required = parseRidDefinitions(ridText);

  // Extract verification results section
  let sec1: string;
  if (isV2Docs(taskDir)) {
    // v2: verification results are in ledger.md §4
    sec1 = parseSection(vp, 4);
    if (!sec1.trim()) {
      errors.push("ledger.md is missing section '## §4 验证结果' with per-R-ID results");
      return errors;
    }
  } else {
    // v1: verification results are in verify.md §1
    const vtext = readText(vp);
    sec1 = verifySection(vtext, 1);
    if (!sec1.trim()) {
      errors.push("verify.md is missing section '## §1 ...' with per-R-ID results");
      return errors;
    }
  }

  const closed = parseRidDefinitions(sec1);
  const [_ok, msgs] = checkRidCoverage(required, closed, basename(vp));
  for (const m of msgs) {
    if (m.startsWith('warning:')) {
      console.log(`  [vflow] ${m}`);
    } else {
      errors.push(m + " (each R-ID needs a result entry '- R<n>: ...')");
    }
  }

  // mtime cross-check: code must not change after machine verification
  const verifiedAt = task.verified_at ?? '';
  if (verifiedAt) {
    const vts = new Date(verifiedAt).getTime() / 1000 + 1.0;
    const latest = latestWorklogMtime(taskDir, ROOT.replace(/[/\\].vflow$/, ''));
    if (latest > vts) {
      const d = new Date(latest * 1000);
      const off = d.getTimezoneOffset();
      const local = new Date(d.getTime() - off * 60000);
      const latestIso = local.toISOString().replace(/\.\d{3}Z$/, '');
      errors.push(
        `source files changed after verification (${latestIso}). Run 'task.ts back' then 'task.ts advance' to re-verify.`,
      );
    }
  } else {
    const testRequired = cfg.test_required !== undefined ? cfg.test_required : true;
    if (testRequired) {
      errors.push(
        "no machine verification record (verified_at missing); run 'task.ts back' then 'task.ts advance' to verify with tests",
      );
    }
  }
  return errors;
}

export type TransitionCheckFn = (taskDir: string, cfg: VflowConfig, task: TaskJson) => string[];

export const TRANSITION_CHECKS: Record<string, TransitionCheckFn> = {
  analyzed: checkAnalyzed,
  designed: checkDesigned,
  implementing: checkImplementing,
  verified: checkVerified,
  archived: checkArchived,
};
