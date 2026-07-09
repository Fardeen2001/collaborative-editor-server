const { required, parseIntEnv, parseFloatEnv, parseList } = require('./env');

const maxMessageSize = parseIntEnv('MAX_MESSAGE_SIZE', 256 * 1024);

const config = {
  server: {
    port: parseIntEnv('PORT', 8000),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
    publicUrl: process.env.PUBLIC_URL || '',
  },
  cors: {
    origins: parseList('CORS_ORIGINS', parseList('CLIENT_URL', ['http://localhost:3000'])),
  },
  mongo: {
    uri: required('MONGO_URI'),
    dbName: process.env.MONGO_DB_NAME || 'collaborative_editor',
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bearerPrefixLength: 7,
  },
  auth: {
    bcryptRounds: parseIntEnv('BCRYPT_ROUNDS', 12),
  },
  ws: {
    path: process.env.WS_PATH || '/ws',
    maxMessageSize,
    maxMessagesPerSecond: parseIntEnv('WS_RATE_LIMIT', 60),
    reconnectCheckMs: parseIntEnv('WS_RECONNECT_CHECK_MS', 10_000),
    reconnectDelayMs: parseIntEnv('WS_RECONNECT_DELAY_MS', 2_000),
    queryParams: {
      token: process.env.WS_TOKEN_PARAM || 'token',
      documentId: process.env.WS_DOCUMENT_ID_PARAM || 'documentId',
    },
  },
  sync: {
    maxUpdateSize: maxMessageSize,
    maxDocUpdates: parseIntEnv('MAX_DOC_UPDATES', 50_000),
    snapshotInterval: parseIntEnv('SNAPSHOT_INTERVAL', 200),
  },
  rateLimit: {
    windowMs: parseIntEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: parseIntEnv('RATE_LIMIT_MAX', 300),
    apiPrefix: process.env.API_PREFIX || '/api',
  },
  yjs: {
    fieldName: process.env.YJS_FIELD_NAME || 'prosemirror',
    messageSync: parseIntEnv('YJS_MESSAGE_SYNC', 0),
    messageAwareness: parseIntEnv('YJS_MESSAGE_AWARENESS', 1),
  },
  roles: {
    all: ['owner', 'editor', 'viewer'],
    owner: 'owner',
    editor: 'editor',
    viewer: 'viewer',
    shareable: ['editor', 'viewer'],
    rank: { viewer: 0, editor: 1, owner: 2 },
  },
  validation: {
    password: { min: parseIntEnv('PASSWORD_MIN_LENGTH', 8), max: parseIntEnv('PASSWORD_MAX_LENGTH', 128) },
    name: { min: 1, max: parseIntEnv('NAME_MAX_LENGTH', 80) },
    title: { min: 1, max: parseIntEnv('TITLE_MAX_LENGTH', 200) },
    snapshotLabel: { min: 1, max: parseIntEnv('SNAPSHOT_LABEL_MAX_LENGTH', 120) },
    aiText: { min: 1, max: parseIntEnv('AI_TEXT_MAX_LENGTH', 8000) },
    aiInstruction: { max: parseIntEnv('AI_INSTRUCTION_MAX_LENGTH', 200) },
  },
  defaults: {
    snapshotLabel: process.env.DEFAULT_SNAPSHOT_LABEL || 'Manual snapshot',
    autoSnapshotLabel: process.env.DEFAULT_AUTO_SNAPSHOT_LABEL || 'Auto snapshot',
    fallbackSnapshotLabel: process.env.DEFAULT_FALLBACK_SNAPSHOT_LABEL || 'Snapshot',
    aiInstruction:
      process.env.DEFAULT_AI_INSTRUCTION ||
      'Improve clarity and grammar while preserving meaning.',
  },
  ai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
    temperature: parseFloatEnv('OPENAI_TEMPERATURE', 0.3),
    systemPrompt:
      process.env.OPENAI_SYSTEM_PROMPT ||
      'You are a writing assistant. Return only the improved text, no commentary.',
  },
  storage: {
    indexedDbDocPrefix: process.env.IDB_DOC_PREFIX || 'doc-',
    outboxDbName: process.env.OUTBOX_DB_NAME || 'collab-editor-outbox',
    outboxStoreName: process.env.OUTBOX_STORE_NAME || 'outbox',
    outboxDbVersion: parseIntEnv('OUTBOX_DB_VERSION', 1),
  },
  routes: {
    health: '/health',
    auth: '/api/auth',
    documents: '/api/documents',
    snapshots: '/api/documents/:id/snapshots',
    ai: '/api/ai',
    config: '/api/config',
  },
};

function getPublicConfig() {
  const port = config.server.port;
  const host = config.server.host === '0.0.0.0' ? 'localhost' : config.server.host;
  const apiBase = config.server.publicUrl || `http://${host}:${port}`;
  const wsBase = apiBase.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}${config.ws.path}`;

  return {
    apiUrl: apiBase,
    wsUrl,
    wsPath: config.ws.path,
    yjsField: config.yjs.fieldName,
    protocol: {
      messageSync: config.yjs.messageSync,
      messageAwareness: config.yjs.messageAwareness,
    },
    wsQueryParams: config.ws.queryParams,
    limits: {
      maxMessageSize: config.ws.maxMessageSize,
      passwordMinLength: config.validation.password.min,
      passwordMaxLength: config.validation.password.max,
      titleMaxLength: config.validation.title.max,
      snapshotLabelMaxLength: config.validation.snapshotLabel.max,
    },
    sync: {
      heartbeatMs: config.ws.reconnectCheckMs,
      reconnectMs: config.ws.reconnectDelayMs,
    },
    defaults: {
      snapshotLabel: config.defaults.snapshotLabel,
    },
    roles: config.roles.all,
    storage: {
      indexedDbDocPrefix: config.storage.indexedDbDocPrefix,
      outboxDbName: config.storage.outboxDbName,
      outboxStoreName: config.storage.outboxStoreName,
      outboxDbVersion: config.storage.outboxDbVersion,
    },
    features: {
      ai: Boolean(config.ai.apiKey),
    },
  };
}

module.exports = { config, getPublicConfig };
