import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseToolsets, toolsetEnabled } from './toolsets.ts';

test('spec-drift-adoption REQ-003: toolsets default to all, accept a list, and reject unknown names', () => {
	assert.deepEqual(parseToolsets(undefined), ['analysis', 'review', 'audit']);
	assert.deepEqual(parseToolsets(' '), ['analysis', 'review', 'audit']);
	assert.deepEqual(parseToolsets('Review, audit'), ['review', 'audit']);
	assert.throws(() => parseToolsets('review,reviews'), /unknown toolset "reviews"\. Use: analysis, review, audit\./);
	assert.equal(toolsetEnabled('analysis', { SPEC_DRIFT_TOOLSETS: 'review' }), false);
	assert.equal(toolsetEnabled('review', { SPEC_DRIFT_TOOLSETS: 'review' }), true);
});
