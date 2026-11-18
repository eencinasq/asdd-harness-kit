/**
 * Pure helpers for the PR-review architecture scan: the "generate rules" agent prompt and the
 * markdown sections added to prompts / reports. Engine-neutral (the analyzer is pluggable).
 */
import type { EngineInfo } from '../../analysis/analysis.types.ts';
import { buildRulesPrompt } from '../../analysis/domain/rules-prompt.ts';
import type { ReviewFinding } from '../engine/types.ts';
import type { ArchitectureFinding, ArchitectureReviewView } from './architecture.types.ts';

const ARCHITECTURE_SECTION = /\n## Architecture \(project[\s\S]*$/m;

/** Engine shown for reviews saved before the analyzer was pluggable (always Semgrep then). */
const LEGACY_ENGINE: EngineInfo = { id: 'semgrep', name: 'Semgrep', rulesDir: '.semgrep' };
const engineOf = (arch: ArchitectureReviewView): EngineInfo => arch.engine ?? LEGACY_ENGINE;

/** The rules-generation prompt for a PR review: once the rules exist, re-run the PR's architecture scan. */
export const buildRulesGeneratePrompt = (options: {
	readonly repoRoot: string;
	readonly project: string;
	readonly pr?: number;
	readonly engine: EngineInfo;
	/** Engine-specific authoring steps (CodeAnalyzer.authoringGuide). */
	readonly guide: readonly string[];
}): string =>
	buildRulesPrompt({
		...options,
		done:
			options.pr !== undefined
				? `After creating the rules, call \`pr_review_architecture_rescan\` with pr=${options.pr} to re-run the architecture scan on the PR files.`
				: 'After creating the rules, tell the user to re-run the PR review or architecture rescan.',
	});

/**
 * Prompt to draft a repository security rule set (e.g. `.semgrep/security/`) from area best practices
 * (pr-review-dashboard-ux REQ-007). Distinct from architecture rules under other packs.
 */
export const buildSecurityRulesGeneratePrompt = (options: {
	readonly repoRoot: string;
	readonly project: string;
	readonly pr?: number;
	readonly engine: EngineInfo;
	readonly guide: readonly string[];
}): string => {
	const { engine, guide } = options;
	const securityDir = `${engine.rulesDir}/security`;
	const done =
		options.pr !== undefined
			? `After creating the security rules, call \`pr_review_architecture_rescan\` with pr=${options.pr} so the Security Findings tab re-runs on the PR files.`
			: 'After creating the security rules, tell the user to re-run the PR review or architecture rescan.';
	const steps = [
		'Explore the codebase for its security surface: auth/session entrypoints, trust boundaries, parsers of untrusted input, shell/SQL/template sinks, secret handling, and dependency/config that affects those paths.',
		'Prefer rules that encode **this** product’s area (e.g. web API, Nest handlers, Mongo queries) over a generic OWASP dump; cite the boundary each rule protects.',
		...guide.map((step) => step.replaceAll(engine.rulesDir, securityDir)),
		`Write the rules under \`${securityDir}/\` (YAML rule files the engine already understands). Do not overwrite unrelated packs (architecture, standards).`,
		'Before writing files, list the rules you plan (id, what it forbids, which boundary) so the user can confirm.',
		'Do **not** invent secrets or commit credentials.',
	];
	return [
		`# Generate ${securityDir} security rules for ${options.project}`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		`There is no usable \`${securityDir}/\` rule set in this project yet.`,
		'',
		'## Goal',
		`Create a project-specific ${engine.name} **security** rule set under \`${securityDir}/\` based on security best practices for this codebase’s area (injection, authz, unsafe sinks, secret exposure) — not a copy-paste of the kit’s built-in pack alone.`,
		'',
		'## How',
		...steps.map((step, i) => `${i + 1}. ${step}`),
		'',
		'## Done',
		done,
	].join('\n');
};

export const architecturePromptSection = (arch: ArchitectureReviewView): string => {
	const engine = engineOf(arch);
	if (arch.status === 'missing-config' || arch.status === 'empty-config') {
		return [
			`## Architecture (${engine.name})`,
			arch.message,
			'Ask the human to use **Ask the agent to write rules** (Architecture tab of the PR Review dashboard) (or follow generatePrompt) before treating architecture as covered.',
			...builtinSecurityLines(arch, false),
		].join('\n');
	}
	if (arch.status === 'error') {
		return [
			`## Architecture (${engine.name})`,
			arch.message,
			arch.stderrTail ?? '',
			...builtinSecurityLines(arch, false),
		].join('\n');
	}
	const lines = [
		`## Architecture (${engine.name} — project \`${engine.rulesDir}\`)`,
		arch.message,
		`Config files: ${arch.configFiles.join(', ') || '(none)'}`,
		`Scoped paths: ${arch.scannedPaths.slice(0, 40).join(', ')}${arch.scannedPaths.length > 40 ? '…' : ''}`,
	];
	if (arch.findings.length) {
		lines.push('', 'Findings to consider (map onto review groups when the path is in the group):');
		for (const f of arch.findings.slice(0, 40)) {
			lines.push(`- [${f.severity}] \`${f.path}:${f.startLine}\` — ${f.checkId}: ${f.message.slice(0, 160)}`);
		}
		if (arch.findings.length > 40) {
			lines.push(`- … and ${arch.findings.length - 40} more (see architecture.json)`);
		}
	}
	lines.push(...builtinSecurityLines(arch, false));
	return lines.join('\n');
};

/** pr-security-baseline REQ-001: the built-in security pack's result, as lines for the prompt or the report. */
const builtinSecurityLines = (arch: ArchitectureReviewView, bold: boolean): string[] => {
	const b = arch.builtinSecurity;
	if (!b) return [];
	const lines = ['', '### Built-in security pack', '', b.message];
	for (const f of b.findings.slice(0, 40)) {
		lines.push(
			bold
				? `- **[${f.severity}]** \`${f.path}:${f.startLine}\` — ${f.checkId}: ${f.message}`
				: `- [${f.severity}] \`${f.path}:${f.startLine}\` — ${f.checkId}: ${f.message.slice(0, 160)}`,
		);
	}
	if (b.findings.length > 40) lines.push(`- … and ${b.findings.length - 40} more (see architecture.json)`);
	return lines;
};

/** Map analyzer severity (ERROR / WARNING / INFO) → finding severity for PR comments. */
export const architectureFindingToReview = (finding: ArchitectureFinding): ReviewFinding => {
	const severity = finding.severity === 'ERROR' ? 'high' : finding.severity === 'WARNING' ? 'medium' : 'low';
	const content = `[architecture] ${finding.checkId}: ${finding.message}`.slice(0, 500);
	return {
		path: finding.path,
		content,
		startLine: finding.startLine,
		endLine: finding.endLine || finding.startLine,
		category: 'maintainability',
		severity,
	};
};

export const architectureReportSection = (arch: ArchitectureReviewView): string => {
	const { rulesDir } = engineOf(arch);
	const lines = [`## Architecture (project \`${rulesDir}\`)`, '', arch.message, ''];
	if (arch.status === 'scanned' && arch.findings.length) {
		for (const f of arch.findings) {
			lines.push(`- **[${f.severity}]** \`${f.path}:${f.startLine}\` — ${f.checkId}: ${f.message}`);
		}
	} else if (arch.status === 'missing-config' || arch.status === 'empty-config') {
		lines.push(`_No \`${rulesDir}\` rules yet — generate them from the codebase._`);
	}
	lines.push(...builtinSecurityLines(arch, true));
	return lines.join('\n');
};

/** Replace (or append) the architecture section at the end of a report.md. */
export const withArchitectureSection = (report: string, arch: ArchitectureReviewView): string =>
	`${report.replace(ARCHITECTURE_SECTION, '').trimEnd()}\n\n${architectureReportSection(arch)}\n`;
