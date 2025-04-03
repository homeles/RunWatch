import { Server } from 'socket.io';

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.CLIENT_URL || 'https://your-production-domain.com' 
        : 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: '/socket.io'
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Send a test event to verify connection
    socket.emit('connection_established', { message: 'Connected to server' });
    
    // Handle long-queued workflow events from clients
    socket.on('long-queued-workflow', (data) => {
      console.log('Received long-queued-workflow event from client:', data);
      
      // Broadcast the event to all clients (including the sender)
      io.emit('long-queued-workflow', data);
      console.log('Broadcasted long-queued-workflow event to all clients');
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
};

export default setupSocket;