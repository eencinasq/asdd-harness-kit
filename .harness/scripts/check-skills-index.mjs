#!/usr/bin/env node
/**
 * Skills index is name + description only.
 * Catalog source: `.agents/skills/<folder>/SKILL.md` frontmatter.
 * Run from repo root:
 *   node .harness/scripts/check-skills-index.mjs
 *   node .harness/scripts/check-skills-index.mjs --write
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const skillsDir = join(root, '.agents/skills');
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
  if (!existsSync(skillsDir)) fail('missing .agents/skills');
  const folders = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
  return folders.map((folder) => {
    const description = parseDescription(readFileSync(join(skillsDir, folder, 'SKILL.md'), 'utf8'));
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
  fail('skills index does not match .agents/skills name and description. Run: node .harness/scripts/check-skills-index.mjs --write');
}
if (/^# /m.test(current)) fail('skills index contains a skill body heading');
console.log('PASS  skills index is name and description only');
