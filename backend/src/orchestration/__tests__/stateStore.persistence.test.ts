import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createDefaultState, loadWorkflowState, saveWorkflowState } from '../stateStore';

const withTempState = async (): Promise<{ dir: string; statePath: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ezr-state-persist-test-'));
  const statePath = path.join(dir, 'state.json');
  process.env.EZR_WORKFLOW_STATE_PATH = statePath;
  return { dir, statePath };
};

test('concurrent saveWorkflowState calls do not throw and final file is valid JSON', async () => {
  const { dir, statePath } = await withTempState();
  const base = createDefaultState();

  const tasks = Array.from({ length: 80 }, async (_, idx) => {
    const state = createDefaultState();
    state.issueId = `concurrent-save-${idx}`;
    state.currentIssue = state.issueId;
    state.loopCount = base.loopCount + idx;
    await saveWorkflowState(state);
  });

  await Promise.all(tasks);

  const raw = await readFile(statePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(typeof parsed, 'object');
  assert.equal(Number(parsed.schemaVersion), 3);

  await rm(dir, { recursive: true, force: true });
});

test('repeated concurrent save/load cycles do not produce ENOENT', async () => {
  const { dir } = await withTempState();
  const errors: Error[] = [];

  for (let round = 0; round < 20; round += 1) {
    const writes = Array.from({ length: 24 }, async (_, idx) => {
      const state = createDefaultState();
      state.issueId = `round-${round}-write-${idx}`;
      state.currentIssue = state.issueId;
      state.loopCount = round + 1;
      try {
        await saveWorkflowState(state);
      } catch (error: any) {
        errors.push(error);
      }
    });

    const reads = Array.from({ length: 12 }, async () => {
      try {
        await loadWorkflowState();
      } catch (error: any) {
        errors.push(error);
      }
    });

    await Promise.all([...writes, ...reads]);
  }

  assert.equal(errors.length, 0, `expected no save/load errors, got: ${errors.map((e) => e.message).join(' | ')}`);

  const finalState = await loadWorkflowState();
  assert.equal(finalState.schemaVersion, 3);
  assert.equal(typeof finalState.timestamps.updatedAt, 'string');

  await rm(dir, { recursive: true, force: true });
});
