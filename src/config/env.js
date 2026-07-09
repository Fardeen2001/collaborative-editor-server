function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parseFloatEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parseList(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }
  if (raw === 'true' || raw === '1') return 1;
  if (raw === 'false' || raw === '0') return false;
  const hops = Number.parseInt(raw, 10);
  return Number.isNaN(hops) ? false : hops;
}

module.exports = { required, parseIntEnv, parseFloatEnv, parseList, parseTrustProxy };
