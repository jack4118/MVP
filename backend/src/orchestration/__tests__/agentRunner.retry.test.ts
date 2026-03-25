import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { runAgentViaCodex, setCodexSpawnOverrideForTests } from '../agentRunner';

type SpawnCallPlan = {
  code: number;
  stdout?: string;
  stderr?: string;
};

const buildSpawnOverride = (plans: SpawnCallPlan[], calls: { count: number }) => {
  return (() => {
    const plan = plans[Math.min(calls.count, plans.length - 1)];
    calls.count += 1;

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      write: () => {},
      end: () => {},
    };

    setImmediate(() => {
      if (plan.stdout) {
        child.stdout.emit('data', Buffer.from(plan.stdout));
      }
      if (plan.stderr) {
        child.stderr.emit('data', Buffer.from(plan.stderr));
      }
      child.emit('close', plan.code);
    });

    return child;
  }) as any;
};

test('websocket HTTP 500 failure is retried and can recover', async () => {
  process.env.EZR_CODEX_WS_MAX_RETRIES = '2';
  process.env.EZR_CODEX_WS_RETRY_BACKOFF_MS = '1';

  const calls = { count: 0 };
  const websocket500 = 'ERROR websocket transport failed: HTTP error: 500 Internal Server Error';
  setCodexSpawnOverrideForTests(
    buildSpawnOverride(
      [
        { code: 1, stderr: websocket500 },
        { code: 1, stderr: websocket500 },
        { code: 0, stdout: JSON.stringify({ status: 'PASS', summary: ['ok'], artifacts: ['a'] }) },
      ],
      calls
    )
  );

  const result = await runAgentViaCodex({ agent: 'agent1', prompt: 'x', loopCount: 1, cwd: process.cwd() });

  assert.equal(calls.count, 3);
  assert.equal(result.status, 'PASS');
  assert.equal(result.summary?.[0], 'ok');
  assert.equal((result.rawOutput as any)?.retryAttempts, 3);
});

test('non-websocket/non-5xx codex failures are not retried', async () => {
  process.env.EZR_CODEX_WS_MAX_RETRIES = '2';
  process.env.EZR_CODEX_WS_RETRY_BACKOFF_MS = '1';

  const calls = { count: 0 };
  setCodexSpawnOverrideForTests(
    buildSpawnOverride([{ code: 1, stderr: 'ERROR validation failed: HTTP error: 400 Bad Request' }], calls)
  );

  const result = await runAgentViaCodex({ agent: 'agent2', prompt: 'x', loopCount: 1, cwd: process.cwd() });

  assert.equal(calls.count, 1);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.artifacts?.includes('runtime:codex_websocket_5xx_retry_exhausted'), false);
  assert.equal(result.artifacts?.includes('codex_retry_attempts:1'), true);
});

test('websocket 5xx final result fails cleanly after retry limit', async () => {
  process.env.EZR_CODEX_WS_MAX_RETRIES = '2';
  process.env.EZR_CODEX_WS_RETRY_BACKOFF_MS = '1';

  const calls = { count: 0 };
  const websocket502 = 'ERROR websocket connection failed: HTTP error: 502 Bad Gateway';
  setCodexSpawnOverrideForTests(
    buildSpawnOverride(
      [
        { code: 1, stderr: websocket502 },
        { code: 1, stderr: websocket502 },
        { code: 1, stderr: websocket502 },
      ],
      calls
    )
  );

  const result = await runAgentViaCodex({ agent: 'agent3', prompt: 'x', loopCount: 1, cwd: process.cwd() });

  assert.equal(calls.count, 3);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.artifacts?.includes('runtime:codex_websocket_5xx_retry_exhausted'), true);
  assert.equal(result.artifacts?.includes('codex_retry_attempts:3'), true);
  assert.match((result.summary || []).join(' '), /retries exhausted/i);
});

test.after(() => {
  delete process.env.EZR_CODEX_WS_MAX_RETRIES;
  delete process.env.EZR_CODEX_WS_RETRY_BACKOFF_MS;
  setCodexSpawnOverrideForTests(null);
});

