import { spawn } from 'node:child_process';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema.ts';
import { mcpRequestContext } from '../mcp/mcp-request-context.ts';

export type CommandResult = {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
};

export type RunOptions = {
	/** Working directory for the child process. */
	readonly cwd: string;
	/** Written to stdin, then stdin is closed. */
	readonly input?: string;
	/** Extra environment variables (on top of the non-interactive defaults). */
	readonly env?: Readonly<Record<string, string>>;
	/** Kill the command after this many ms (default: COMMAND_TIMEOUT_SECONDS). */
	readonly timeoutMs?: number;
	/** Extra cancellation, on top of the current MCP call's signal. */
	readonly signal?: AbortSignal;
};

/** A command exited non-zero. The message includes stderr so callers (and the model) see why. */
export class CommandFailedError extends Error {
	constructor(
		readonly command: string,
		readonly args: readonly string[],
		readonly result: CommandResult,
	) {
		super(`${command} ${args.join(' ')} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim());
		this.name = 'CommandFailedError';
	}
}

/** A command was killed because it ran too long or the MCP call was cancelled. */
export class CommandAbortedError extends Error {
	constructor(command: string, args: readonly string[], reason: string) {
		super(`${command} ${args.join(' ')} ${reason}`);
		this.name = 'CommandAbortedError';
	}
}

/**
 * Never let git / gh / ssh wait for input: there is no terminal behind an MCP server, so a prompt
 * (credentials, SSH passphrase, host key) would hang the tool call forever.
 */
export const nonInteractiveEnv = (): NodeJS.ProcessEnv => {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		GIT_TERMINAL_PROMPT: '0',
		GIT_ASKPASS: process.env['GIT_ASKPASS'] ?? 'echo',
		GH_PROMPT_DISABLED: '1',
		GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -o BatchMode=yes',
	};
	// A stale token in the GUI environment overrides gh's keyring and makes `gh pr view` return 401. In CI there is no
	// keyring: the token is how gh authenticates (the reviewer's token, spec-drift-demand REQ-004).
	if (process.env['CI'] !== 'true') {
		delete env.GITHUB_TOKEN;
		delete env.GH_TOKEN;
	}
	return env;
};

/** The single place the server spawns external CLIs (git, gh, semgrep). */
@Injectable()
export class ProcessRunner {
	private readonly defaultTimeoutMs: number;

	constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
		this.defaultTimeoutMs = config.get('COMMAND_TIMEOUT_SECONDS', { infer: true }) * 1000;
	}

	/** Run a command and resolve with its exit code and output, whatever the exit code. */
	run(command: string, args: readonly string[], options: RunOptions): Promise<CommandResult> {
		const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
		const signals = [mcpRequestContext.current().signal, options.signal].filter(
			(s): s is AbortSignal => s !== undefined,
		);

		return new Promise((resolve, reject) => {
			const cancelled = signals.find((s) => s.aborted);
			if (cancelled) {
				reject(new CommandAbortedError(command, args, 'was cancelled before it started'));
				return;
			}
			const child = spawn(command, [...args], {
				cwd: options.cwd,
				env: { ...nonInteractiveEnv(), ...options.env },
				stdio: ['pipe', 'pipe', 'pipe'],
			});
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			let aborted: string | undefined;

			const abort = (reason: string) => {
				if (aborted || child.exitCode !== null) return;
				aborted = reason;
				child.kill('SIGTERM');
				setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 5_000).unref();
			};
			const timer = setTimeout(() => abort(`timed out after ${Math.round(timeoutMs / 1000)}s`), timeoutMs);
			const onAbort = () => abort('was cancelled');
			for (const s of signals) s.addEventListener('abort', onAbort, { once: true });
			const cleanup = () => {
				clearTimeout(timer);
				for (const s of signals) s.removeEventListener('abort', onAbort);
			};

			child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
			child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
			child.stdin.on('error', () => undefined); // child exited before reading stdin
			child.on('error', (error) => {
				cleanup();
				reject(error);
			});
			child.on('close', (code) => {
				cleanup();
				if (aborted) {
					reject(new CommandAbortedError(command, args, aborted));
					return;
				}
				resolve({
					code: code ?? 1,
					stdout: Buffer.concat(stdout).toString('utf8'),
					stderr: Buffer.concat(stderr).toString('utf8'),
				});
			});
			if (options.input !== undefined) child.stdin.write(options.input);
			child.stdin.end();
		});
	}

	/** Run a command and resolve with stdout; reject with CommandFailedError on a non-zero exit. */
	async runOrThrow(command: string, args: readonly string[], options: RunOptions): Promise<string> {
		const result = await this.run(command, args, options);
		if (result.code !== 0) throw new CommandFailedError(command, args, result);
		return result.stdout;
	}
}
