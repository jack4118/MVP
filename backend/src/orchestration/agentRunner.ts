import { spawn } from 'child_process';
import { AgentExecutionResult, AgentName } from './types';

interface RunnerRawResult {
  status?: 'PASS' | 'FAIL' | 'OK' | string;
  summary?: string[];
  artifacts?: string[];
  [key: string]: unknown;
}

interface CodexJsonLine {
  type?: string;
  item?: {
    type?: string;
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type SpawnFn = typeof spawn;

let codexSpawnOverrideForTests: SpawnFn | null = null;

const clamp = (value: string, maxLen: number): string => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
};

const tryParseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const parseRunnerOutput = (stdout: string): RunnerRawResult => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('codex output empty');
  }

  // Fast path: direct JSON object.
  const direct = tryParseJson<RunnerRawResult>(trimmed);
  if (direct && typeof direct === 'object') {
    return direct;
  }

  // Codex --json is JSONL event stream. Ignore non-JSON warning lines.
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let lastEmbeddedText: string | null = null;
  const parsedLines: CodexJsonLine[] = [];

  for (const line of lines) {
    const parsed = tryParseJson<CodexJsonLine>(line);
    if (!parsed || typeof parsed !== 'object') {
      continue;
    }
    parsedLines.push(parsed);
    if (parsed.type === 'item.completed' && parsed.item?.type === 'agent_message' && typeof parsed.item.text === 'string') {
      lastEmbeddedText = parsed.item.text;
    }
  }

  if (lastEmbeddedText) {
    const embedded = tryParseJson<RunnerRawResult>(lastEmbeddedText.trim());
    if (embedded && typeof embedded === 'object') {
      return embedded;
    }
    return {
      status: 'OK',
      summary: [clamp(lastEmbeddedText, 220)],
      artifacts: [],
    };
  }

  // Fallback: find any JSON object-like line with expected keys.
  for (let i = parsedLines.length - 1; i >= 0; i -= 1) {
    const candidate = parsedLines[i] as RunnerRawResult;
    if (
      candidate &&
      (typeof candidate.status === 'string' || Array.isArray(candidate.summary) || Array.isArray(candidate.artifacts))
    ) {
      return candidate;
    }
  }

  throw new Error('codex output is not parseable');
};

const normalizeStatus = (value?: string): 'PASS' | 'FAIL' | 'OK' => {
  const v = (value || '').toUpperCase();
  if (v === 'PASS' || v === 'FAIL' || v === 'OK') {
    return v;
  }
  return 'OK';
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getCodexSpawn = (): SpawnFn => codexSpawnOverrideForTests || spawn;

const isRetryableWebsocket5xx = (message: string): boolean => {
  const lower = message.toLowerCase();
  const hasWebsocket = lower.includes('websocket');
  const hasHttp5xx = /http error:\s*5\d\d/i.test(message) || /\b5\d\d\b/.test(message);
  return hasWebsocket && hasHttp5xx;
};

export const setCodexSpawnOverrideForTests = (override: SpawnFn | null): void => {
  codexSpawnOverrideForTests = override;
};

export const runAgentViaCodex = async (params: {
  agent: AgentName;
  prompt: string;
  loopCount: number;
  cwd?: string;
}): Promise<Pick<AgentExecutionResult, 'status' | 'summary' | 'artifacts' | 'rawOutput'>> => {
  const sandboxMode = process.env.EZR_CODEX_SANDBOX_MODE || 'danger-full-access';
  const approvalPolicy = process.env.EZR_CODEX_APPROVAL_POLICY || 'never';
  const maxWebsocketRetries = Math.max(0, Number(process.env.EZR_CODEX_WS_MAX_RETRIES || 2));
  const retryBackoffMs = Math.max(100, Number(process.env.EZR_CODEX_WS_RETRY_BACKOFF_MS || 700));
  // `-a/--approval-policy` was removed from newer codex versions.
  // Use config override which is supported in current CLI.
  const codexArgs = ['exec', '-', '--json', '-s', sandboxMode, '-c', `approval_policy="${approvalPolicy}"`];
  if (String(process.env.EZR_CODEX_FORCE_HTTP_RESPONSES || '').toLowerCase() === 'true') {
    codexArgs.push(
      '-c',
      'model_providers.openai_http={name="OpenAI HTTP",env_key="OPENAI_API_KEY",wire_api="responses",supports_websockets=false}',
      '-c',
      'model_provider="openai_http"'
    );
  }

  try {
    const runCodexOnce = async (): Promise<{ stdout: string; stderr: string }> =>
      await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = getCodexSpawn()('codex', codexArgs, {
          env: process.env,
          cwd: params.cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let out = '';
        let err = '';

        child.stdout.on('data', (chunk) => {
          out += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          err += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout: out, stderr: err });
            return;
          }
          reject(new Error(`codex exited with code ${code}: ${err || out}`));
        });

        child.stdin.write(params.prompt);
        child.stdin.end();
      });

    let attempt = 0;
    let lastError: unknown = null;
    let runOutput: { stdout: string; stderr: string } | null = null;

    while (attempt <= maxWebsocketRetries) {
      attempt += 1;
      try {
        runOutput = await runCodexOnce();
        break;
      } catch (error) {
        lastError = error;
        const message = String((error as any)?.message || error);
        const retryable = isRetryableWebsocket5xx(message);
        if (!retryable || attempt > maxWebsocketRetries) {
          throw new Error(
            `${message}${retryable ? ` | websocket_5xx_retries_exhausted:${attempt}/${maxWebsocketRetries + 1}` : ''}`
          );
        }
        console.warn(
          `[AgentRunner] retrying codex websocket 5xx for ${params.agent}: attempt ${attempt}/${maxWebsocketRetries + 1}`
        );
        await sleep(retryBackoffMs * attempt);
      }
    }

    if (!runOutput) {
      throw new Error(String((lastError as any)?.message || lastError || 'codex execution failed'));
    }

    const { stdout, stderr } = runOutput;

    const parsed = parseRunnerOutput(stdout);

    return {
      status: normalizeStatus(parsed.status),
      summary: Array.isArray(parsed.summary)
        ? parsed.summary.map((line) => clamp(String(line), 220)).filter(Boolean).slice(0, 8)
        : [`${params.agent} executed`],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      rawOutput: {
        parsed,
        stderr: stderr || null,
        retryAttempts: attempt,
      },
    };
  } catch (error: any) {
    const shortError = clamp(error?.message || 'unknown error', 220);
    const retryAttemptsMatch = String(error?.message || '').match(/websocket_5xx_retries_exhausted:(\d+)\/(\d+)/);
    const retryAttempts = retryAttemptsMatch ? Number(retryAttemptsMatch[1]) : 1;
    const exhausted = Boolean(retryAttemptsMatch);
    const summary = [`${params.agent} execution failed`, shortError];
    if (exhausted) {
      summary.push(`websocket transport retries exhausted after ${retryAttempts} attempts`);
    }
    return {
      status: 'FAIL',
      summary,
      artifacts: exhausted
        ? ['runtime:codex_websocket_5xx_retry_exhausted', `codex_retry_attempts:${retryAttempts}`]
        : [`codex_retry_attempts:${retryAttempts}`],
      rawOutput: {
        error: error?.message || String(error),
        stderr: error?.stderr || null,
        stdout: error?.stdout || null,
        retryAttempts,
        retryableWebsocket5xx: exhausted || isRetryableWebsocket5xx(String(error?.message || '')),
      },
    };
  }
};
