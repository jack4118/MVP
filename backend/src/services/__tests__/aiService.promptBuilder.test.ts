import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../aiService';

test('conversation analysis prompt contains JSON-only instruction and schema keys', () => {
  const prompt = __test__.buildConversationAnalysisPrompt({
    language: 'en',
    leadName: 'Tan Ah Kow',
    conversation: 'Customer asked for a revised package and timeline update.',
    notes: 'Prefers WhatsApp and fast replies.',
  });

  assert.match(prompt, /Return JSON only/i);
  assert.match(prompt, /customer_intent/);
  assert.match(prompt, /current_status/);
  assert.match(prompt, /key_issues/);
  assert.match(prompt, /urgency_level/);
  assert.match(prompt, /next_best_action/);
  assert.match(prompt, /summary/);
});

test('structured memory parser accepts wrapped JSON and normalizes urgency', () => {
  const parsed = __test__.parseStructuredMemoryFromModelOutput(
    'Here is the memory: {"customer_intent":"Compare package options","current_status":"Waiting for final quote","key_issues":"Needs date confirmation","tone_preference":"friendly and direct","urgency_level":"urgent","next_best_action":"Send concise revised quote and ask for confirmation today","summary":"Lead is comparing options and needs quick follow-up"} End'
  );

  assert.equal(parsed.customer_intent, 'Compare package options');
  assert.equal(parsed.urgency_level, 'high');
  assert.match(parsed.summary, /Lead is comparing options/i);
});

test('lead memory update mapping syncs structured memory with legacy summary/goal', () => {
  const now = new Date('2026-03-29T12:00:00.000Z');
  const memory = {
    customer_intent: 'Finalize proposal',
    current_status: 'Waiting for approval',
    key_issues: 'Needs internal sign-off',
    tone_preference: 'professional',
    urgency_level: 'medium' as const,
    next_best_action: 'Follow up with a deadline for approval',
    summary: 'Lead is near decision and waiting internal sign-off',
  };

  const mapped = __test__.buildLeadMemoryUpdateData(memory, 'en', now);
  assert.deepEqual(mapped.leadMemory, memory);
  assert.equal(mapped.memorySummary, memory.summary);
  assert.equal(mapped.memoryGoal, memory.next_best_action);
  assert.equal(mapped.memoryLanguage, 'en');
  assert.equal(mapped.memoryUpdatedAt.toISOString(), now.toISOString());
  assert.equal(mapped.lastActivityAt.toISOString(), now.toISOString());
});
