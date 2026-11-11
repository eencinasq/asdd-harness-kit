/**
 * Pull acceptance criteria and definition-of-done items out of free ticket text (Jira, Linear,
 * GitHub issue or pasted). Pure and heuristic: it understands the usual shapes (headings in English
 * or Spanish, bullet / checkbox / numbered lists, Gherkin scenarios). When it finds nothing, the
 * agent passes the criteria explicitly instead.
 */
import type { Criterion, CriterionKind } from './requirements.types.ts';

const MAX_CRITERION_CHARS = 400;

const AC_HEADING =
	/^(acceptance\s+criteria|ac|criterios?\s+de\s+aceptaci[oó]n|criterios?\s+de\s+[eé]xito|requisitos|requirements|scope|alcance)\b/i;
const DOD_HEADING =
	/^(definition\s+of\s+done|dod|done\s+when|definici[oó]n\s+de\s+(terminado|hecho|listo)|puntos?\s+de\s+terminaci[oó]n|criterios?\s+de\s+terminaci[oó]n|checklist)\b/i;

/** Strip Markdown / Jira wiki heading syntax: `## AC`, `h3. AC`, `**AC:**`, `AC:`. */
const headingText = (line: string): string | undefined => {
	const trimmed = line.trim();
	const md = /^#{1,6}\s+(.+)$/.exec(trimmed)?.[1];
	const jira = /^h[1-6]\.\s+(.+)$/i.exec(trimmed)?.[1];
	const bold = /^\*\*(.+?)\*\*:?\s*$/.exec(trimmed)?.[1] ?? /^\*(.+?)\*:?\s*$/.exec(trimmed)?.[1];
	const colon = /^([^:]{2,60}):\s*$/.exec(trimmed)?.[1];
	const text = md ?? jira ?? bold ?? colon;
	return text?.replace(/[*_:`]/g, '').trim();
};

const sectionKind = (heading: string): CriterionKind | 'other' =>
	DOD_HEADING.test(heading) ? 'done' : AC_HEADING.test(heading) ? 'acceptance' : 'other';

/** `- x`, `* x`, `1. x`, `1) x`, `- [ ] x`, `# x` (Jira numbered), `(/) x`. */
const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)]|#(?!#)|\(\/\)|\(x\))\s+(?:\[[ xX]\]\s+)?(.+)$/;
const GHERKIN_START = /^\s*(scenario|escenario|given|dado|dada|dados|dadas)\b/i;
const GHERKIN_STEP = /^\s*(given|when|then|and|but|dado|dada|dados|dadas|cuando|entonces|y|pero)\b/i;

const clean = (text: string): string =>
	text
		.replace(/\s+/g, ' ')
		.replace(/^[*_]+|[*_]+$/g, '')
		.trim()
		.slice(0, MAX_CRITERION_CHARS);

type Section = { readonly kind: CriterionKind | 'other'; readonly lines: string[] };

const splitSections = (text: string): Section[] => {
	const sections: Section[] = [{ kind: 'other', lines: [] }];
	for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
		const heading = headingText(line);
		if (heading !== undefined && !LIST_ITEM.test(line)) {
			sections.push({ kind: sectionKind(heading), lines: [] });
			continue;
		}
		sections.at(-1)?.lines.push(line);
	}
	return sections;
};

/** Items of one section: list items (with wrapped continuation lines) and Gherkin scenarios. */
const itemsOf = (lines: readonly string[]): string[] => {
	const items: string[] = [];
	let gherkin: string[] | null = null;
	const flushGherkin = () => {
		if (gherkin?.length) items.push(gherkin.join(' · '));
		gherkin = null;
	};
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			flushGherkin();
			continue;
		}
		if (GHERKIN_START.test(line) && /^\s*(scenario|escenario)\b/i.test(line)) {
			flushGherkin();
			gherkin = [clean(line)];
			continue;
		}
		if (gherkin && GHERKIN_STEP.test(line)) {
			gherkin.push(clean(line));
			continue;
		}
		if (!gherkin && GHERKIN_START.test(line)) {
			gherkin = [clean(line)];
			continue;
		}
		flushGherkin();
		const item = LIST_ITEM.exec(line)?.[1];
		if (item) items.push(clean(item));
		else if (items.length > 0 && /^\s{2,}\S/.test(raw)) items[items.length - 1] = clean(`${items.at(-1)} ${line}`);
	}
	flushGherkin();
	return items.filter((i) => i.length > 2);
};

/**
 * Criteria found in the ticket text. Sections under AC / DoD headings win; without headings, a
 * checklist (`- [ ]`) or Gherkin scenarios anywhere count as acceptance criteria.
 */
export const extractCriteria = (text: string): Criterion[] => {
	const sections = splitSections(text);
	const found: Array<{ kind: CriterionKind; text: string }> = [];
	for (const section of sections) {
		if (section.kind === 'other') continue;
		for (const item of itemsOf(section.lines)) found.push({ kind: section.kind, text: item });
	}
	if (found.length === 0) {
		const all = text.split(/\r?\n/);
		const checklist = all.filter((l) => /^\s*[-*]\s+\[[ xX]\]\s+/.test(l));
		const scenarios = itemsOf(all).filter((i) => /^(scenario|escenario|given|dado)/i.test(i));
		for (const item of checklist.length ? itemsOf(checklist) : scenarios)
			found.push({ kind: 'acceptance', text: item });
	}
	return numberCriteria(found);
};

/** Stable ids: AC-1…n then DOD-1…n, de-duplicated by text. */
export const numberCriteria = (
	items: readonly { readonly kind: CriterionKind; readonly text: string }[],
): Criterion[] => {
	const seen = new Set<string>();
	const counters: Record<CriterionKind, number> = { acceptance: 0, done: 0 };
	const out: Criterion[] = [];
	for (const item of items) {
		const text = clean(item.text);
		const key = `${item.kind}:${text.toLowerCase()}`;
		if (!text || seen.has(key)) continue;
		seen.add(key);
		counters[item.kind] += 1;
		out.push({ id: `${item.kind === 'acceptance' ? 'AC' : 'DOD'}-${counters[item.kind]}`, kind: item.kind, text });
	}
	return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'acceptance' ? -1 : 1));
};
