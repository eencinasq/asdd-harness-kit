#!/usr/bin/env node
/**
 * Validate the project-specific adapter for the portable ASDD + Harness core.
 * Run from the project root: node .harness/scripts/check-project-config.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const configPath = '.harness/config/project.json';
const errors = [];
const warnings = [];

function readJson(relativePath) {
	const absolutePath = join(root, relativePath);
	if (!existsSync(absolutePath)) {
		errors.push(`missing JSON: ${relativePath}`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(absolutePath, 'utf8'));
	} catch (error) {
		errors.push(`invalid JSON ${relativePath}: ${error.message}`);
		return null;
	}
}

function requireString(object, key, location) {
	if (typeof object?.[key] !== 'string' || !object[key].trim()) {
		errors.push(`${location}.${key} must be a non-empty string`);
	}
}

const config = readJson(configPath);
if (config) {
	if (config.schema_version !== '1.0') {
		errors.push(`${configPath}.schema_version must be "1.0"`);
	}
	requireString(config, 'project_id', configPath);
	requireString(config, 'harness_version', configPath);
	if (config.kit !== undefined) {
		for (const key of ['name', 'source', 'ref']) {
			requireString(config.kit, key, configPath + '.kit');
		}
	}
	if (!['full', 'lite'].includes(config.mode)) {
		errors.push(`${configPath}.mode must be "full" or "lite"`);
	}

	const requiredPaths = [
		'steering',
		'specs',
		'state',
		'features',
		'progress',
		'progress_index',
		'locks',
	];
	for (const key of requiredPaths) {
		requireString(config.paths, key, `${configPath}.paths`);
		const relativePath = config.paths?.[key];
		if (typeof relativePath === 'string' && !existsSync(join(root, relativePath))) {
			errors.push(`configured path does not exist: ${relativePath}`);
		}
	}

	const requiredBindings = [
		'product',
		'structure',
		'tech',
		'domain_layer',
		'quality_gates',
	];
	for (const key of requiredBindings) {
		requireString(config.bindings, key, `${configPath}.bindings`);
		const relativePath = config.bindings?.[key];
		if (typeof relativePath === 'string' && !existsSync(join(root, relativePath))) {
			if (config.bindings_complete === false) {
				warnings.push(`project binding is not created yet: ${relativePath}`);
			} else {
				errors.push(`configured binding does not exist: ${relativePath}`);
			}
		}
	}

	if (!config.commands || typeof config.commands !== 'object') {
		errors.push(`${configPath}.commands must be an object`);
	} else {
		requireString(config.commands, 'invariants', `${configPath}.commands`);
	}

	if (!config.modules || typeof config.modules !== 'object') {
		errors.push(`${configPath}.modules must be an object`);
	}
	if (!config.capabilities || typeof config.capabilities !== 'object') {
		errors.push(`${configPath}.capabilities must be an object`);
	}
	if (config.bindings_complete === false) {
		warnings.push('project bindings are scaffolded but still require project-specific content');
	}
}

for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (errors.length) {
	for (const error of errors) console.error(`FAIL  ${error}`);
	process.exit(1);
}
console.log('PASS  project configuration');
