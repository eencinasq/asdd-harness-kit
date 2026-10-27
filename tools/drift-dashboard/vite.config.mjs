// Builds the spec-drift-auditor MCP App view into one self-contained HTML file:
//   npm run build:ui  →  .agents/mcp/ui/drift-dashboard.html (committed; the server needs no build step)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('../../.agents/mcp/ui', import.meta.url)),
    emptyOutDir: false,
    rollupOptions: { input: fileURLToPath(new URL('drift-dashboard.html', import.meta.url)) },
  },
});
