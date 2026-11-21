import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { WorkspaceRoot } from './workspace-root.ts';

const setup = (explicit: { analysis?: string; harness?: string; prReview?: string } = {}) =>
	new WorkspaceRoot(explicit, '/cwd');

describe('WorkspaceRoot', () => {
	test('falls back to the working directory with no explicit root and no client roots', () => {
		const workspace = setup();
		assert.equal(workspace.analysisRoot(), '/cwd');
		assert.equal(workspace.harnessRoot(), '/cwd');
		assert.equal(workspace.prReviewRepo(), '/cwd');
		assert.equal(workspace.source(), 'cwd');
	});

	test('follows the first file:// root the MCP client reports', () => {
		const workspace = setup();
		workspace.adoptClientRoots([{ uri: 'https://example.test/x' }, { uri: 'file:///Users/me/project-a' }]);
		assert.equal(workspace.analysisRoot(), '/Users/me/project-a');
		assert.equal(workspace.harnessRoot(), '/Users/me/project-a');
		assert.equal(workspace.prReviewRepo(), '/Users/me/project-a');
		assert.equal(workspace.source(), 'client-roots');
	});

	test('switches when the client reports new roots, and returns to cwd when it reports none', () => {
		const workspace = setup();
		workspace.adoptClientRoots([{ uri: 'file:///Users/me/project-a' }]);
		workspace.adoptClientRoots([{ uri: 'file:///Users/me/project-b' }]);
		assert.equal(workspace.analysisRoot(), '/Users/me/project-b');
		workspace.adoptClientRoots([]);
		assert.equal(workspace.analysisRoot(), '/cwd');
	});

	test('decodes percent-encoded file URIs', () => {
		const workspace = setup();
		workspace.adoptClientRoots([{ uri: 'file:///Users/me/my%20project' }]);
		assert.equal(workspace.analysisRoot(), '/Users/me/my project');
	});

	test('an explicit root wins over the client roots, per root', () => {
		const workspace = setup({ harness: '/pinned/harness' });
		workspace.adoptClientRoots([{ uri: 'file:///Users/me/project-a' }]);
		assert.equal(workspace.harnessRoot(), '/pinned/harness');
		assert.equal(workspace.analysisRoot(), '/Users/me/project-a');
	});
});
