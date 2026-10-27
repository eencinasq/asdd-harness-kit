#!/usr/bin/env node
/**
 * Jev MCP Server (zero-dependency stdio).
 *
 * Skill-scoped System One gates for shape-up + product-delivery, plus the
 * pattern-only command safety tool used by hooks/runtimes.
 *
 * Tools:
 *   jev_status          — assert JEV_API_KEY usable (skillRequired)
 *   jev_shape_up_gates  — appetite score + rabbit-hole noul
 *   jev_ears_gate       — EARS observability noul
 *   jev_slice_choice    — mvp|v1|v2|backlog choice
 *   check_command_safety — pattern allow/deny (no Jev)
 *
 * Protocol: MCP over line-delimited JSON-RPC 2.0 on stdio
 */
import { createInterface } from 'node:readline';
import { checkCommandSafety } from '../../.harness/scripts/jev-command-gate.mjs';
import {
  assertJevConfigured,
  shapeUpGates,
  earsGate,
  sliceChoice,
  THRESHOLDS,
} from '../../.harness/scripts/jev-gates.mjs';
import { jevHealthCheck } from '../../.harness/scripts/jev-client.mjs';
import { loadEnv } from '../../.harness/scripts/env-loader.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'jev-gate-server', version: '3.2.0' };

const TOOLS = [
  {
    name: 'jev_status',
    description:
      'Confirm Jev is configured for shape-up / product-delivery (JEV_API_KEY + capabilities.jev.enabled). Call before other jev_* tools. Do not use from harness ASDD agents.',
    inputSchema: {
      type: 'object',
      properties: {
        health: {
          type: 'boolean',
          description: 'If true, also ping System One',
          default: false,
        },
      },
    },
  },
  {
    name: 'jev_shape_up_gates',
    description:
      'Shape Up required gates: appetite jevScore + rabbit-hole jevNoul. Call after pitch draft, before betting. Fail if ok=false or unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        pitch: {
          type: 'object',
          description: 'Pitch payload (problem, appetite, solution, no-gos, etc.)',
        },
        appetite: {
          type: 'string',
          description: 'Optional appetite label (e.g. "2 weeks") merged into pitch context',
        },
      },
      required: ['pitch'],
    },
  },
  {
    name: 'jev_ears_gate',
    description:
      'Product-delivery EARS gate: noul that the requirement is an observable, unconditioned outcome. Rewrite if prob_yes < 0.85 unless # jev-override: accept.',
    inputSchema: {
      type: 'object',
      properties: {
        requirement: {
          type: 'string',
          description: 'EARS requirement text',
        },
      },
      required: ['requirement'],
    },
  },
  {
    name: 'jev_slice_choice',
    description:
      'Product-delivery slice choice: mvp | v1 | v2 | backlog for a user story.',
    inputSchema: {
      type: 'object',
      properties: {
        story: {
          description: 'User story object or summary string',
        },
      },
      required: ['story'],
    },
  },
  {
    name: 'check_command_safety',
    description:
      'Check if a bash command is safe (pattern whitelist/deny only; does not call Jev).',
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

function requireSkillJev() {
  // Re-read gitignored .env / .env.local. The server process starts before
  // those files exist, and Cursor does not pass shell env into MCP.
  loadEnv();
  const cfg = assertJevConfigured({ skillRequired: true });
  if (!cfg.ok) {
    return { error: cfg.error, unavailable: true, thresholds: THRESHOLDS };
  }
  return null;
}

async function handleToolCall(id, params) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  try {
    if (name === 'check_command_safety') {
      if (typeof args.command !== 'string' || !args.command.trim()) {
        reply(id, toolResult({ error: 'arguments.command must be a non-empty string' }, true));
        return;
      }
      const result = await checkCommandSafety(args.command, { override: args.override === true });
      reply(id, toolResult(result));
      return;
    }

    if (name === 'jev_status') {
      const blocked = requireSkillJev();
      if (blocked) {
        reply(id, toolResult(blocked, true));
        return;
      }
      const payload = { ok: true, skill_scoped: ['shape-up', 'product-delivery'], thresholds: THRESHOLDS };
      if (args.health === true) {
        payload.health = await jevHealthCheck();
      }
      reply(id, toolResult(payload));
      return;
    }

    if (name === 'jev_shape_up_gates') {
      const blocked = requireSkillJev();
      if (blocked) {
        reply(id, toolResult(blocked, true));
        return;
      }
      if (!args.pitch || (typeof args.pitch !== 'object' && typeof args.pitch !== 'string')) {
        reply(id, toolResult({ error: 'arguments.pitch must be an object or string' }, true));
        return;
      }
      const pitch =
        typeof args.pitch === 'string'
          ? { text: args.pitch, appetite: args.appetite }
          : { ...args.pitch, ...(args.appetite ? { appetite: args.appetite } : {}) };
      const result = await shapeUpGates(pitch);
      reply(id, toolResult({ ...result, thresholds: THRESHOLDS }, Boolean(result.unavailable || !result.ok)));
      return;
    }

    if (name === 'jev_ears_gate') {
      const blocked = requireSkillJev();
      if (blocked) {
        reply(id, toolResult(blocked, true));
        return;
      }
      if (typeof args.requirement !== 'string' || !args.requirement.trim()) {
        reply(id, toolResult({ error: 'arguments.requirement must be a non-empty string' }, true));
        return;
      }
      const result = await earsGate(args.requirement);
      reply(id, toolResult({ ...result, thresholds: THRESHOLDS }, Boolean(result.unavailable || !result.ok)));
      return;
    }

    if (name === 'jev_slice_choice') {
      const blocked = requireSkillJev();
      if (blocked) {
        reply(id, toolResult(blocked, true));
        return;
      }
      if (args.story === undefined || args.story === null || args.story === '') {
        reply(id, toolResult({ error: 'arguments.story is required' }, true));
        return;
      }
      const result = await sliceChoice(args.story);
      reply(id, toolResult({ ...result, thresholds: THRESHOLDS }, Boolean(result.unavailable || !result.ok)));
      return;
    }

    reply(id, toolResult({ error: `Unknown tool: ${name}` }, true));
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
      if (isNotification) return;
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

process.stderr.write('Jev MCP Server started (stdio) — shape-up/product-delivery gates + command patterns\n');
