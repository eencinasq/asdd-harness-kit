/**
 * Minimal MCP Apps host for UI tests (runs in the browser). Loads a dashboard in an iframe through
 * the real ext-apps AppBridge — what Claude / Cursor do — and forwards every tool call the view
 * makes to `window.callServerTool`, which the test wires to the real NestJS MCP server.
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

declare global {
	interface Window {
		callServerTool(params: unknown): Promise<unknown>;
		sendToolResult(result: unknown): Promise<void>;
		viewReady: Promise<void>;
	}
}

const iframe = document.getElementById('view') as HTMLIFrameElement;
const bridge = new AppBridge(null, { name: 'ui-test-host', version: '0.0.0' }, { serverTools: {}, logging: {} });

bridge.oncalltool = async (params) => (await window.callServerTool(params)) as any;
window.sendToolResult = (result) => bridge.sendToolResult(result as Parameters<AppBridge['sendToolResult']>[0]);
window.viewReady = new Promise<void>((resolve) => {
	bridge.oninitialized = () => resolve();
});

await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
iframe.src = iframe.dataset['src'] ?? '';
