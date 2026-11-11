// `asdd kit self [--check]`: the kit repo installs itself — its .harness/ gets fresh copies of what cli/ ships, like a
// project. --check changes nothing and exits 1 while a copy differs from its source in cli/ (npm test runs it).
import { runInstall } from '../install/index.mjs';
import { KIT_ROOT } from '../paths.mjs';
import { setQuiet } from '../ui.mjs';

export function run(argv = []) {
  const check = argv.includes('--check');
  if (check) setQuiet(true);
  const result = runInstall({ target: KIT_ROOT, dryRun: check, noInteractive: true, modules: '', removeModules: '', runtimes: '' }, KIT_ROOT);
  if (!check) return 0;
  setQuiet(false);
  const stale = result.files.created + result.files.updated;
  if (stale) {
    console.error(`${stale} installed file(s) in .harness/, .agents/, or AGENTS.md differ from their source in cli/. Run: node cli/bin/asdd.mjs kit self`);
    return 1;
  }
  console.log('OK the kit installed copies (.harness/, .agents/, AGENTS.md) match cli/');
  return 0;
}
