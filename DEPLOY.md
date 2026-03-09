# Deploy Guide (GitHub + Cloudflare + Render)

This project should be deployed as:

- Frontend (`frontend/`): Cloudflare Pages
- Backend (`backend/`): Render Web Service
- Database: Render PostgreSQL (or any external PostgreSQL)

## 1) Deploy Backend on Render

### Option A: One-click with `render.yaml` (recommended)

1. Push this repo to GitHub.
2. In Render: **New +** -> **Blueprint** -> choose this repo.
3. Render will detect [`render.yaml`](/Users/cheelam/Sites/MVP/render.yaml) and create:
   - `mvp-postgres` database
   - `mvp-backend` service
4. After creation, open `mvp-backend` -> **Environment** and set:
   - `FRONTEND_URL` = your Cloudflare Pages URL (set this after frontend exists)
   - `OPENAI_API_KEY` (if using AI routes)
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (if using WhatsApp routes)

### Option B: Manual service setup

- Root Directory: `backend`
- Build Command: `npm ci && npm run prisma:generate && npm run build`
- Start Command: `npx prisma migrate deploy && npm start`
- Health Check Path: `/health`
- Environment Variables:
  - `NODE_ENV=production`
  - `DATABASE_URL=<your postgres connection string>`
  - `JWT_SECRET=<long random secret>`
  - `FRONTEND_URL=<your cloudflare frontend url>`
  - `REMINDER_WORKER_ENABLED=true`
  - Optional: `OPENAI_API_KEY`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `INTERNAL_DISPATCH_SECRET`

When done, copy your backend URL, for example:
`https://mvp-backend.onrender.com`

## 2) Deploy Frontend on Cloudflare Pages

1. Cloudflare Dashboard -> **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
2. Select this repository.
3. Build settings:
   - Framework preset: `Vite`
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Add environment variable:
   - `VITE_API_URL=https://mvp-backend.onrender.com`
5. Deploy.

This repo includes [`frontend/public/_redirects`](/Users/cheelam/Sites/MVP/frontend/public/_redirects) so React Router routes work on refresh.

## 3) Final Wiring

1. Copy your Cloudflare Pages URL, for example:
   `https://your-project.pages.dev`
2. In Render backend env vars, set:
   - `FRONTEND_URL=https://your-project.pages.dev`
3. Redeploy backend.

## 4) Verify

- Backend health:
  - `GET https://mvp-backend.onrender.com/health`
- Frontend loads and can log in/register.
- Browser devtools shows API calls going to Render URL, not localhost.

## Notes

- GitHub is where code lives. Cloudflare/Render are where the app runs.
- Never commit real `.env` files. Use `.env.example` templates.
