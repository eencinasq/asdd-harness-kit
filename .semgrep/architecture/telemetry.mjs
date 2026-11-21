// ruleid: arch.telemetry-guarded-import, arch.telemetry-lib-builtins-only
import { emit } from './telemetry-lib.mjs';
// ok: arch.telemetry-guarded-import, arch.telemetry-lib-builtins-only
import { join } from 'node:path';
// ruleid: arch.telemetry-lib-builtins-only
import { readSessions } from './sync-state.mjs';

async function emitSpan() {
  // ok: arch.telemetry-guarded-import
  // ruleid: arch.telemetry-lib-builtins-only
  const tel = await import('./telemetry-lib.mjs').catch(() => null);
  return tel;
}
