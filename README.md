# MVP SaaS Project

A full-stack SaaS application for lead management, reminders, and AI-powered text generation.

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

