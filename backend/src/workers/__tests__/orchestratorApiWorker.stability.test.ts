import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logWorkerStartup,
  setCodexAvailabilityOverrideForTests,
  tick,
} from '../orchestratorApiWorker';

type FetchCall = {
  url: string;
  method: string;
  body: any;
};

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('worker startup without codex does not exit', () => {
  setCodexAvailabilityOverrideForTests(false);
  const startup = logWorkerStartup();
  assert.equal(startup.codexAvailable, false);
});

test('codex-unavailable execution path submits controlled failure', async () => {
  setCodexAvailabilityOverrideForTests(false);
  const originalFetch = global.fetch;
  const calls: FetchCall[] = [];

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });

    if (url.includes('/api/orchestrator/auto/next-action')) {
      return jsonResponse({
        success: true,
        data: {
          state: { loopCount: 7 },
          action: { type: 'run_agent', agents: ['agent1'], reason: 'test' },
        },
      });
    }
    if (url.includes('/api/orchestrator/auto/lease/claim')) {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/orchestrator/auto/submit')) {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/orchestrator/auto/prompt/')) {
      assert.fail('prompt fetch should not be called when codex is unavailable');
    }
    return jsonResponse({ success: true });
  }) as typeof fetch;

  await tick();

  global.fetch = originalFetch;

  const claimed = calls.find((entry) => entry.url.includes('/api/orchestrator/auto/lease/claim'));
  const submitted = calls.find((entry) => entry.url.includes('/api/orchestrator/auto/submit'));
  assert.ok(claimed, 'lease claim should occur');
  assert.ok(submitted, 'submit should occur');
  assert.equal(submitted?.body?.status, 'FAIL');
  assert.match(String(submitted?.body?.summary?.[1] || ''), /codex runtime unavailable/i);
  assert.equal(submitted?.body?.artifacts?.[0], 'runtime:codex_unavailable');
});

test('tick path remains reachable for run_parallel when codex is unavailable', async () => {
  setCodexAvailabilityOverrideForTests(false);
  const originalFetch = global.fetch;
  const calls: FetchCall[] = [];

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });

    if (url.includes('/api/orchestrator/auto/next-action')) {
      return jsonResponse({
        success: true,
        data: {
          state: { loopCount: 12 },
          action: { type: 'run_parallel', agents: ['agent1', 'agent2'], reason: 'test-parallel' },
        },
      });
    }
    if (url.includes('/api/orchestrator/auto/lease/claim')) {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/orchestrator/auto/submit')) {
      return jsonResponse({ success: true });
    }
    return jsonResponse({ success: true });
  }) as typeof fetch;

  await tick();

  global.fetch = originalFetch;

  const claimCalls = calls.filter((entry) => entry.url.includes('/api/orchestrator/auto/lease/claim'));
  const submitCalls = calls.filter((entry) => entry.url.includes('/api/orchestrator/auto/submit'));
  assert.equal(claimCalls.length, 2);
  assert.equal(submitCalls.length, 2);
});

test.after(() => {
  setCodexAvailabilityOverrideForTests(null);
});
