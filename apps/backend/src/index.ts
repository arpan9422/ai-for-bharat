import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { WebSocketServer } from 'ws';
import { setupVoiceConnection } from './controllers/voiceController';
import { setupTestVoiceConnection } from './scripts/testVoicePipeline';
import { setupVoicePipelineConnection } from './services/conversation/voicePipelineHandler';
import rmRoutes from './modules/rm_dashbaord/lead.routes';
import conversationRoutes from './services/conversation/conversationRoutes';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:4000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:4000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow anyway for development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Voice pipeline test page (dev only)
app.get('/test-voice', (_req, res) => {
  res.sendFile(path.join(__dirname, 'scripts', 'test-voice.html'));
});

// LangGraph pipeline test page (dev only)
app.get('/test-voice-pipeline', (_req, res) => {
  res.sendFile(path.join(__dirname, 'scripts', 'test-voice-pipeline.html'));
});

// RM Dashboard routes
app.use('/api/rm', rmRoutes);

// Conversation API routes
app.use('/api/conversations', conversationRoutes);

// Create HTTP server
const server = http.createServer(app);

// Production voice WebSocket
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  setupVoiceConnection(ws);
});

// Test pipeline WebSocket (STT → LLM → TTS)
const wssTest = new WebSocketServer({ noServer: true });
wssTest.on('connection', (ws) => {
  console.log('[test-voice] client connected');
  setupTestVoiceConnection(ws);
});

// LangGraph pipeline WebSocket (STT → LangGraph → TTS)
const wssGraph = new WebSocketServer({ noServer: true });
wssGraph.on('connection', (ws) => {
  console.log('[voice-pipeline] client connected');
  setupVoicePipelineConnection(ws);
});

// Route upgrade requests to the correct WS server by path
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url!, `http://${req.headers.host}`);
  if (pathname === '/ws/voice') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/ws/test-voice') {
    wssTest.handleUpgrade(req, socket, head, (ws) => wssTest.emit('connection', ws, req));
  } else if (pathname === '/ws/voice-pipeline') {
    wssGraph.handleUpgrade(req, socket, head, (ws) => wssGraph.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// Start the server
server.listen(port, () => {
  console.log(`🚀 Rupeezy Backend running on http://localhost:${port}`);
  console.log(`🔌 WebSocket server listening on ws://localhost:${port}/ws/voice`);
  console.log(`🔌 LangGraph pipeline on ws://localhost:${port}/ws/voice-pipeline`);
});
