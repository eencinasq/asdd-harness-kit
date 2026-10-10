#!/usr/bin/env node
/**
 * Jev MCP Server for Command Gating (zero-dependency stdio server).
 *
 * Exposes the same command-safety policy used by the runtime hooks as an MCP
 * tool. The policy (pattern whitelist/deny + Jev noul evaluation) lives in
 * `.harness/scripts/jev-command-gate.mjs` — this server is only a transport.
 *
 * Usage:
 *   node .agents/mcp/jev-gate-server.mjs
 *
 * Integration:
 *   Register as a stdio MCP server (see .agents/mcp/mcp.json). Runtime hook
 *   enforcement (e.g. Cursor `beforeShellExecution`) calls
 *   `.harness/scripts/jev-command-gate.mjs` directly; this server serves
 *   runtimes whose native MCP gating prefers a tool call.
 *
 * Protocol: MCP over line-delimited JSON-RPC 2.0 on stdio
 *   (initialize / notifications/initialized / ping / tools/list / tools/call).
 */
import { createInterface } from 'node:readline';
import { checkCommandSafety } from '../../.harness/scripts/jev-command-gate.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'jev-gate-server', version: '3.1.0' };

const TOOLS = [
  {
    name: 'check_command_safety',
    description: 'Check if a bash command is safe to execute using the harness command gate (patterns first, Jev noul for dangerous commands)',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to check',
        },
        override: {
          type: 'boolean',
          description: 'Override the gate decision (user-authorized; use with caution)',
          default: false,
        },
      },
      required: ['command'],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function toolResult(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

async function handleToolCall(id, params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name !== 'check_command_safety') {
    reply(id, toolResult({ error: `Unknown tool: ${name}` }, true));
    return;
  }
  if (typeof args.command !== 'string' || !args.command.trim()) {
    reply(id, toolResult({ error: 'arguments.command must be a non-empty string' }, true));
    return;
  }
  try {
    const result = await checkCommandSafety(args.command, { override: args.override === true });
    reply(id, toolResult(result));
  } catch (error) {
    replyError(id, -32603, error?.message || 'gate evaluation failed');
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return;
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    case 'ping':
      if (!isNotification) reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call':
      await handleToolCall(id, params);
      return;
    default:
      if (isNotification) return; // initialize-complete notifications etc.
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (error) {
    replyError(null, -32700, `Parse error: ${error.message}`);
    return;
  }
  try {
    await handleMessage(message);
  } catch (error) {
    replyError(message?.id ?? null, -32603, error?.message || 'internal error');
  }
});

process.stderr.write('Jev MCP Gate Server started (stdio)\n');
