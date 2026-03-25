import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ } from '../aiService';

const makeContext = (overrides: Partial<ReturnType<typeof __test__.buildGreetingPolicyContextFromLogs>> = {}) => ({
  hasOutboundGreetingInLast24h: false,
  hasInboundReplyInLast24h: true,
  hasHistory: true,
  allowGreeting: false,
  turnType: 'follow_up' as const,
  minutesSinceLastMessage: 15,
  lastInboundSnippet: 'invoice for March',
  lastOutboundSnippet: 'I sent the quote yesterday',
  activeTopicAnchor: 'invoice for March',
  supportsLightCodeSwitch: false,
  ...overrides,
});

test('non-first-turn greeting stripping removes leading greeting', () => {
  const context = makeContext();
  const stripped = __test__.enforceGreetingPolicy('Hi John, quick follow-up on the invoice.', context);
  assert.equal(/^hi\b/i.test(stripped.trim()), false);
  assert.match(stripped, /invoice/i);
});

test('hard-ban opener rewrite replaces scripted opener in non-first turn', () => {
  const context = makeContext();
  const rewritten = __test__.applyConversationalGuardrails(
    'Hello, how may I assist you today? We can settle this now.',
    'en',
    'chat',
    context,
    'invoice payment timing'
  );

  assert.equal(/^hello\b/i.test(rewritten.trim()), false);
  assert.equal(/how may i assist/i.test(rewritten), false);
  assert.match(rewritten.toLowerCase(), /invoice|payment|timing/);
});

test('soft-ban generic starter rewrite catches "got it" and rewrites with anchor', () => {
  const context = makeContext({ activeTopicAnchor: 'booking date for next week' });
  const rewritten = __test__.applyConversationalGuardrails(
    'Got it. Can you confirm?',
    'en',
    'chat',
    context,
    'booking date confirmation'
  );

  assert.equal(/^got it\b/i.test(rewritten.trim()), false);
  assert.match(rewritten.toLowerCase(), /booking|date|confirm/);
});

test('context-anchor insertion adds a concrete anchor when first sentence is generic', () => {
  const context = makeContext({ activeTopicAnchor: 'quote hari tu' });
  const rewritten = __test__.applyConversationalGuardrails(
    'Makes sense. Boleh update cepat?',
    'ms',
    'chat',
    context,
    'follow up quote'
  );

  assert.equal(/^makes sense\b/i.test(rewritten.trim()), false);
  assert.match(rewritten.toLowerCase(), /quote|hari|follow/);
});

test('code-switch behavior detection toggles language-mix guidance', () => {
  assert.equal(__test__.detectLightCodeSwitchSignal('Boleh confirm tomorrow? 我这边先安排。'), true);
  assert.equal(__test__.detectLightCodeSwitchSignal('Plain english text only.'), false);

  const instruction = __test__.getTurnPolicyInstruction(
    'en',
    makeContext({ supportsLightCodeSwitch: true })
  );
  assert.match(instruction.toLowerCase(), /light code-switch is allowed/);
});

test('restart threshold behavior marks conversation as restart after long silence', () => {
  const now = Date.now();
  const older = new Date(now - (__test__.RESTART_SILENCE_MINUTES + 5) * 60_000);
  const recent = new Date(now - 30 * 60_000);

  const restartContext = __test__.buildGreetingPolicyContextFromLogs(
    [{ direction: 'inbound', content: 'Any update on invoice?', createdAt: older }],
    now
  );
  assert.equal(restartContext.turnType, 'conversation_restart');
  assert.equal(restartContext.allowGreeting, true);

  const ongoingContext = __test__.buildGreetingPolicyContextFromLogs(
    [{ direction: 'inbound', content: 'Any update on invoice?', createdAt: recent }],
    now
  );
  assert.equal(ongoingContext.turnType, 'follow_up');
  assert.equal(ongoingContext.allowGreeting, false);
});

test('concise response enforcement limits chat replies to four sentences', () => {
  const context = makeContext({ activeTopicAnchor: 'invoice' });
  const longDraft = [
    'On invoice timing, quick confirm before we proceed.',
    'First, we need your confirmation.',
    'Second, we need the exact date.',
    'Third, we need the amount.',
    'Fourth, we need your final approval.',
  ].join(' ');

  const rewritten = __test__.applyConversationalGuardrails(longDraft, 'en', 'chat', context, 'invoice timing');
  const sentenceCount = rewritten
    .split(/(?<=[.!?。！？])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean).length;

  assert.ok(sentenceCount <= 4);
});
