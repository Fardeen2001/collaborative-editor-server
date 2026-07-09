require('dotenv').config();
const { execSync } = require('child_process');
const { config } = require('../src/config');

const port = config.server.port;

function getListeningPids(targetPort) {
  const pids = new Set();

  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${targetPort}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      for (const line of output.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
    } catch {
      return [];
    }
  } else {
    try {
      const output = execSync(`lsof -ti tcp:${targetPort} -sTCP:LISTEN`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      for (const pid of output.split('\n')) {
        if (pid.trim()) pids.add(pid.trim());
      }
    } catch {
      return [];
    }
  }

  return [...pids].filter((pid) => pid !== String(process.pid));
}

function isNodeProcess(pid) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return output.toLowerCase().includes('node.exe');
    }
    const output = execSync(`ps -p ${pid} -o comm=`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output.toLowerCase().includes('node');
  } catch {
    return false;
  }
}

function killPid(pid) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
  } else {
    execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
  }
}

function freePort() {
  const pids = getListeningPids(port);
  if (pids.length === 0) {
    console.log(`Port ${port} is free.`);
    return;
  }

  for (const pid of pids) {
    if (!isNodeProcess(pid)) {
      console.warn(
        `Port ${port} is used by non-Node PID ${pid}. ` +
          `Stop it manually or change PORT in .env.`
      );
      continue;
    }
    console.log(`Port ${port} in use by orphaned node (PID ${pid}) — stopping it…`);
    killPid(pid);
  }
}

freePort();
