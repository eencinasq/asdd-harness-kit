/**
 * Minimal MCP Apps view ↔ host bridge: JSON-RPC 2.0 over postMessage
 * (spec 2026-01-26, extension io.modelcontextprotocol/ui). No SDK needed.
 */
export const PROTOCOL_VERSION = '2026-01-26';

export function createBridge(host = window.parent) {
  let nextId = 1;
  const pending = new Map();
  const notificationHandlers = new Map();
  const requestHandlers = new Map();
  const post = (message) => host.postMessage({ jsonrpc: '2.0', ...message }, '*');

  window.addEventListener('message', (event) => {
    if (event.source !== host) return;
    const msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id !== undefined && ('result' in msg || 'error' in msg)) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message ?? 'host error'));
      else waiter.resolve(msg.result);
    } else if (msg.method && msg.id !== undefined) {
      const handler = requestHandlers.get(msg.method);
      Promise.resolve(handler ? handler(msg.params) : {})
        .then((result) => post({ id: msg.id, result: result ?? {} }))
        .catch((error) => post({ id: msg.id, error: { code: -32000, message: error.message } }));
    } else if (msg.method) {
      notificationHandlers.get(msg.method)?.(msg.params ?? {});
    }
  });

  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        post({ id, method, params });
      });
    },
    notify(method, params = {}) {
      post({ method, params });
    },
    on(method, handler) {
      notificationHandlers.set(method, handler);
    },
    onRequest(method, handler) {
      requestHandlers.set(method, handler);
    },
  };
}

/** Apply host theme and CSS variables (hostContext.theme, hostContext.styles.variables). */
export function applyHostContext(ctx) {
  if (!ctx) return;
  const root = document.documentElement;
  if (ctx.theme) root.dataset.theme = ctx.theme;
  for (const [name, value] of Object.entries(ctx.styles?.variables ?? {})) {
    if (value) root.style.setProperty(name, value);
  }
}
