// ruleid: arch.no-global-manifest
const manifest = readJson('.harness/state/manifest.json');
// ok: arch.no-global-manifest
const registry = readJson('.harness/state/registry.json');
// ok: arch.no-global-manifest
const perSlice = readJson('.harness/state/slices/demo/manifest.json');
