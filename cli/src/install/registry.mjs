// Module manifests + the contribution-point registry (platform contract D-1/D-2):
// manifests load and validate fail-closed before any mount — unregistered contributes types, engines.asdd
// mismatch, source-tree escapes, undeclared executable contracts, and inter-manifest mount collisions all abort.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { CliError } from '../paths.mjs';
import { compareVersions, parseVersion } from '../semver.mjs';
import { filesUnder, SKIPPED } from './context.mjs';

const REGISTRY_PATH = 'cli/registry/contribution-points.json';
const MODULE_DIR = 'cli/modules';
const MODULE_MANIFEST = 'module.json';

// contributes.<key> → registry contribution_point key (D-2). A key not in this map is unregistered.
const CONTRIBUTES_TYPES = {
  agents: 'agent',
  skills: 'skill',
  rules: 'rule',
  steering: 'steering',
  bindings: 'binding',
  adapters: 'adapter',
  mcp: 'mcp_server',
  hooks: 'hook',
};
// Registered classes a consumer manifest may not contribute yet (Phase 1 scoping — Q-NEW-3).
const KIT_INTERNAL = new Set(['commands', 'phases']);
// Contribution types that are executable trust: they must declare a contract and sit under trust: "executable".
const EXECUTABLE_TYPES = new Set(['adapters', 'mcp', 'hooks']);
const TRUST_TIERS = new Set(['declarative', 'executable']);
// Known executable contracts (the executable trust boundary). Consumers may only declare these.
const KNOWN_CONTRACTS = new Set(['spec-drift-adapter', 'harness-telemetry']);

export function loadRegistry(kit) {
  const path = join(kit, REGISTRY_PATH);
  if (!existsSync(path)) throw new CliError(`missing ${REGISTRY_PATH} — the contribution-point registry is required`);
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (registry.schema_version !== '1.0') {
    throw new CliError(`${REGISTRY_PATH}: schema_version ${JSON.stringify(registry.schema_version)} != "1.0"`);
  }
  if (!registry.contribution_points || typeof registry.contribution_points !== 'object') {
    throw new CliError(`${REGISTRY_PATH}: missing "contribution_points"`);
  }
  // G-16/invariant 1: a class whose tracked artifacts lack a source_root is a broken contribution — installed-side-
  // only kit files can neither ship nor stamp. trust:"state" classes are exempt: sessions, summaries, and trackers
  // are authored in place, not shipped copies.
  for (const [name, cls] of Object.entries(registry.contribution_points)) {
    if (cls?.merge?.tracked === true && cls?.trust !== 'state' && !cls?.source_root) {
      throw new CliError(`${REGISTRY_PATH}: contribution point "${name}" is tracked but declares no source_root (G-16)`);
    }
  }
  return registry;
}

const kitVersion = (kit) => JSON.parse(readFileSync(join(kit, 'package.json'), 'utf8')).version;

/** Is `version` inside `range` (a single comparator: >=, <=, >, <, =, ^, ~, exact, or *)? Unparseable ranges fail closed. */
export function enginesSatisfied(range, version) {
  if (range === undefined) return true;
  const v = parseVersion(version);
  if (!v) return false;
  const r = String(range).trim();
  if (r === '*') return true;
  const m = /^([<>=^~]+)?\s*(\S+)$/.exec(r);
  if (!m || !parseVersion(m[2])) return false;
  const cmp = compareVersions(version, m[2]);
  const op = m[1] ?? '=';
  if (op === '=' || op === '==') return cmp === 0;
  if (op === '>=') return cmp >= 0;
  if (op === '<=') return cmp <= 0;
  if (op === '>') return cmp > 0;
  if (op === '<') return cmp < 0;
  const [bMaj, bMin] = parseVersion(m[2]);
  if (op === '^') return cmp >= 0 && v[0] === bMaj && (bMaj > 0 || v[1] === bMin);
  if (op === '~') return cmp >= 0 && v[0] === bMaj && v[1] === bMin;
  return false;
}

/** Read + structurally validate cli/modules/<name>/module.json (D-1). Fails closed on any defect. */
export function readManifest(kit, name, registry = loadRegistry(kit)) {
  const dir = join(kit, MODULE_DIR, name);
  const path = join(dir, MODULE_MANIFEST);
  const where = `${MODULE_DIR}/${name}/${MODULE_MANIFEST}`;
  if (!existsSync(dir)) throw new CliError(`unknown module: ${name} (no ${MODULE_DIR}/${name}/)`);
  if (!existsSync(path)) throw new CliError(`${where}: missing manifest — modules must declare ${MODULE_MANIFEST}`);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const field of ['schema_version', 'name', 'version', 'trust', 'contributes']) {
    if (manifest[field] === undefined) throw new CliError(`${where}: missing "${field}"`);
  }
  if (manifest.schema_version !== '1.0') throw new CliError(`${where}: schema_version ${JSON.stringify(manifest.schema_version)} != "1.0"`);
  if (manifest.name !== name) throw new CliError(`${where}: name "${manifest.name}" != directory "${name}"`);
  if (!parseVersion(manifest.version)) throw new CliError(`${where}: version ${JSON.stringify(manifest.version)} is not x.y.z`);
  if (!TRUST_TIERS.has(manifest.trust)) throw new CliError(`${where}: trust must be one of ${[...TRUST_TIERS].join(', ')}`);
  if (!enginesSatisfied(manifest.engines?.asdd, kitVersion(kit))) {
    throw new CliError(`${where}: engines.asdd ${JSON.stringify(manifest.engines?.asdd)} incompatible with kit ${kitVersion(kit)}`);
  }
  const contributes = manifest.contributes;
  if (!contributes || typeof contributes !== 'object' || Array.isArray(contributes)) {
    throw new CliError(`${where}: contributes must be an object`);
  }
  for (const [type, entries] of Object.entries(contributes)) {
    if (KIT_INTERNAL.has(type)) throw new CliError(`${where}: contributes.${type} is kit-internal (Q-NEW-3)`);
    const cls = CONTRIBUTES_TYPES[type];
    if (!cls || !registry.contribution_points[cls]) {
      throw new CliError(`${where}: unregistered contributes type "${type}" (no contribution point for it)`);
    }
    if (!Array.isArray(entries) || !entries.length) throw new CliError(`${where}: contributes.${type} must be a non-empty array`);
    if (EXECUTABLE_TYPES.has(type) && manifest.trust !== 'executable') {
      throw new CliError(`${where}: contributes.${type} is executable — trust must be "executable"`);
    }
    for (const e of entries) {
      if (!e || typeof e.path !== 'string' || !e.path) throw new CliError(`${where}: contributes.${type} entry missing "path"`);
      if (typeof e.mount !== 'string' || !e.mount) throw new CliError(`${where}: contributes.${type} "${e.path}" missing "mount"`);
      if (e.contract !== undefined && !EXECUTABLE_TYPES.has(type)) {
        throw new CliError(`${where}: contributes.${type} "${e.path}" declares a contract but is not an executable type`);
      }
      if (EXECUTABLE_TYPES.has(type)) {
        if (typeof e.contract !== 'string' || !e.contract) throw new CliError(`${where}: contributes.${type} "${e.path}" must declare a contract`);
        if (!KNOWN_CONTRACTS.has(e.contract)) throw new CliError(`${where}: unknown contract "${e.contract}" (${[...KNOWN_CONTRACTS].join(', ')})`);
      }
    }
  }
  return manifest;
}

const badMount = (mount) => mount.startsWith('/') || /^[A-Za-z]:/.test(mount) || mount.split('/').includes('..');

/**
 * Expand a manifest's contributes into {type, src(abs), dest(project-rel)} pairs. Directory paths expand via
 * filesUnder with the same SKIPPED filter copyTree applies, so the mount map equals what an install would write.
 */
export function mountMap(kit, manifest) {
  const modDir = resolve(join(kit, MODULE_DIR, manifest.name));
  const where = `${MODULE_DIR}/${manifest.name}/${MODULE_MANIFEST}`;
  const pairs = [];
  for (const [type, entries] of Object.entries(manifest.contributes)) {
    for (const e of entries) {
      if (badMount(e.mount)) throw new CliError(`${where}: contributes.${type} mount "${e.mount}" must be a relative project path`);
      const src = resolve(modDir, e.path);
      if (src !== modDir && !src.startsWith(modDir + sep)) {
        throw new CliError(`${where}: contributes.${type} path "${e.path}" escapes the module tree`);
      }
      if (!existsSync(src)) throw new CliError(`${where}: contributes.${type} path "${e.path}" does not exist`);
      if (statSync(src).isDirectory()) {
        for (const rel of filesUnder(src)) {
          if (SKIPPED.test(rel.split('/').pop())) continue;
          pairs.push({ type, src: join(src, rel), dest: join(e.mount, rel) });
        }
      } else {
        pairs.push({ type, src, dest: e.mount });
      }
    }
  }
  return pairs;
}

// Adapter sources must not write to the repository — the spec-drift contract is stateless + read-only (D-7).
// Bound commands the adapter itself invokes (spawnSync/fetch) are its feature, not writes.
const WRITE_CALL = /\b(?:writeFileSync|appendFileSync|rmSync|mkdirSync|createWriteStream|writeFile|appendFile)\s*\(/;
// harness-telemetry is append-only: emit() sinks may appendFile*/O_APPEND; every other mutating call fails closed.
const MUTATING_CALL = /\b(?:writeFileSync|writeFile|rmSync|mkdirSync|createWriteStream|truncateSync|truncate|unlinkSync|unlink|renameSync|rename|copyFileSync|copyFile|cpSync|rmdirSync|rmdir)\s*\(/;
// The contract requires a literal `export default { … }` so the shape stays statically auditable (D-7).
const DEFAULT_BLOCK = /export\s+default\s*\{([\s\S]*?)\n\}/;

// Executable contract subtypes (v3 §2.2): literal export shape + filesystem discipline, enforced at validate time.
const CONTRACT_SHAPES = {
  'spec-drift-adapter': { entry: 'run', discipline: 'read-only', banned: WRITE_CALL },
  'harness-telemetry': { entry: 'emit', discipline: 'append-only', banned: MUTATING_CALL },
};

/**
 * G-13/D-7 shape check: an adapter contribution must literal-export its contract's {id, description, <entry>}
 * and stay inside the contract's filesystem discipline. Runs at validate time (install/module enable), so a
 * malformed executable fails before any copy. Non-literal exports and unknown contract subtypes fail closed.
 */
export function checkExecutableShape(kit, manifest) {
  const where = `${MODULE_DIR}/${manifest.name}/${MODULE_MANIFEST}`;
  for (const e of manifest.contributes?.adapters ?? []) {
    const src = resolve(join(kit, MODULE_DIR, manifest.name, e.path));
    if (statSync(src).isDirectory()) continue; // dir mounts expand to files; each file is checked via mountMap callers
    const contract = e.contract ?? 'spec-drift-adapter';
    const shape = CONTRACT_SHAPES[contract];
    if (!shape) {
      throw new CliError(`${where}: adapter "${e.path}" declares unknown contract "${contract}" (known: ${Object.keys(CONTRACT_SHAPES).join(', ')})`);
    }
    const text = readFileSync(src, 'utf8');
    if (shape.banned.test(text)) {
      throw new CliError(`${where}: adapter "${e.path}" calls a mutating filesystem call — the ${contract} contract is ${shape.discipline}`);
    }
    const want = `{id, description, ${shape.entry}}`;
    const block = DEFAULT_BLOCK.exec(text)?.[1];
    if (!block) {
      throw new CliError(`${where}: adapter "${e.path}" must literal-export default ${want}`);
    }
    for (const field of ['id', 'description']) {
      if (!new RegExp(`\\b${field}\\s*:`).test(block)) {
        throw new CliError(`${where}: adapter "${e.path}" default export missing ${field} (contract: ${want})`);
      }
    }
    if (!new RegExp(`\\b${shape.entry}\\s*[(:]`).test(block)) {
      throw new CliError(`${where}: adapter "${e.path}" default export missing ${shape.entry} (contract: ${want})`);
    }
  }
}

/**
 * Validate every named module's manifest and reject inter-manifest mount collisions (G-15). Runs before any
 * copy so a half-applied module set is impossible. Executable contributions also pass the G-13 shape check.
 */
export function validateModules(kit, names) {
  const registry = loadRegistry(kit);
  const taken = new Map();
  for (const name of names) {
    const manifest = readManifest(kit, name, registry);
    for (const p of mountMap(kit, manifest)) {
      const owner = taken.get(p.dest);
      if (owner) throw new CliError(`mount collision: "${p.dest}" claimed by both "${owner}" and "${manifest.name}"`);
      taken.set(p.dest, manifest.name);
    }
    checkExecutableShape(kit, manifest);
  }
}

/** The registry's file-level install rows ({src, dest, class, install, self}) — the single enumeration SoT. */
export function registryFiles(kit) {
  return loadRegistry(kit).files ?? [];
}

/** Runtime wiring map from the registry: name → {dir, committed[]}. Derives RUNTIMES/RUNTIME_DIRS/RUNTIME_PATHS. */
export function runtimeMap(kit) {
  return loadRegistry(kit).runtimes ?? {};
}

/** Representative committed paths the project's .gitignore must not hide (ignore check, index.mjs). */
export function committedChecks(kit) {
  return loadRegistry(kit).committed_checks?.paths ?? [];
}

/** Retired kit/jev paths the installer removes when provably kit-managed. */
export function retiredPaths(kit, key) {
  return loadRegistry(kit).retired?.[key] ?? [];
}

/**
 * .gitignore lines derived from class `ignore_patterns` (merge.tracked:false classes only — a tracked class
 * declaring ignore patterns is a contract violation and fails closed).
 */
export function gitignoreLines(kit) {
  const registry = loadRegistry(kit);
  const lines = [];
  for (const [name, cls] of Object.entries(registry.contribution_points)) {
    const patterns = cls.ignore_patterns ?? [];
    if (!patterns.length) continue;
    if (cls.merge?.tracked !== false) {
      throw new CliError(`registry: ${name} declares ignore_patterns but merge.tracked is not false`);
    }
    lines.push(...patterns);
  }
  return lines;
}

/**
 * .gitattributes rules derived from class `attribute_globs` + `merge.driver` (D-4):
 * driver "-merge" → `-merge` (intentional conflict; resolution = regen + git add), driver "ours" → `merge=ours`.
 * Tracked classes only — a class without tracked:true declaring attribute globs is a contract violation.
 */
export function gitattributeLines(kit) {
  const registry = loadRegistry(kit);
  const lines = [];
  for (const [name, cls] of Object.entries(registry.contribution_points)) {
    const globs = cls.attribute_globs ?? [];
    if (!globs.length) continue;
    if (cls.merge?.tracked !== true) {
      throw new CliError(`registry: ${name} declares attribute_globs but merge.tracked is not true`);
    }
    const attr = cls.merge.driver === 'ours' ? 'merge=ours' : cls.merge.driver === '-merge' ? '-merge' : null;
    if (!attr) throw new CliError(`registry: ${name} declares attribute_globs but has no merge driver`);
    lines.push(...globs.map((g) => `${g} ${attr}`));
  }
  return lines;
}
