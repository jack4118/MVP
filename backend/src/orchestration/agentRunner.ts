import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentExecutionResult, AgentName } from './types';

const execAsync = promisify(exec);

interface RunnerRawResult {
  status?: 'PASS' | 'FAIL' | 'OK' | string;
  summary?: string[];
  artifacts?: string[];
  [key: string]: unknown;
}

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
  const escapedPrompt = params.prompt.replace(/"/g, '\\"');
  const command = `codex exec -p "${escapedPrompt}" --json`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 8,
      env: process.env,
    });

    const parsed = parseRunnerOutput(stdout);

    return {
      status: normalizeStatus(parsed.status),
      summary: Array.isArray(parsed.summary) ? parsed.summary : [`${params.agent} executed`],
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      rawOutput: {
        parsed,
        stderr: stderr || null,
      },
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      summary: [`${params.agent} execution failed`, error?.message || 'unknown error'],
      artifacts: [],
      rawOutput: {
        error: error?.message || String(error),
        stderr: error?.stderr || null,
        stdout: error?.stdout || null,
      },
    };
  }
};
