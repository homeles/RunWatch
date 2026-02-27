import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { createNodeMiddleware } from '@octokit/webhooks';
import connectDB from './src/config/db.js';
import apiRoutes from './src/routes/api.js';
import setupSocket from './src/middleware/socket.js';
import setupGithubWebhooks from './src/middleware/github.js';
import path from 'path';
import { fileURLToPath } from 'url';
import getRawBody from 'raw-body';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from root .env
config({ path: path.join(__dirname, '../.env') });

// Connect to database
connectDB();

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = setupSocket(server);
// Make io globally available
global.io = io;

// Security headers
app.use(helmet());

// Trust one proxy hop (Nginx in Docker) so that req.ip reflects the real client IP
// for rate limiting and other IP-dependent logic.
app.set('trust proxy', 1);

// CORS - restrict to allowed origins only.
// In production, CLIENT_URL is required — same enforcement as Socket.IO (socket.js line 7-9).
// In development, http://localhost:3000 is also allowed for local frontend dev server.
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.CLIENT_URL) {
  throw new Error('CORS configuration error: CLIENT_URL must be set in production.');
}
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : ['http://localhost']),
  ...(!isProduction ? ['http://localhost:3000'] : [])
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Return an error for better debugging while still blocking the request
    callback(new Error(`CORS: origin ${origin} is not allowed`), false);
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

// Global rate limiter — 300 requests per 15 minutes per IP
// GitHub webhooks and sync endpoints are excluded from the global limiter:
//   - Webhooks can legitimately burst from shared GitHub IP ranges
//   - Sync endpoints have their own stricter limiter (10/min); applying both would
//     mean the global 100/15min (~6.7/min effective) throttles before the intended 10/min
// NOTE: When mounted on '/api', Express strips the prefix — req.path is relative to the
// mount point (e.g., '/webhooks/github' not '/api/webhooks/github').
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) =>
    req.path.startsWith('/webhooks/github') ||
    req.path.startsWith('/sync')
});
app.use('/api', globalLimiter);

// Stricter rate limit for sync endpoints (expensive operations)
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many sync requests, please slow down.' }
});
app.use('/api/sync', syncLimiter);

// Initialize GitHub webhooks instance
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.error('GITHUB_WEBHOOK_SECRET is not configured!');
}
console.log('Setting up GitHub webhooks with secret:', webhookSecret ? 'Secret provided' : 'NO SECRET PROVIDED');
const webhooks = setupGithubWebhooks(webhookSecret);

// Raw body handler for GitHub webhooks
app.post('/api/webhooks/github', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const id = req.headers['x-github-delivery'];
  const name = req.headers['x-github-event'];
  const contentType = req.headers['content-type'];

  console.log('Received webhook POST request from GitHub');
  console.log('Event:', name);
  console.log('Delivery ID:', id);
  console.log('Content-Type:', contentType);
  console.log('Signature:', signature);

  if (!signature || !id || !name) {
    console.error('Missing required webhook headers');
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Get the raw body as a buffer
    const rawBody = await getRawBody(req);
    console.log('Raw body length:', rawBody.length);

    // First verify the signature with the raw body
    const verified = await webhooks.verify({
      signature,
      rawBody
    });

    if (!verified) {
      throw new Error('Webhook signature verification failed');
    }

    // Parse the raw body as JSON for webhook processing
    const payload = JSON.parse(rawBody.toString());

    // Process the webhook with the parsed payload
    await webhooks.receive({
      id,
      name,
      payload
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook verification or processing failed:', error);
    res.status(400).json({ 
      error: 'Webhook verification failed',
      ...(process.env.NODE_ENV === 'development' && { message: error.message })
    });
  }
});

// GET handler for webhook endpoint — returns minimal response to avoid information disclosure
app.get('/api/webhooks/github', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Configure Express body parsing — global 10mb limit.
// /api/database/restore is excluded here because it needs a 100mb limit, applied on the
// route itself (after auth) to prevent unauthenticated clients from forcing large-body parsing.
const globalJsonParser = express.json({ limit: '10mb' });
const globalUrlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });
app.use((req, res, next) => {
  // Skip global body parsing for restore — handled by route-specific middleware after auth
  if (req.path === '/api/database/restore') return next();
  globalJsonParser(req, res, (err) => {
    if (err) return next(err);
    globalUrlencodedParser(req, res, next);
  });
});

// Make io available in request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// General API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    // Only expose error details in development to prevent information disclosure
    ...(process.env.NODE_ENV === 'development' && { message: err.message })
  });
});

// Start server - Use both PORT and SERVER_PORT to handle both conventions
const PORT = process.env.PORT || process.env.SERVER_PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhooks/github`);
  console.log('Webhook secret configured:', webhookSecret ? 'Yes' : 'No');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});