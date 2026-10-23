# ReachInbox Hiring Assignment – Full-stack Email Job Scheduler

## Production Deployment & Testing

If you are testing this application in a production environment (e.g., Render/Vercel) without a real SMTP server, it will automatically use **Ethereal Email**.
- To view the sent Ethereal emails in production, simply open your **Browser Developer Tools -> Network Tab**, inspect the response for the `/emails/sent` API call, and you will see the `[Ethereal Preview URL]` appended directly to the email body! 
- (Alternatively, you can just look at the email body in the "Sent" tab on the frontend dashboard).

## Restoring Localhost Version

If you want to use this project strictly on **localhost** (before the production adjustments were made):
1. If you want to revert the codebase to its original, pure localhost state, you can pull/checkout the very first commit.
   - Commit Name/Hash: `a974a32 done with localhost test`
   - Command: `git checkout a974a32` 
   and then Make sure you have added all required environment variables in your local `.env` files.

**Backend `backend/.env`:**
```env
PORT=5000
DATABASE_URL="postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox_scheduler?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379

# Google OAuth
GOOGLE_CLIENT_ID=""

# Worker configuration
CONCURRENCY=1
MAX_EMAILS_PER_HOUR=100
MIN_DELAY_BETWEEN_EMAILS_MS=10000
```

**Frontend `frontend/.env`:**
```env
VITE_BACKEND_URL="http://localhost:5000"
```

## Architecture Overview

This project is a full-stack email scheduler service built with:
- **Backend**: Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL (Prisma ORM).
- **Frontend**: React (Vite), Tailwind CSS, TypeScript.

### How Scheduling Works
Emails are scheduled by sending a payload to the backend API (`/api/emails/schedule`). The backend stores the record in PostgreSQL with a `SCHEDULED` status, and pushes a job to **BullMQ** with a `delay` parameter (calculated based on the `scheduledAt` date minus the current date). BullMQ natively manages delayed jobs and ensures they only execute when the delay expires.

### How Rate Limiting & Concurrency are Implemented
- **Concurrency**: The worker is configured with a `concurrency` setting (default: 5) allowing multiple jobs to execute simultaneously.
- **Hourly Rate Limit**: BullMQ's native `limiter` option is applied to the Worker (`max: 200`, `duration: 3600000` ms). If the limit is reached, BullMQ moves subsequent jobs to a delayed state until the rate limit window resets. They are not failed or dropped.
- **Minimum Delay Between Emails**: To mimic provider throttling, the job processor logic explicitly uses `setTimeout` to pause execution for `MIN_DELAY_BETWEEN_EMAILS_MS` (e.g. 2 seconds) during the job processing flow.

### How Persistence is Handled
Since BullMQ uses **Redis** as a persistent queue and the jobs are stored with delays, restarting the Express server or Worker does not lose jobs. BullMQ automatically resumes processing the queue, and any jobs whose scheduled time arrived while the server was down will be executed immediately upon startup. Database records are persisted in PostgreSQL.

## How to Run

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v18+)

### 2. Infrastructure
From the root directory, start PostgreSQL and Redis:
```bash
docker-compose up -d
```

### 3. Backend Setup
```bash
cd backend
npm install
npx prisma db push
npm run dev
```

The backend server will run on `http://localhost:5000`. 
Ethereal Email credentials will automatically generate and print to the console when the first email is sent.

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:5173`. 
Open the browser and use the mock Google Login to access the dashboard.
