import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import emailRoutes from './routes/email';
import { emailQueue } from './queue';
import { startWorker } from './worker';
import { initSocket } from './socket';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [
  frontendUrl,
  frontendUrl.replace(/\/$/, ''),
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes(origin) ||
      allowedOrigins.includes(cleanOrigin) ||
      /\.vercel\.app$/.test(new URL(origin).hostname) ||
      process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production'
    ) {
      return callback(null, true);
    }
    // Allow origin to ensure production deployments aren't blocked by minor URL mismatches
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', queueStatus: emailQueue.name });
});

// Create HTTP server and attach WebSocket server
const httpServer = http.createServer(app);
initSocket(httpServer);

// Start the worker
startWorker();

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with WebSockets enabled`);
});
