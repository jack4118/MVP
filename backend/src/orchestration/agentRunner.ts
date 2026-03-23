import { spawn } from 'child_process';
import { AgentExecutionResult, AgentName } from './types';

interface RunnerRawResult {
  status?: 'PASS' | 'FAIL' | 'OK' | string;
  summary?: string[];
  artifacts?: string[];
  [key: string]: unknown;
}

const clamp = (value: string, maxLen: number): string => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
};

const parseRunnerOutput = (stdout: string): RunnerRawResult => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('codex output empty');
  }

  try {
    return JSON.parse(trimmed) as RunnerRawResult;
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as RunnerRawResult;
    }
    throw new Error('codex output is not valid JSON');
  }
};

const normalizeStatus = (value?: string): 'PASS' | 'FAIL' | 'OK' => {
  const v = (value || '').toUpperCase();
  if (v === 'PASS' || v === 'FAIL' || v === 'OK') {
    return v;
  }
  return 'OK';
};

export const runAgentViaCodex = async (params: {
  agent: AgentName;
  prompt: string;
  loopCount: number;
}): Promise<Pick<AgentExecutionResult, 'status' | 'summary' | 'artifacts' | 'rawOutput'>> => {
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('codex', ['exec', '-', '--json'], {
        env: process.env,
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
      },
    };
  } catch (error: any) {
    const shortError = clamp(error?.message || 'unknown error', 220);
    return {
      status: 'FAIL',
      summary: [`${params.agent} execution failed`, shortError],
      artifacts: [],
      rawOutput: {
        error: error?.message || String(error),
        stderr: error?.stderr || null,
        stdout: error?.stdout || null,
      },
    };
  }
};
