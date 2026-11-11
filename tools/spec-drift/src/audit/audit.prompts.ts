import { Injectable } from '@nestjs/common';
import { Prompt } from '@nestjs/mcp';
import * as z from 'zod';

const ArchitectureReviewArgs = z.object({
	paths: z.string().optional().describe('Space-separated repo paths (default: changed files)'),
});

const SpecAlignmentArgs = z.object({
	slice_id: z.string().trim().min(1).describe('Slice to check'),
});

const PrReviewArgs = z.object({
	base_branch: z.string().trim().min(1).describe('PR base branch'),
	target_branch: z.string().trim().min(1).describe('PR head branch'),
	pr_body: z.string().optional().describe('PR description (for the Slice: line)'),
});

/** Harness governance prompts (slash commands in Claude Code and Cursor). */
@Injectable()
export class AuditPrompts {
	@Prompt({
		name: 'architecture-review',
		title: 'Architecture review',
		description: 'Review files against the bound architecture rules (inferential pass of the codebase-audit skill).',
		argsSchema: ArchitectureReviewArgs,
	})
	architectureReview({ paths }: z.infer<typeof ArchitectureReviewArgs>): string {
		const list = paths?.trim() ? paths.trim().split(/\s+/) : [];
		return `Run an architecture review${list.length ? ` of: ${list.join(' ')}` : ' of the changed files'}.
1. Call the spec-drift tool verify_architecture_rules${list.length ? ` with paths [${list.map((p) => JSON.stringify(p)).join(', ')}]` : ''}. It reads domain-layer.md, domain-layer.project.md, product.md, structure.md, and tech.md (paths follow project.json bindings; filled: false is a kit stub and is not product truth). It selects .semgrep.yml or the Semgrep rules binding, or generates a temporary config from a "Paths | Must not import" table plus the Language row in tech.md, then runs semgrep scan --json. Report each SEMGREP finding with file, line, rule, and fix or remediation. If status is "unconfigured" or semgrep is "unavailable", say so; do not treat it as a pass.
2. Read the resource spec://rules/architecture.
3. Read .agents/skills/codebase-audit/SKILL.md and follow its inferential pass for these files.
4. Report findings with file, line, and the rule cited. Inferential findings are advisory (QG-DRIFT-05). Do not edit code.
5. Call audit_report so the Tech Lead sees the computational and inferential findings together (hosts with MCP Apps open the dashboard).`;
	}

	@Prompt({
		name: 'spec-alignment',
		title: 'Spec alignment',
		description: 'Check one slice against its spec: drift, requirement coverage, and per-REQ verdicts.',
		argsSchema: SpecAlignmentArgs,
	})
	specAlignment({ slice_id }: z.infer<typeof SpecAlignmentArgs>): string {
		return `Check spec alignment for slice ${slice_id}.
1. Call audit_diff (mode "author") and verify_spec_compliance with slice_id "${slice_id}".
2. Read .harness/specs/${slice_id}/intent.md and requirements.md (or spec.md for lite slices).
3. For each requirement, report satisfied / violated / unclear with file and line evidence. Never report unclear as satisfied.
4. Apply QG-DRIFT-01..03 from .harness/steering/quality-gates.md. Do not edit code.`;
	}

	@Prompt({
		name: 'pr-review',
		title: 'Tech Lead PR review (spec drift)',
		description: 'Tech Lead pull request review: drift, compliance, architecture; draft comments only.',
		argsSchema: PrReviewArgs,
	})
	prReview({ base_branch, target_branch, pr_body }: z.infer<typeof PrReviewArgs>): string {
		return `Review the pull request ${base_branch}...${target_branch} as the Tech Lead.
1. Call audit_diff with base_branch "${base_branch}", target_branch "${target_branch}", mode "review"${pr_body ? ', and the pr_body below' : ''}. If DRIFT-07 fires, stop: the PR must name a slice.
2. For each linked slice in summary.linked_slices, run the spec-alignment prompt steps.
3. Run the architecture-review prompt steps on the changed files.
4. Findings already dismissed in .harness/audits/triage.json are suppressed; do not raise them again.
   If report.learning lists relevant open patterns, add one advisory comment per pattern: it is a repeat failure this PR touches. Suggest asdd learn --propose <LP-id>; never block the PR on it.
5. Output draft review comments ordered by severity (fail, warn, advisory), each with file, line, and the REQ or rule it cites. Do not post them and do not edit code. To record a dismissal, use: asdd triage <finding-id> --dismiss --reason "<why>".${pr_body ? `\n\nPR body:\n${pr_body}` : ''}`;
	}
}
