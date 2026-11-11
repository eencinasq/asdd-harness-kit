export const countBy = <K extends string>(
	items: readonly { readonly [P in K]: string }[],
	key: K,
): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const item of items) {
		const k = item[key];
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
};
