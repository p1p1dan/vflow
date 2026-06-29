// derive.ts — Archive derivation and knowledge extraction.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ARCHIVE_DIR, isoNow, yearMonth, } from './config.js';
import { readArtifact, readEvents, appendEvent, writeProposal, upsertRepoIndex, } from './store.js';
import { clearProposalFromSessions } from './session-runtime.js';
export function deriveReviewMd(dir, proposal) {
    const events = readEvents(dir);
    const analysis = readArtifact(dir, 'analysis');
    const design = readArtifact(dir, 'design');
    const plan = readArtifact(dir, 'plan');
    const exec = readArtifact(dir, 'execution');
    const verify = readArtifact(dir, 'verify');
    const lines = [];
    lines.push(`# Review: ${proposal.title}`);
    lines.push('');
    lines.push(`**ID:** ${proposal.id}  `);
    lines.push(`**Type:** ${proposal.type} | **Tier:** ${proposal.tier}  `);
    lines.push(`**Created:** ${proposal.created_at}  `);
    lines.push(`**Completed:** ${proposal.updated_at}  `);
    lines.push('');
    lines.push('## Analysis');
    lines.push('');
    if (analysis) {
        lines.push(`**Problem:** ${analysis.problem}`);
        lines.push('');
        lines.push(`**Scope:** ${analysis.scope}`);
        lines.push('');
        if (analysis.constraints.length) {
            lines.push('**Constraints:**');
            for (const c of analysis.constraints)
                lines.push(`- ${c}`);
            lines.push('');
        }
    }
    lines.push('## Design Decisions');
    lines.push('');
    if (design) {
        for (const d of design.decisions) {
            lines.push(`### ${d.id}: ${d.decision}`);
            lines.push('');
            lines.push(`**Rationale:** ${d.rationale}`);
            lines.push('');
            lines.push(`**Tradeoffs:** ${d.tradeoffs}`);
            lines.push('');
        }
    }
    lines.push('## Execution');
    lines.push('');
    if (exec) {
        lines.push('| Item | Status | Evidence |');
        lines.push('|------|--------|----------|');
        for (const item of exec.items) {
            lines.push(`| ${item.id}: ${item.title} | ${item.status} | ${item.evidence.join('; ') || '-'} |`);
        }
        lines.push('');
    }
    lines.push('## Verification');
    lines.push('');
    if (verify) {
        lines.push(`**All gating passed:** ${verify.all_gating_passed}`);
        lines.push('');
        for (const r of verify.results) {
            lines.push(`- **${r.id}:** ${r.passed ? 'PASS' : 'FAIL'} — ${r.evidence}${r.waiver ? ` (waiver: ${r.waiver})` : ''}`);
        }
        lines.push('');
    }
    lines.push('## Event Timeline');
    lines.push('');
    for (const e of events) {
        const parts = [`${e.ts} — **${e.type}**`];
        if (e.from || e.to)
            parts.push(`${e.from ?? ''}→${e.to ?? ''}`);
        if (e.item_id)
            parts.push(`[${e.item_id}]`);
        if (e.detail)
            parts.push(e.detail);
        lines.push(`- ${parts.join(' | ')}`);
    }
    lines.push('');
    return lines.join('\n');
}
export function archiveProposal(dir, proposal, html) {
    // Derive review.md
    const reviewContent = deriveReviewMd(dir, proposal);
    writeFileSync(join(dir, 'review.md'), reviewContent, 'utf-8');
    console.log('Generated review.md');
    if (html) {
        const escaped = reviewContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Review: ${proposal.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title></head><body><pre>${escaped}</pre></body></html>`;
        writeFileSync(join(dir, 'review.html'), htmlContent, 'utf-8');
        console.log('Generated review.html');
    }
    // Move to archive
    const monthDir = join(ARCHIVE_DIR, yearMonth());
    mkdirSync(monthDir, { recursive: true });
    const dest = join(monthDir, basename(dir));
    renameSync(dir, dest);
    // Update proposal
    proposal.stage = 'archived';
    proposal.lifecycle_status = 'archived';
    writeProposal(dest, proposal);
    // Update repo index
    upsertRepoIndex({
        id: proposal.id, slug: proposal.slug, dir: `archive/${yearMonth()}/${basename(dir)}`,
        title: proposal.title, stage: 'archived', lifecycle_status: 'archived',
        type: proposal.type, updated_at: isoNow(),
    });
    // Clear session bindings
    clearProposalFromSessions(proposal.id);
    // Append archived event
    appendEvent(dest, { ts: isoNow(), type: 'stage_changed', from: 'done', to: 'archived' });
    appendEvent(dest, { ts: isoNow(), type: 'archived', detail: `Archived to ${monthDir}` });
    console.log(`Archived ${proposal.id} to ${dest}`);
}
export function knowledgeSuggest(dir) {
    const design = readArtifact(dir, 'design');
    const verify = readArtifact(dir, 'verify');
    const events = readEvents(dir);
    const candidates = [];
    if (design) {
        for (const d of design.decisions) {
            candidates.push(`Decision: ${d.decision} — ${d.rationale}`);
        }
    }
    if (verify) {
        for (const r of verify.results) {
            if (!r.passed && r.waiver) {
                candidates.push(`Known risk: ${r.evidence} (waiver: ${r.waiver})`);
            }
        }
    }
    return candidates;
}
//# sourceMappingURL=derive.js.map