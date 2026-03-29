import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../aiService';

test('buildPrompt maps all normalized config fields into Context and Style blocks', () => {
  const prompt = __test__.buildPrompt({
    purpose: 'follow_up',
    language: 'en',
    leadName: 'Tan Ah Kow',
    goal: 'Confirm proposal timeline',
    context: 'Client asked for a short WhatsApp message',
    channel: 'whatsapp',
    daysPassed: 3,
    style: 'direct',
    emojiIntensity: 'low',
  });

  assert.match(prompt, /You are a sales assistant\./);
  assert.match(prompt, /Context:/);
  assert.match(prompt, /- Goal: Confirm proposal timeline/);
  assert.match(prompt, /- Additional context: Client asked for a short WhatsApp message/);
  assert.match(prompt, /- Channel: whatsapp/);
  assert.match(prompt, /- Days since last contact: 3/);

  assert.match(prompt, /Style:/);
  assert.match(prompt, /- Tone: direct/);
  assert.match(prompt, /- Emoji intensity: low/);

  assert.match(prompt, /Task:/);
  assert.match(prompt, /Write a follow-up message that can be sent directly to Tan Ah Kow\./);
});
