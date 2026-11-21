import { createServer } from 'node:http';
import { readFileSync, createReadStream } from 'node:fs';
import { join } from 'node:path';

const HOST = '127.0.0.1';
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}`);
  const path = url.pathname;

  // ruleid: sec.ui-path-traversal
  res.end(readFileSync(join(UI_DIR, path)));
  // ruleid: sec.ui-path-traversal
  createReadStream(url.searchParams.get('file')).pipe(res);

  const file = safeJoin(UI_DIR, path.slice('/ui'.length));
  // ok: sec.ui-path-traversal
  if (file) serveFile(res, file);
  // ok: sec.ui-path-traversal
  res.end(readFileSync(join(UI_DIR, 'index.html')));
});

// ruleid: sec.local-server-loopback-only
server.listen(7474);
// ruleid: sec.local-server-loopback-only
server.listen(7474, '0.0.0.0');
// ok: sec.local-server-loopback-only
server.listen(7474, HOST, () => {});
// ok: sec.local-server-loopback-only
server.listen(7474, '127.0.0.1');

const tel = await import('./telemetry-lib.mjs');
tel.emit(tel.buildSpan(ctx, {
  kind: 'command',
  // ruleid: sec.span-no-command-text
  attributes: { verdict: 'deny', command: input.tool_input.command },
}));
tel.emit(tel.buildSpan(ctx, {
  kind: 'command',
  // ok: sec.span-no-command-text
  attributes: { verdict: 'deny', command_label: 'git push --force' },
}));
