import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Allow clients to join a room by user ID if provided
    socket.on('join', (userId: string) => {
      if (userId) {
        socket.join(userId);
        console.log(`[SOCKET] Socket ${socket.id} joined room: ${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): SocketIOServer | null {
  return io;
}

// Broadcasters for real-time events

export function emitEmailScheduled(emails: any[] | any, userId?: string) {
  if (!io) return;
  const data = Array.isArray(emails) ? emails : [emails];
  io.emit('email:scheduled', data);
  if (userId) {
    io.to(userId).emit('email:scheduled', data);
  }
}

export function emitEmailSent(email: any, userId?: string) {
  if (!io) return;
  io.emit('email:sent', email);
  if (userId) {
    io.to(userId).emit('email:sent', email);
  }
}

export function emitEmailFailed(email: any, userId?: string) {
  if (!io) return;
  io.emit('email:failed', email);
  if (userId) {
    io.to(userId).emit('email:failed', email);
  }
}

export function emitEmailRescheduled(email: any, userId?: string) {
  if (!io) return;
  io.emit('email:rescheduled', email);
  if (userId) {
    io.to(userId).emit('email:rescheduled', email);
  }
}

export function emitRateLimitReached(data: {
  limit: number;
  count: number;
  emailId: string;
  to: string;
  nextHourTime: string;
  userId?: string;
}) {
  if (!io) return;
  io.emit('rate-limit:reached', data);
  if (data.userId) {
    io.to(data.userId).emit('rate-limit:reached', data);
  }
}

export function emitStatsUpdated(stats: any) {
  if (!io) return;
  io.emit('stats:updated', stats);
}

export function emitEmailDeleted(emailId: string, userId?: string) {
  if (!io) return;
  io.emit('email:deleted', { id: emailId });
  if (userId) {
    io.to(userId).emit('email:deleted', { id: emailId });
  }
}
