import { io, Socket } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[WEBSOCKET] Connected to server, ID:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('[WEBSOCKET] Disconnected from server');
    });
  }
  return socket;
};
