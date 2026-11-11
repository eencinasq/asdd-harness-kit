/**
 * Pure helpers for the PR-review architecture scan: the "generate rules" agent prompt and the
 * markdown sections added to prompts / reports. Engine-neutral (the analyzer is pluggable).
 */
import type { EngineInfo } from '../../analysis/analysis.types.ts';
import type { ReviewFinding } from '../engine/types.ts';
import type { ArchitectureFinding, ArchitectureReviewView } from './architecture.types.ts';

const ARCHITECTURE_SECTION = /\n## Architecture \(project[\s\S]*$/m;

/** Engine shown for reviews saved before the analyzer was pluggable (always Semgrep then). */
const LEGACY_ENGINE: EngineInfo = { id: 'semgrep', name: 'Semgrep', rulesDir: '.semgrep' };
const engineOf = (arch: ArchitectureReviewView): EngineInfo => arch.engine ?? LEGACY_ENGINE;

export const buildRulesGeneratePrompt = (options: {
	readonly repoRoot: string;
	readonly project: string;
	readonly pr?: number;
	readonly engine: EngineInfo;
	/** Engine-specific authoring steps (CodeAnalyzer.authoringGuide). */
	readonly guide: readonly string[];
}): string => {
	const { engine } = options;
	const prBit =
		options.pr !== undefined
			? `After creating the rules, call \`pr_review_architecture_rescan\` with pr=${options.pr} to re-run the architecture scan on the PR files.`
			: 'After creating the rules, tell the user to re-run the PR review or architecture rescan.';

	return [
		`# Generate ${engine.rulesDir} architecture rules for ${options.project}`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		`There is no usable \`${engine.rulesDir}/\` config in this project yet.`,
		'',
		'## Goal',
		`Create a project-specific ${engine.name} rule set under \`${engine.rulesDir}/\` that encodes **this** codebase’s architecture and coding standards (not a generic template copy-paste).`,
		'',
		'## How',
		'1. Explore the codebase: README, AGENTS.md / CLAUDE.md, ADRs, package layout, dependency boundaries, lint rules, and existing conventions.',
		...options.guide.map((step, i) => `${i + 2}. ${step}`),
		`${options.guide.length + 2}. Keep rules precise; avoid noisy style nits unless the project already enforces them.`,
		`${options.guide.length + 3}. Do **not** invent secrets or commit credentials.`,
		'',
		'## Done',
		prBit,
	].join('\n');
};

export const architecturePromptSection = (arch: ArchitectureReviewView): string => {
	const engine = engineOf(arch);
	if (arch.status === 'missing-config' || arch.status === 'empty-config') {
		return [
			`## Architecture (${engine.name})`,
			arch.message,
			'Ask the human to use **Ask the agent to write rules** (Architecture tab of the PR Review dashboard) (or follow generatePrompt) before treating architecture as covered.',
		].join('\n');
	}
	if (arch.status === 'error') {
		return [`## Architecture (${engine.name})`, arch.message, arch.stderrTail ?? ''].join('\n');
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
	return lines.join('\n');
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
	return lines.join('\n');
};

/** Replace (or append) the architecture section at the end of a report.md. */
export const withArchitectureSection = (report: string, arch: ArchitectureReviewView): string =>
	`${report.replace(ARCHITECTURE_SECTION, '').trimEnd()}\n\n${architectureReportSection(arch)}\n`;
