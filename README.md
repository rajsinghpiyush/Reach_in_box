# ReachInbox Hiring Assignment – Full-stack Email Job Scheduler

## 🚀 Quick Start (Run Locally with Docker)

Run the entire application locally (PostgreSQL, Redis, Backend, and Frontend) with one command:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rajsinghpiyush/Reach_in_box.git
   cd Reach_in_box
   ```

2. **Start all services with Docker Compose:**
   ```bash
   docker compose up -d
   ```

3. **Access the application:**
   - **Frontend:** [http://localhost:5173](http://localhost:5173)
   - **Backend API:** [http://localhost:5000](http://localhost:5000) (Health check: `http://localhost:5000/health`)

To stop all services:
```bash
docker compose down
```

---

## Production Deployment & Testing

If you are testing this application in a production environment (e.g., Render/Vercel) without a real SMTP server, it will automatically use **Ethereal Email**.
- To view the sent Ethereal emails in production, simply open your **Browser Developer Tools -> Network Tab**, inspect the response for the `/emails/sent` API call, and you will see the `[Ethereal Preview URL]` appended directly to the email body! 
- (Alternatively, you can just look at the email body in the "Sent" tab on the frontend dashboard).

## ⚙️ Local Environment Configuration (.env Examples)

Create a `.env` file in both `backend/` and `frontend/` (or copy from the provided `.env.example` files). All values are pre-configured for local testing:

### **Backend (`backend/.env`):**
```env
PORT=5000
APP_ENV=local
NODE_ENV=development
DATABASE_URL="postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox_scheduler?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
FRONTEND_URL="http://localhost:5173"

# Google OAuth (Optional - Mock Login works out-of-the-box without it)
GOOGLE_CLIENT_ID="enter your url"

# Worker Configuration
CONCURRENCY=5
MAX_EMAILS_PER_HOUR=200
MIN_DELAY_BETWEEN_EMAILS_MS=2000

# Ethereal Email / SMTP (Optional - auto-generates test account dynamically if blank)
SMTP_HOST="smtp.ethereal.email"
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
```

### **Frontend (`frontend/.env`):**
```env
VITE_BACKEND_URL="http://localhost:5000"

# Google OAuth (Optional - Mock Login works out-of-the-box without it)
VITE_GOOGLE_CLIENT_ID="enter your url"
```

---

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
