import { Server } from 'socket.io';

const setupSocket = (server) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, CLIENT_URL must be set — refuse to start with a permissive default.
  if (isProduction && !process.env.CLIENT_URL) {
    throw new Error('Socket.IO CORS misconfiguration: CLIENT_URL must be set in production');
  }

  // Mirror the Express CORS allowlist: localhost:3000 only in non-production.
  // Originless connections (server-to-server / CLI clients) are allowed, matching Express CORS behaviour.
  const allowedOrigins = [
    ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : ['http://localhost']),
    ...(!isProduction ? ['http://localhost:3000'] : [])
  ];

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow server-to-server / CLI clients that don't send an Origin header
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket.IO CORS: origin ${origin} is not allowed`));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io'
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send a connection confirmation
    socket.emit('connection_established', { message: 'Connected to server' });

    // Validate that long-queued-workflow events come from trusted server-side logic only.
    // Clients should NOT be able to trigger broadcasts directly.
    // This event is intentionally removed from client-facing handlers.
    // Server-side code emits 'long-queued-workflow' directly via io.emit() when needed.

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export default setupSocket;