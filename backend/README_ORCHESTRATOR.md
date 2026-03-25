# EzReply Telegram Approval Orchestrator

This module enforces **Agent 0 approval-gated orchestration** for your multi-agent flow.

## What It Adds

- Agent registry with explicit role constraints (allowed/forbidden actions, required inputs, expected outputs).
- Approval-gated transitions: Agent 0 must propose next agent, then wait for Telegram approval.
- Telegram webhook command handling:
  - `/start-run <issue>`
  - `/approve <agentName>`
  - `/reject`
  - `/status`
  - `/repeat`
  - `/cancel`
- JSON state persistence for workflow continuity.
- Staging-first enforcement for agents `agent1`, `agent2`, `agent5`, `agent12`.
- Credential/context injection for `agent5` and `agent12` via environment variables only.

## Environment Variables

Required:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_APPROVER_CHAT_ID`
- `EZR_STAGING_URL` (required for staging-enforced agents)

Optional placeholders (injected into `agent5` and `agent12` run context):

- `EZR_WHATSAPP_TEMPLATE_TOKEN`
- `EZR_PHONE_NUMBER_ID`
- `EZR_WABA_ID`
- `EZR_TEST_PHONE`

Deployment targets (enforced for `agent9`):

- `EZR_DEPLOY_FE_TARGET` (must be `cloudflare`)
- `EZR_DEPLOY_BE_TARGET` (must be `render`)

Persistence:

- `EZR_WORKFLOW_STATE_PATH` (optional, defaults to `./data/ezr-workflow-state.json`)

Use `backend/.env.orchestration.example` as a template.

## API Routes

### Orchestrator

- `GET /api/orchestrator/registry`
- `GET /api/orchestrator/workflow/status`
- `POST /api/orchestrator/workflow/reset`
- `POST /api/orchestrator/proposals`
- `POST /api/orchestrator/next/claim`
- `POST /api/orchestrator/auto/start`
- `POST /api/orchestrator/auto/stop`
- `GET /api/orchestrator/auto/status`
- `GET /api/orchestrator/auto/next-action`
- `POST /api/orchestrator/auto/submit`

### Telegram

- `POST /api/telegram/webhook`

Telegram token management commands:

- `/wa_token status`
- `/wa_token set <token> [exp=YYYY-MM-DD]`
- `/wa_token confirm`
- `/wa_token cancel`

Orchestrator operator commands:

- `/start-run <issue>`
- `/status`
- `/approve <target>` / `/reject`
- `/repeat-run <agent>`
- `/cancel`

## Typical Flow

1. Agent 0 resets workflow:

```bash
curl -X POST http://localhost:3001/api/orchestrator/workflow/reset \
  -H 'Content-Type: application/json' \
  -d '{"actorAgent":"agent0","issue":"Send-flow reliability regression","loopStage":"triage"}'
```

2. Agent 0 marks current agent complete and proposes next agent (sends Telegram approval request):

```bash
curl -X POST http://localhost:3001/api/orchestrator/proposals \
  -H 'Content-Type: application/json' \
  -d '{
    "actorAgent":"agent0",
    "completedAgent":"agent3",
    "resultSummary":["Top issue 1","Top issue 2","Top issue 3"],
    "proposedNextAgent":"agent6",
    "why":"Needs product fix design for send-flow reliability and fake WhatsApp states."
  }'
```

3. Approver uses Telegram mobile controls:

- Tap inline `Approve` / `Reject` / `Status` buttons
- Slash commands remain as fallback (`/approve`, `/reject`, `/status`)

4. Only after approval, Agent 0 claims next agent execution payload:

```bash
curl -X POST http://localhost:3001/api/orchestrator/next/claim \
  -H 'Content-Type: application/json' \
  -d '{"actorAgent":"agent0"}'
```

The claim response includes:

- approved next agent
- registry definition
- run context with staging constraints
- deploy targets for `agent9` (frontend Cloudflare, backend Render)
- credential placeholders for testing agents (if applicable)

## Worker

Run independent worker process (required for auto mode):

```bash
npm run worker:orchestrator
```

If your Render plan cannot run background workers, run API worker on a separate machine (local PC/VPS) with `codex` installed:

```bash
EZR_ORCHESTRATOR_API_BASE=https://mvp-backend-rqzt.onrender.com npm run worker:orchestrator:api
```

Worker behavior:

- Polls runnable orchestrator actions.
- Runs agents through `codex exec ... --json`.
- Submits normalized result payload.
- Runs token-expiry check every 15 minutes.

### Render Always-On Worker (Phase 0)

`render.yaml` includes a dedicated `mvp-orchestrator-worker` service:

- command: `npm run worker:orchestrator:api`
- must set `EZR_ORCHESTRATOR_API_BASE` to your backend URL
- polls `GET /api/orchestrator/auto/next-action`
- performs lease claim/heartbeat and submits results back to API

This removes dependence on a local terminal for workflow progression after Telegram approvals.

## Telegram Webhook Setup

Set bot webhook URL:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-backend-domain>/api/telegram/webhook"
```

Get chat ID (approver must message bot first):

1. Start chat with bot and send any message (`/start`).
2. Request updates:
   - `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates`
3. Find `message.chat.id` in the response and set it as `TELEGRAM_APPROVER_CHAT_ID`.

## Reliability Rules Enforced

- No approval => no progression.
- Telegram send failure => workflow state becomes `blocked_webhook` and remains blocked.
- Invalid `/approve` command => explicit valid options are returned.
- Proposed agent mismatch with registry => rejected.

## Staging Validation Runbook

- Runbook: `docs/orchestrator-staging-validation.md`
- Report template: `docs/orchestrator-staging-report-template.md`
- Log snapshot helper: `scripts/orchestrator-log-review.sh`

Quick start:

```bash
export ORCH_BASE=\"https://<backend-host>\"
./scripts/orchestrator-log-review.sh
```
