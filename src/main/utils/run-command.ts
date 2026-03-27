import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class CommandExecutionError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | string | null;

  constructor(message: string, params: { stdout?: string; stderr?: string; code?: number | string | null }) {
    super(message);
    this.name = "CommandExecutionError";
    this.stdout = params.stdout ?? "";
    this.stderr = params.stderr ?? "";
    this.code = params.code ?? null;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs ?? 60_000,
      maxBuffer: 1024 * 1024 * 8,
      env: options?.env,
      windowsHide: true
    });

    return {
      stdout: stdout.toString(),
      stderr: stderr.toString()
    };
  } catch (error) {
    const err = error as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
    };

    throw new CommandExecutionError(err.message ?? "命令执行失败", {
      stdout: err.stdout?.toString(),
      stderr: err.stderr?.toString(),
      code: err.code ?? null
    });
  }
}
