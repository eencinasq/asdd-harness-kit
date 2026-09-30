#!/usr/bin/env node
/**
 * Plan or apply migration of legacy per-slice manifests to schema v2.
 *
 * Usage:
 *   node scripts/harness-migrate.mjs                 # dry run
 *   node scripts/harness-migrate.mjs --write         # apply safely
 *   node scripts/harness-migrate.mjs --slice <id> --write
 */
import {
	existsSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const write = args.includes('--write');
const sliceIndex = args.indexOf('--slice');
const selectedSlice = sliceIndex >= 0 ? args[sliceIndex + 1] : null;
const slicesRoot = join(root, '.harness/state/slices');

function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function gateStatus(value) {
	if (typeof value !== 'string') return 'NOT_RUN';
	if (value === 'DONE') return 'PASSED';
	if (value === 'IN_PROGRESS') return 'IN_PROGRESS';
	if (value === 'BLOCKED') return 'BLOCKED';
	if (value === 'READY') return 'READY';
	if (value.startsWith('PASSED')) return value;
	return value;
}

function buildPaths(sliceId) {
	const features = `.harness/features/${sliceId}.features.json`;
	return {
		spec_dir: `.harness/specs/${sliceId}`,
		domain_model: 'docs/architecture/domain-model.md',
		knowledge_base: 'docs/knowledge-base',
		progress: `.harness/progress/${sliceId}.md`,
		...(existsSync(join(root, features)) ? { features } : {}),
	};
}

function migrateManifest(legacy) {
	const sliceId = legacy.slice_id ?? legacy.spec_name;
	if (!sliceId) throw new Error('legacy manifest has no slice_id or spec_name');
	const gates = {};
	const phaseFields = [
		['discovery', 'discovery_status'],
		['spec', 'spec_status'],
		['validation', 'validation_gate'],
		['domain', 'domain_status'],
		['design', 'design_status'],
		['task_planning', 'tasks_status'],
		['implementation', 'implementation_status'],
		['qa', 'qa_gate'],
		['knowledge', 'knowledge_gate'],
	];
	for (const [phase, field] of phaseFields) {
		if (legacy[field] !== undefined) gates[phase] = { status: gateStatus(legacy[field]) };
	}

	return {
		schema_version: '2.0',
		slice_id: sliceId,
		status: legacy.status ?? 'in_progress',
		phase: legacy.phase ?? 'discovery',
		mode: 'full',
		gates,
		ccs: legacy.ccs ?? null,
		confidence_chain: Array.isArray(legacy.confidence_chain)
			? legacy.confidence_chain
			: [],
		phase_data: {
			legacy_v1_fields: {
				spec_name: legacy.spec_name,
				target_slice: legacy.target_slice,
				governance_mode: legacy.governance_mode,
				phase_data: legacy.phase_data,
			},
		},
		paths: buildPaths(sliceId),
		agent_heartbeats: {},
	};
}

if (!existsSync(slicesRoot)) {
	console.log('No per-slice manifests found.');
	process.exit(0);
}

const candidates = readdirSync(slicesRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && (!selectedSlice || entry.name === selectedSlice))
	.map((entry) => ({
		id: entry.name,
		path: join(slicesRoot, entry.name, 'manifest.json'),
	}))
	.filter(({ path }) => existsSync(path))
	.filter(({ path }) => readJson(path).schema_version !== '2.0');

if (!candidates.length) {
	console.log('No legacy manifests require migration.');
	process.exit(0);
}

for (const candidate of candidates) {
	const legacy = readJson(candidate.path);
	const migrated = migrateManifest(legacy);
	const archivePath = join(root, `.harness/state/archive/${candidate.id}.pre-v2.json`);
	console.log(`${write ? 'MIGRATE' : 'PLAN'} ${candidate.path}`);
	if (!write) continue;
	if (existsSync(archivePath)) {
		throw new Error(`refusing to overwrite existing archive: ${archivePath}`);
	}
	writeJson(archivePath, legacy);
	writeJson(candidate.path, migrated);
}

if (!write) {
	console.log('Dry run only. Re-run with --write to archive and migrate these manifests.');
}
