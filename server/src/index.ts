import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './api/auth.js';
import ticketRoutes from './api/tickets.js';
import queueRoutes from './api/queues.js';
import slaRoutes from './api/sla.js';
import escalationMatrixRoutes from './api/escalation-matrix.js';
import escalationAdvancedRoutes from './api/escalation-advanced.js';
import emailRoutes from './api/email.js';
import chatRoutes from './api/chat.js';
import geminiRoutes from './api/gemini.js';
import checkGeminiRoutes from './api/check-gemini.js';
import suggestFixRoutes from './api/suggest-fix.js';

const app = express();
const PORT = process.env.PORT || 3001;

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', checkGeminiRoutes);
app.use('/api', geminiRoutes);
app.use('/api', suggestFixRoutes);
app.use('/api', ticketRoutes);
app.use('/api', queueRoutes);
app.use('/api', slaRoutes);
app.use('/api', escalationMatrixRoutes);
app.use('/api', escalationAdvancedRoutes);
app.use('/api', emailRoutes);
app.use('/api', chatRoutes);

// WebSocket handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-ticket', (ticketId) => {
    socket.join(`ticket:${ticketId}`);
    console.log(`User joined ticket: ${ticketId}`);
  });

  socket.on('leave-ticket', (ticketId) => {
    socket.leave(`ticket:${ticketId}`);
  });

  socket.on('send-message', (ticketId, message) => {
    io.to(`ticket:${ticketId}`).emit('new-message', message);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err: unknown, req: express.Request, res: express.Response) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
