require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('./src/config');
const { connectDB } = require('./src/config/db');
const { attachWebSocketServer } = require('./src/ws/syncServer');
const { registerConfigRoute } = require('./src/routes/config.routes');
const authRoutes = require('./src/routes/auth.routes');
const documentRoutes = require('./src/routes/document.routes');
const snapshotRoutes = require('./src/routes/snapshot.routes');
const aiRoutes = require('./src/routes/ai.routes');
const {
  listenWithRetry,
  registerServerErrorHandlers,
  registerGracefulShutdown,
} = require('./src/utils/serverLifecycle');

const app = express();

if (config.server.trustProxy) {
  app.set('trust proxy', config.server.trustProxy);
}

app.use(helmet());
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  })
);
app.use(express.json({ limit: config.server.jsonBodyLimit }));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(config.rateLimit.apiPrefix, limiter);

registerConfigRoute(app);

app.get(config.routes.health, (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(config.routes.auth, authRoutes);
app.use(config.routes.documents, documentRoutes);
app.use(config.routes.snapshots, snapshotRoutes);
app.use(config.routes.ai, aiRoutes);

app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
});

async function start() {
  await connectDB();

  const server = http.createServer(app);
  const wss = attachWebSocketServer(server);

  registerServerErrorHandlers(server, wss);
  registerGracefulShutdown(server, wss);

  await listenWithRetry(server, config.server.port, config.server.host);

  const base =
    config.server.publicUrl ||
    `http://localhost:${config.server.port}`;
  console.log(`API + WebSocket server running on ${base}`);
  console.log(`WebSocket path: ${config.ws.path}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
