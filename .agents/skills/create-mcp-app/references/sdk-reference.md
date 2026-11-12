# MCP Apps SDK — reference

Loaded by the `create-mcp-app` skill in Steps 2–5. `$MCP_APPS_REF` is the directory the skill's Step 3 cloned the SDK
into (outside the project).

## Quick Start Decision Tree

### Framework Selection

| Framework | SDK Support | Best For |
|-----------|-------------|----------|
| React | `useApp` hook provided | Teams familiar with React |
| Vanilla JS | Manual lifecycle | Simple apps, no build complexity |
| Vue/Svelte/Preact/Solid | Manual lifecycle | Framework preference |

### Project Context

**Adding to existing MCP server:**
- Import `registerAppTool`, `registerAppResource` from SDK
- Add tool registration with `_meta.ui.resourceUri`
- Add resource registration serving bundled HTML

**Creating new MCP server:**
- Set up server with transport (stdio or HTTP)
- Register tools and resources
- Configure build system with `vite-plugin-singlefile`

## Getting Reference Code

Clone the SDK repository for working examples and API documentation (Step 3 of the skill sets `MCP_APPS_REF`):

```bash
git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 https://github.com/modelcontextprotocol/ext-apps.git "$MCP_APPS_REF"
```

### Framework Templates

Learn and adapt from `$MCP_APPS_REF/examples/basic-server-{framework}/`:

| Template | Key Files |
|----------|-----------|
| `basic-server-vanillajs/` | `server.ts`, `src/mcp-app.ts`, `mcp-app.html` |
| `basic-server-react/` | `server.ts`, `src/mcp-app.tsx` (uses `useApp` hook) |
| `basic-server-vue/` | `server.ts`, `src/App.vue` |
| `basic-server-svelte/` | `server.ts`, `src/App.svelte` |
| `basic-server-preact/` | `server.ts`, `src/mcp-app.tsx` |
| `basic-server-solid/` | `server.ts`, `src/mcp-app.tsx` |

Each template includes:
- `server.ts` with `registerAppTool` and `registerAppResource`
- `main.ts` entry point with HTTP and stdio transport setup
- Client-side app (e.g., `src/mcp-app.ts`, `src/mcp-app.tsx`) with lifecycle handlers
- `src/global.css` with global styles and host style variable fallbacks
- `vite.config.ts` using `vite-plugin-singlefile`
- `package.json` with `npm run` scripts and required dependencies
- `.gitignore` excluding `node_modules/` and `dist/`

### API Reference (Source Files)

Read JSDoc documentation directly from `$MCP_APPS_REF/src/`:

| File | Contents |
|------|----------|
| `src/app.ts` | `App` class, handlers (`ontoolinput`, `ontoolresult`, `onhostcontextchanged`, `onteardown`, etc.), lifecycle |
| `src/server/index.ts` | `registerAppTool`, `registerAppResource`, helper functions |
| `src/spec.types.ts` | All type definitions: `McpUiHostContext`, `McpUiStyleVariableKey` (CSS variable names), `McpUiResourceCsp` (CSP configuration), etc. |
| `src/styles.ts` | `applyDocumentTheme`, `applyHostStyleVariables`, `applyHostFonts` |
| `src/react/useApp.tsx` | `useApp` hook for React apps |

### Advanced Patterns

See `$MCP_APPS_REF/docs/patterns.md` for detailed recipes:

- **App-only tools** — `visibility: ["app"]`, hiding tools from model
- **Polling** — real-time dashboards, interval management
- **Chunked responses** — large files, pagination, base64 encoding
- **Error handling** — `isError`, informing model of failures
- **Binary resources** — audio/video/etc via `resources/read`, blob field
- **Network requests** — assets, fetch, CSP, `_meta.ui.csp`, CORS, `_meta.ui.domain`
- **Host context** — theme, styling, fonts, safe area insets
- **Fullscreen mode** — `requestDisplayMode`, display mode changes
- **Model context** — `updateModelContext`, `sendMessage`, keeping model informed
- **View state** — `viewUUID`, localStorage, state recovery
- **Visibility-based pause** — IntersectionObserver, pausing animations/WebGL
- **Streaming input** — `ontoolinputpartial`, progressive rendering

### Reference Host Implementation

`$MCP_APPS_REF/examples/basic-host/` shows one way an MCP Apps-capable host could be implemented. Real-world hosts like Claude Desktop are more sophisticated—use basic-host for local testing and protocol understanding, not as a guarantee of host behavior.

## Critical Implementation Notes

### Adding Dependencies

**Always** use `npm install` to add dependencies rather than manually writing version numbers:

```bash
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/client@^2.0.0 @modelcontextprotocol/server@^2.0.0 @modelcontextprotocol/node@^2.0.0 @modelcontextprotocol/express@^2.0.0 zod@^4.2.0 express cors
npm install -D typescript vite vite-plugin-singlefile concurrently cross-env @types/node @types/express @types/cors
```

ext-apps 2.x requires the split base MCP SDK packages (`@modelcontextprotocol/client`,
`server`, `node`, `express`) at `^2.0.0`; `@modelcontextprotocol/core` comes in
transitively. Do not add the legacy `@modelcontextprotocol/sdk` v1 package or
substitute unpublished local packages.

### TypeScript Server Execution

Unless the user has specified otherwise, use `tsx` for running TypeScript server files. For example:

```bash
npm install -D tsx

npm pkg set scripts.dev="cross-env NODE_ENV=development concurrently 'cross-env INPUT=mcp-app.html vite build --watch' 'tsx --watch main.ts'"
```

> [!NOTE]
> The SDK examples use `bun` but generated projects should default to `tsx` for broader compatibility.

### Handler Registration Order

Register ALL handlers BEFORE calling `app.connect()`:

```typescript
const app = new App({ name: "My App", version: "1.0.0" });

// Register handlers first
app.ontoolinput = (params) => { /* handle input */ };
app.ontoolresult = (result) => { /* handle result */ };
app.onhostcontextchanged = (ctx) => { /* handle context */ };
app.onteardown = async () => { return {}; };
// etc.

// Then connect
await app.connect();
```

## Common Mistakes to Avoid

1. **No text fallback** - Always provide `content` array for non-UI hosts
2. **Missing CSP configuration** - MCP Apps HTML is served as an MCP resource with no same-origin server; ALL network requests—even to `localhost`—require a CSP configuration
3. **CSP or CORS config in wrong _meta object** - `_meta.ui.csp` and `_meta.ui.domain` go in the `contents[]` objects returned by `registerAppResource()`'s read callback, not in `registerAppResource()`'s config object
4. **Handlers after app.connect()** - Register ALL handlers BEFORE calling `app.connect()`
5. **No streaming for large inputs** - Use `ontoolinputpartial` to show progress during input generation

## Debugging

Send debug logs to the host application (rather than just the iframe's dev console):

```typescript
await app.sendLog({ level: "info", data: "Debug message" });
await app.sendLog({ level: "error", data: { error: err.message } });
```
