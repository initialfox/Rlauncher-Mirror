'use strict';

const fs = require('fs');
const settings = require('../config/settings');

let serversCache = null;

function loadServersFromDisk() {
  const raw = fs.readFileSync(settings.serversJsonPath, 'utf8');
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data.servers || [];
  return list.filter(
    (s) =>
      s &&
      s.dir &&
      String(s.dir).trim() !== '' &&
      s.version &&
      String(s.version).trim() !== '' &&
      s.is_active !== false
  );
}

function getServers() {
  if (!serversCache) {
    serversCache = loadServersFromDisk();
  }
  return serversCache;
}

class ServerRegistry {
  normalizeHasServer(value) {
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return true;
  }

  async getActiveServersClientInfo() {
    return getServers().map((s) => ({
      id: s.id,
      name: s.name,
      dir: s.dir,
      version: s.version,
      has_server: this.normalizeHasServer(s.has_server)
    }));
  }

  async getServerById(id) {
    const row = getServers().find((s) => String(s.id) === String(id));
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      dir: row.dir,
      version: row.version,
      has_server: this.normalizeHasServer(row.has_server)
    };
  }

  reloadServers() {
    serversCache = null;
    return getServers().length;
  }
}

module.exports = new ServerRegistry();
