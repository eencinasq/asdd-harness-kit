import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ClientRootsSync, type RootsRequestContext } from './client-roots.interceptor.ts';
import { WorkspaceRoot } from './workspace-root.ts';

const context = (
	overrides: Partial<RootsRequestContext> & { roots?: readonly { uri: string }[]; fail?: Error } = {},
): RootsRequestContext & { calls: number } => {
	const ctx = {
		transport: 'stdio' as const,
		era: 'legacy' as const,
		calls: 0,
		server: {
			mcpReq: {
				send: async () => {
					ctx.calls += 1;
					if (overrides.fail) throw overrides.fail;
					return { roots: overrides.roots ?? [] };
				},
			},
		},
		...overrides,
	};
	return ctx;
};

const setup = () => {
	const workspace = new WorkspaceRoot({}, '/cwd');
	const warnings: string[] = [];
	const sync = new ClientRootsSync(workspace, { warn: (message: string) => warnings.push(message) });
	return { workspace, sync, warnings };
};

describe('ClientRootsSync', () => {
	test('adopts the roots the client reports over stdio', async () => {
		const { workspace, sync } = setup();
		await sync.refresh(context({ roots: [{ uri: 'file:///Users/me/project-a' }] }));
		assert.equal(workspace.analysisRoot(), '/Users/me/project-a');
	});

	test('asks again on every call, so a new project is picked up', async () => {
		const { workspace, sync } = setup();
		await sync.refresh(context({ roots: [{ uri: 'file:///Users/me/project-a' }] }));
		await sync.refresh(context({ roots: [{ uri: 'file:///Users/me/project-b' }] }));
		assert.equal(workspace.analysisRoot(), '/Users/me/project-b');
	});

	test('does not ask over HTTP or on the 2026-07-28 era', async () => {
		const { sync } = setup();
		const http = context({ transport: 'http', roots: [{ uri: 'file:///x' }] });
		const modern = context({ era: 'modern', roots: [{ uri: 'file:///x' }] });
		await sync.refresh(http);
		await sync.refresh(modern);
		assert.equal(http.calls + modern.calls, 0);
	});

	test('a client without roots keeps the fallback, warns once and is not asked again', async () => {
		const { workspace, sync, warnings } = setup();
		const failing = context({ fail: new Error('Method not found') });
		await sync.refresh(failing);
		await sync.refresh(failing);
		assert.equal(workspace.analysisRoot(), '/cwd');
		assert.equal(failing.calls, 1);
		assert.equal(warnings.length, 1);
	});
});
