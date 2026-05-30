'use strict';

/**
 * CDN-зеркало Rlauncher (без PostgreSQL).
 * node server.js --port 8888 --domain alternate.lastdawn.ru
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const cliArgv = process.argv.slice(2);
let cliPort = null;
let cliDomain = null;

for (let i = 0; i < cliArgv.length; i++) {
  const arg = cliArgv[i];
  if (arg === '--port' && cliArgv[i + 1] != null) {
    cliPort = Number(cliArgv[++i]);
  } else if (arg.startsWith('--port=')) {
    cliPort = Number(arg.slice('--port='.length));
  } else if (arg === '--domain' && cliArgv[i + 1] != null) {
    cliDomain = String(cliArgv[++i]).trim();
  } else if (arg.startsWith('--domain=')) {
    cliDomain = String(arg.slice('--domain='.length)).trim();
  }
}

const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? Math.floor(cliPort)
    : Number(process.env.MIRROR_PORT || process.env.PORT || 3356);

if (Number.isFinite(cliPort) && cliPort > 0) {
  process.env.MIRROR_PORT = String(PORT);
  process.env.PORT = String(PORT);
}

if (cliDomain) {
  let url = cliDomain.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  process.env.MIRROR_PUBLIC_BASE_URL = url;
}

const settings = require('./config/settings');
const clientUpdateCacheService = require('./services/clientUpdateCacheService');

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads/clients', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Прямой доступ к клиентским файлам отключен. Используйте /api/client/v2/*'
  });
});

app.use(
  '/uploads',
  express.static('uploads', {
    setHeaders: (res, filePath) => {
      res.set('Access-Control-Allow-Origin', '*');
      if (filePath.endsWith('.zip')) {
        res.set('Content-Type', 'application/zip');
      }
      res.set('Cache-Control', 'public, max-age=3600');
    }
  })
);

app.use('/api/client', require('./routes/clientRoutes'));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    mode: 'mirror',
    port: PORT,
    publicBaseUrl: settings.publicBaseUrl,
    serversJson: settings.serversJsonPath
  });
});

app.listen(PORT, () => {
  console.log(`🪞 Mirror CDN is running on port ${PORT}`);
  console.log(`   Public base URL: ${settings.publicBaseUrl}`);
  console.log(`   Servers list: ${settings.serversJsonPath}`);

  const syncStartedAt = Date.now();
  clientUpdateCacheService
    .syncStartupUpdates()
    .then((r) => {
      console.log(
        `🔄 startup syncClients: done in ${Date.now() - syncStartedAt}ms`,
        r
      );
    })
    .catch((err) => {
      console.error('❌ startup syncClients:', err.message || err);
    });
});
