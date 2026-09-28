#!/usr/bin/env node
/**
 * Regenerate Codex + OpenCode MCP projections from .agents/mcp/mcp.json
 * Cross-platform (macOS / Linux / Windows) — prefer this over the .sh wrapper.
 */
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..', '..');
const mcpJson = join(root, '.agents/mcp/mcp.json');
const mcp = JSON.parse(readFileSync(mcpJson, 'utf8'));

// OpenCode
const servers = {};
for (const [name, cfg] of Object.entries(mcp.mcpServers)) {
  if (cfg.url) {
    const e = { type: 'remote', url: cfg.url };
    if (cfg.headers) e.headers = cfg.headers;
    servers[name] = e;
  } else {
    servers[name] = {
      type: 'local',
      command: [cfg.command, ...(cfg.args || [])],
    };
  }
}
writeFileSync(
  join(root, '.agents/mcp/mcp.opencode.json'),
  JSON.stringify({ mcp: { servers } }, null, 2) + '\n',
);
const ocPath = join(root, 'opencode.json');
const oc = existsSync(ocPath)
  ? JSON.parse(readFileSync(ocPath, 'utf8'))
  : { $schema: 'https://opencode.ai/config.json' };
oc.mcp = { servers };
writeFileSync(ocPath, JSON.stringify(oc, null, 2) + '\n');

// Codex TOML fragment
const lines = ['# Auto-generated from .agents/mcp/mcp.json — do not edit by hand\n'];
for (const [name, cfg] of Object.entries(mcp.mcpServers)) {
  lines.push(`[mcp_servers.${name}]\n`);
  if (cfg.url) {
    lines.push(`url = "${cfg.url}"\n`);
    const headers = cfg.headers || {};
    if (Object.keys(headers).length) {
      lines.push(`[mcp_servers.${name}.http_headers]\n`);
      for (const [k, v] of Object.entries(headers)) {
        lines.push(`"${k}" = "${v}"\n`);
      }
    }
  } else {
    lines.push(`command = "${cfg.command}"\n`);
    const args = cfg.args || [];
    if (args.length) {
      const rendered = args.map((a) => `"${a}"`).join(', ');
      lines.push(`args = [${rendered}]\n`);
    }
  }
  lines.push('\n');
}
const frag = lines.join('');
writeFileSync(join(root, '.agents/mcp/mcp.codex.toml'), frag);

const codexCfg = join(root, '.codex', 'config.toml');
if (existsSync(codexCfg)) {
  let text = readFileSync(codexCfg, 'utf8');
  const begin =
    '# --- MCP (projected from .agents/mcp/mcp.json';
  const end = '# --- end MCP ---';
  const block =
    begin +
    '; do not edit by hand — run node .agents/mcp/sync-runtime-mcp.cjs) ---\n' +
    frag +
    end +
    '\n';
  const re = /# --- MCP \(projected from \.agents\/mcp\/mcp\.json[\s\S]*?# --- end MCP ---\n?/;
  if (re.test(text)) {
    text = text.replace(re, block);
  } else {
    text = text.trimEnd() + '\n\n' + block;
  }
  writeFileSync(codexCfg, text);
}

console.log('synced OpenCode + Codex from mcp.json');
