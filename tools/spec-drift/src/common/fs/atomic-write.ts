import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Write a file so readers see either the old or the new content, never a torn mix: write a temp
 * file next to it, then rename over it (atomic on the same filesystem).
 */
export const writeFileAtomic = async (file: string, text: string): Promise<void> => {
	const tmp = path.join(
		path.dirname(file),
		`.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
	);
	try {
		await fs.writeFile(tmp, text, 'utf8');
		await fs.rename(tmp, file);
	} catch (error) {
		await fs.rm(tmp, { force: true });
		throw error;
	}
};

export const writeJsonAtomic = (file: string, value: unknown): Promise<void> =>
	writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
