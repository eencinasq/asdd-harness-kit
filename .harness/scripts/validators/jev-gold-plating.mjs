/**
 * Jev gold-plating — disabled for harness ASDD.
 *
 * Jev is skill-scoped to shape-up + product-delivery only. Harness scope
 * control is deterministic: session-loop file mapping + features.mjs.
 * Kept as a no-op export so older callers do not break.
 */
export async function validateJevGoldPlating(_ctx) {
  return;
}
