import fs from 'node:fs/promises';
import path from 'node:path';
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import type { ReadResourceResult } from '@modelcontextprotocol/server';

import { DIST_DIR } from '../../config/paths.ts';

/**
 * Server-side helpers for MCP Apps (`@modelcontextprotocol/ext-apps`) on top of `@nestjs/mcp`
 * decorators, replacing `registerAppTool` / `registerAppResource`.
 */

export { RESOURCE_MIME_TYPE };

export type AppToolVisibility = 'model' | 'app';

/**
 * `_meta` for a tool that opens an MCP App view. Mirrors `registerAppTool`: sets `ui.resourceUri`
 * plus the legacy flat `ui/resourceUri` key so older hosts still find the view.
 * Pass `['app']` for tools only the view may call (hidden from the model).
 */
export const appToolMeta = (resourceUri: string, visibility?: AppToolVisibility[]): Record<string, unknown> => ({
	ui: visibility ? { resourceUri, visibility } : { resourceUri },
	[RESOURCE_URI_META_KEY]: resourceUri,
});

/** Read a Vite single-file bundle from `dist/` as an MCP App HTML resource. */
export const readAppHtml = async (uri: string, file: string): Promise<ReadResourceResult> => ({
	contents: [
		{
			uri,
			mimeType: RESOURCE_MIME_TYPE,
			text: await fs.readFile(path.join(DIST_DIR, file), 'utf-8'),
		},
	],
});
