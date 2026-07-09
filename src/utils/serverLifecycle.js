const net = require('net');
const { config } = require('../config');

function isPortAvailable(port, host = config.server.host) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, host);
  });
}

function listenWithRetry(server, port, host, maxAttempts = 5) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryListen = () => {
      attempt += 1;

      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          const delay = attempt * 500;
          console.warn(`Port ${port} busy, retrying in ${delay}ms (${attempt}/${maxAttempts})…`);
          setTimeout(tryListen, delay);
          return;
        }
        reject(
          Object.assign(
            new Error(
              `Port ${port} is still in use after ${maxAttempts} attempts. ` +
                `Run "npm run free-port" or close the other terminal.`
            ),
            { code: 'EADDRINUSE' }
          )
        );
      };

      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    };

    tryListen();
  });
}

function registerServerErrorHandlers(server, wss) {
  const handleFatal = (source, err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[${source}] Port ${config.server.port} is already in use. ` +
          `Stop the other process or change PORT in .env.`
      );
    } else {
      console.error(`[${source}]`, err.message);
    }
    process.exit(1);
  };

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') return;
    handleFatal('HTTP', err);
  });

  if (wss) {
    wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') return;
      handleFatal('WebSocket', err);
    });
  }
}

function registerGracefulShutdown(server, wss) {
  let shuttingDown = false;

  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    const closeWss = new Promise((resolve) => {
      if (!wss) return resolve();
      wss.clients.forEach((client) => {
        try {
          client.close(1001, 'Server shutting down');
        } catch {
          /* ignore */
        }
      });
      wss.close(() => resolve());
    });

    closeWss
      .then(
        () =>
          new Promise((resolve) => {
            server.close(() => resolve());
          })
      )
      .then(() => {
        process.exit(exitCode);
      })
      .catch(() => {
        process.exit(1);
      });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Nodemon restart — release port before the child process starts
  process.once('SIGUSR2', () => {
    shuttingDown = true;
    const closeWss = new Promise((resolve) => {
      if (!wss) return resolve();
      wss.clients.forEach((client) => {
        try {
          client.close(1001, 'Server restarting');
        } catch {
          /* ignore */
        }
      });
      wss.close(() => resolve());
    });

    closeWss
      .then(() => new Promise((resolve) => server.close(() => resolve())))
      .then(() => process.kill(process.pid, 'SIGUSR2'))
      .catch(() => process.exit(1));
  });
}

module.exports = {
  isPortAvailable,
  listenWithRetry,
  registerServerErrorHandlers,
  registerGracefulShutdown,
};
