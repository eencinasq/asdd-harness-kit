#!/usr/bin/env node
/**
 * Skills index is name + description only.
 * Catalog sources: `.agents/skills/<folder>/SKILL.md` and
 * `.agents/modules/<module>/skills/<folder>/SKILL.md` frontmatter
 * (module skills install flat into `.agents/skills/` consumer-side).
 * Run from repo root:
 *   asdd skills-index
 *   asdd skills-index --write
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const skillsDir = join(root, '.agents/skills');
const modulesDir = join(root, '.agents/modules');
const indexPath = join(root, '.harness/steering/skills.md');
const start = '<!-- skills-index:start -->';
const end = '<!-- skills-index:end -->';
const write = process.argv.includes('--write');

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseName(text) {
  const endFm = text.indexOf('\n---\n', 4);
  if (!text.startsWith('---\n') || endFm < 0) return '';
  const line = text.slice(4, endFm).split('\n').find((l) => l.startsWith('name:'));
  return line ? unquote(line.slice('name:'.length).trim()) : '';
}

function parseDescription(text) {
  if (!text.startsWith('---\n')) fail('skill file missing frontmatter');
  const endFm = text.indexOf('\n---\n', 4);
  if (endFm < 0) fail('skill file has unterminated frontmatter');
  const lines = text.slice(4, endFm).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('description:')) continue;
    const rest = lines[i].slice('description:'.length).trim();
    if (rest === '>-' || rest === '>' || rest === '|-' || rest === '|') {
      const parts = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].startsWith('  ')) {
          const trimmed = lines[j].trim();
          if (trimmed) parts.push(trimmed);
          continue;
        }
        if (lines[j].trim() === '') continue;
        break;
      }
      return parts.join(' ');
    }
    return unquote(rest);
  }
  return '';
}

function catalog() {
  const dirs = [skillsDir];
  if (existsSync(modulesDir)) {
    for (const mod of readdirSync(modulesDir, { withFileTypes: true })) {
      const modSkills = join(modulesDir, mod.name, 'skills');
      if (mod.isDirectory() && existsSync(modSkills)) dirs.push(modSkills);
    }
  }
  const entries = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) fail(`missing ${dir}`);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const skillPath = join(dir, entry.name, 'SKILL.md');
      if (entry.isDirectory() && existsSync(skillPath)) {
        entries.push({ folder: entry.name, skillPath });
      }
    }
  }
  entries.sort((a, b) => a.folder.localeCompare(b.folder));
  const seen = new Set();
  return entries.map(({ folder, skillPath }) => {
    if (seen.has(folder)) fail(`${folder}: skill name is declared more than once across .agents/skills and .agents/modules/*/skills`);
    seen.add(folder);
    const text = readFileSync(skillPath, 'utf8');
    const name = parseName(text);
    if (name !== folder) fail(`${folder}: SKILL.md name "${name}" must match its folder name`);
    const description = parseDescription(text);
    if (!description) fail(`${folder}: SKILL.md description is empty`);
    if (description.includes('\n')) fail(`${folder}: description must be a single line in the index`);
    return { folder, description };
  });
}

function render(rows) {
  const lines = ['| Name | Description |', '| --- | --- |'];
  for (const row of rows) {
    lines.push(`| \`${row.folder}\` | ${row.description.replaceAll('|', '\\|')} |`);
  }
  return lines.join('\n');
}

if (!existsSync(indexPath)) fail('missing .harness/steering/skills.md');
const index = readFileSync(indexPath, 'utf8');
const startAt = index.indexOf(start);
const endAt = index.indexOf(end);
if (startAt < 0 || endAt < 0 || endAt < startAt) {
  fail('skills.md is missing the skills-index markers');
}

const rendered = render(catalog());
const current = index.slice(startAt + start.length, endAt).trim();
if (write) {
  const next = `${index.slice(0, startAt + start.length)}\n${rendered}\n${index.slice(endAt)}`;
  writeFileSync(indexPath, next);
  console.log('WROTE  skills index (name + description only)');
  process.exit(0);
}

if (current !== rendered) {
  fail('skills index does not match .agents/skills name and description. Run: asdd skills-index --write');
}
if (/^# /m.test(current)) fail('skills index contains a skill body heading');
console.log('PASS  skills index is name and description only');
