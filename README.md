# ez-reply

A full-stack SaaS application for lead management, reminders, and AI-assisted business messaging.

## Features

- **Lead Management**: Create, update, and track leads with status management
- **Reminders**: View and manage today's reminders
- **AI Text Generation**: Generate follow-up and payment reminder messages
- **Authentication**: JWT-based user authentication

## Tech Stack

### Backend
- Node.js + Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication

### Frontend
- React + TypeScript
- Vite
- React Router
- Axios

## Project Structure

```
MVP/
├── backend/          # Node.js backend
├── frontend/         # React frontend
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials:
```
DATABASE_URL="postgresql://user:password@localhost:5432/mvp_db?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

5. Generate Prisma client:
```bash
npm run prisma:generate
```

6. Run database migrations:
```bash
npm run prisma:migrate
```

7. Start the development server:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

4. Update `.env` if needed:
```
VITE_API_URL=http://localhost:3001
```

5. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Leads
- `GET /api/leads` - Get all leads
- `POST /api/leads` - Create a new lead
- `PUT /api/leads/:id` - Update a lead
- `PUT /api/leads/:id/status` - Update lead status

### Reminders
- `GET /api/reminders/today` - Get today's reminders
- `POST /api/reminders/:id/done` - Mark reminder as done

### AI
- `POST /api/ai/follow-up` - Generate follow-up text
- `POST /api/ai/payment` - Generate payment reminder text

## Database Schema

- **users**: User accounts
- **leads**: Customer leads
- **reminders**: Scheduled reminders
- **ai_logs**: AI-generated text logs

## Development

### Backend
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm start`

### Frontend
- Development: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Notes

- The AI text generation currently uses placeholder logic. You can extend it to integrate with OpenAI or other AI services.
- All API endpoints (except auth) require JWT authentication.
- The project is designed to be extensible while keeping the MVP simple and maintainable.

## Deployment

- Use GitHub for source control and auto-deploy triggers.
- Deploy frontend (`frontend`) to Cloudflare Pages.
- Deploy backend (`backend`) and PostgreSQL to Render.
- Full step-by-step guide: [`DEPLOY.md`](/Users/cheelam/Sites/MVP/DEPLOY.md)

## README Guideline (Recommended Team Standard)

Use this as the default operational checklist for this repo.

### 1. Branch + Commit Hygiene

1. Make changes on feature branches when possible.
2. Keep commits scoped (one purpose per commit).
3. Never commit secrets (`.env`, API keys, tokens).
4. Before pushing, run:
```bash
cd backend && npm run test:orchestrator && npm run build
```

### 2. Deploy Flow (Production)

1. Push to `main`:
```bash
git push origin main
```
2. Render deploys backend using [`render.yaml`](/Users/cheelam/Sites/MVP/render.yaml).
3. Cloudflare Pages deploys frontend from `frontend/`.
4. Confirm frontend env:
```env
VITE_API_URL=https://<your-render-backend>.onrender.com
```
5. Confirm backend CORS env:
```env
FRONTEND_URL=https://<your-cloudflare-pages>.pages.dev
```

### 3. Required Backend Environment Variables

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `OPENAI_API_KEY`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `INTERNAL_DISPATCH_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_APPROVER_CHAT_ID`
- `EZR_STAGING_URL`
- `EZR_WHATSAPP_TEMPLATE_TOKEN`
- `EZR_PHONE_NUMBER_ID`
- `EZR_WABA_ID`
- `EZR_TEST_PHONE`

### 4. Orchestrator Stability Environment Variables (Optional)

Defaults are safe; set only if you need tuning:

- `EZR_AGENT_MAX_ATTEMPTS` (default `2`)
- `EZR_AGENT_LEASE_TTL_SECONDS` (default `90`)
- `EZR_AGENT_HEARTBEAT_INTERVAL_SECONDS` (default `45`)
- `EZR_ORCHESTRATOR_WORKER_ID` (recommended in multi-worker setups)

### 5. Post-Deploy Verification Checklist

1. Backend health:
```bash
curl https://<your-render-backend>.onrender.com/health
```
2. Open frontend and verify login/register.
3. Confirm API calls target Render URL (not localhost).
4. Check orchestrator status endpoint:
```bash
curl https://<your-render-backend>.onrender.com/api/orchestrator/workflow/status
```
5. Verify state includes stability fields:
- `attempts`
- `leases`
- `staleAgents`
- `retryableAgents`
- `lastExecutionFailureReason`

### 6. Incident Recovery Commands (Telegram)

- `/status`
- `/repeat-run <agent>`
- `/cancel`
- `/approve <target>` / `/reject`

Use `/repeat-run <agent>` when a non-auto-retryable agent needs manual rerun.
