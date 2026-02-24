import { Server } from 'socket.io';

const setupSocket = (server) => {
  const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost',
    'http://localhost:3000'
  ];

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Socket.IO CORS: origin ${origin} is not allowed`));
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