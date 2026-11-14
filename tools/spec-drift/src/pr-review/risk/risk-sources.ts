import type { RiskFeature } from './file-risk.ts';

/**
 * The reviewed repository's harness data for PR risk (spec-drift-depth REQ-002): its features and its latest
 * `asdd audit` report. Read through a `RepoReader` (the base branch first, like the review profile, then the checkout);
 * undefined when the repository has none.
 */

export type RepoReader = {
	/** File names (not paths) directly in a repository folder; undefined when the folder does not exist. */
	list(dir: string): Promise<string[] | undefined>;
	read(file: string): Promise<string | undefined>;
};

const parse = <T>(text: string | undefined): T | undefined => {
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
};

export const readFeatures = async (reader: RepoReader): Promise<RiskFeature[] | undefined> => {
	const dir = '.harness/features';
	const names = await reader.list(dir);
	if (!names) return undefined;
	const features: RiskFeature[] = [];
	for (const name of names.filter((n) => n.endsWith('.features.json')).sort()) {
		const data = parse<{ slice_id?: string; features?: RiskFeature[] }>(await reader.read(`${dir}/${name}`));
		for (const f of data?.features ?? []) {
			features.push({
				id: data?.slice_id ? `${data.slice_id}/${f.id}` : f.id,
				scope_paths: f.scope_paths ?? [],
				req_ids: f.req_ids ?? [],
			});
		}
	}
	return features;
};

export type AuditReportForRisk = {
	readonly findings: readonly { readonly paths?: readonly string[]; readonly check?: string }[];
	readonly hotspots: readonly { readonly path: string }[];
};

/** The newest `.harness/audits/*.json` (names are ISO timestamps, so the last in order is the newest). */
export const readLatestAudit = async (reader: RepoReader): Promise<AuditReportForRisk | undefined> => {
	const dir = '.harness/audits';
	const latest = (await reader.list(dir))
		?.filter((n) => n.endsWith('.json'))
		.sort()
		.at(-1);
	if (!latest) return undefined;
	const report = parse<{ findings?: AuditReportForRisk['findings']; hotspots?: { path: string }[] }>(
		await reader.read(`${dir}/${latest}`),
	);
	if (!report) return undefined;
	return { findings: report.findings ?? [], hotspots: report.hotspots ?? [] };
};

/** The first reader that has the folder or file wins. */
export const firstOf = (...readers: RepoReader[]): RepoReader => ({
	async list(dir) {
		for (const r of readers) {
			const names = await r.list(dir);
			if (names) return names;
		}
		return undefined;
	},
	async read(file) {
		for (const r of readers) {
			const text = await r.read(file);
			if (text !== undefined) return text;
		}
		return undefined;
	},
});
