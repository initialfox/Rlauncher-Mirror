'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');
const clientService = require('./clientService');
const serverRegistry = require('./serverRegistry');
const { buildTreeFromFlatFiles, stableStringify } = require('./hashedDir');

const MAX_ACTION_BATCH = 128;
const updatesDirMap = new Map();
let profilesCache = null;

function cacheKey(serverId, arch) {
  return `${serverId}:${arch}`;
}

function getSigningKey() {
  const key = process.env.CLIENT_UPDATE_PRIVATE_KEY;
  if (!key || !String(key).includes('PRIVATE KEY')) {
    throw new Error(
      'Задайте CLIENT_UPDATE_PRIVATE_KEY в .env (тот же ключ, что на основном API)'
    );
  }
  return key;
}

function signObject(obj) {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(stableStringify(obj));
  sign.end();
  return sign.sign(getSigningKey(), 'base64');
}

async function buildManifestObject(rec, arch) {
  const filesData = await clientService.getClientFiles(rec.dir, rec.version, arch);
  const tree = buildTreeFromFlatFiles(filesData.files);
  return {
    v: 1,
    serverId: String(rec.id),
    name: rec.name || null,
    dir: rec.dir,
    version: rec.version,
    arch,
    tree
  };
}

async function buildAndCacheUpdate(rec, arch) {
  const object = await buildManifestObject(rec, arch);
  const signature = signObject(object);
  const entry = {
    object,
    signature,
    algorithm: 'RSA-SHA256',
    syncedAt: new Date().toISOString()
  };
  updatesDirMap.set(cacheKey(rec.id, arch), entry);
  return entry;
}

function buildSignedProfilesEntry(rows) {
  const object = {
    v: 1,
    profiles: rows.map((r) => ({
      serverId: String(r.id),
      name: r.name,
      dir: r.dir,
      version: r.version,
      has_server: serverRegistry.normalizeHasServer(r.has_server)
    }))
  };
  const signature = signObject(object);
  return {
    object,
    signature,
    algorithm: 'RSA-SHA256',
    syncedAt: new Date().toISOString()
  };
}

async function ensureProfilesEntry() {
  if (!profilesCache) {
    const rows = await serverRegistry.getActiveServersClientInfo();
    profilesCache = buildSignedProfilesEntry(rows);
  }
  return profilesCache;
}

async function ensureUpdateEntry(server, arch) {
  const rec = {
    id: server.id,
    dir: server.dir,
    version: server.version,
    name: server.name
  };
  const key = cacheKey(server.id, arch);
  let entry = updatesDirMap.get(key);
  if (!entry) {
    entry = await buildAndCacheUpdate(rec, arch);
  }
  return entry;
}

async function syncAllUpdates() {
  const rows = await serverRegistry.getActiveServersClientInfo();
  const archs = settings.architectures;
  const tasks = [];
  for (const row of rows) {
    for (const arch of archs) {
      tasks.push(() => buildAndCacheUpdate(row, arch));
    }
  }
  const concurrency = Math.max(
    1,
    Math.min(16, Math.floor(Number(process.env.CLIENT_SYNC_CONCURRENCY || 4)))
  );
  return { rebuilt: await runTasksWithConcurrency(tasks, concurrency), servers: rows.length };
}

async function runTasksWithConcurrency(tasks, concurrency) {
  if (!tasks.length) return 0;
  let rebuilt = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      await tasks[i]();
      rebuilt++;
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return rebuilt;
}

async function syncStartupUpdates() {
  const mode = String(process.env.CLIENT_STARTUP_SYNC_MODE || 'single').toLowerCase();
  if (mode === 'off') {
    return { mode, rebuilt: 0, servers: 0 };
  }
  if (mode === 'all') {
    const full = await syncAllUpdates();
    return { mode, ...full };
  }

  const startupArch = process.env.CLIENT_STARTUP_SYNC_ARCH || 'windows-x64';
  const rows = await serverRegistry.getActiveServersClientInfo();
  const tasks = rows.map((row) => () => buildAndCacheUpdate(row, startupArch));
  const concurrency = Math.max(
    1,
    Math.min(16, Math.floor(Number(process.env.CLIENT_SYNC_CONCURRENCY || 4)))
  );
  const rebuilt = await runTasksWithConcurrency(tasks, concurrency);
  return { mode, arch: startupArch, rebuilt, servers: rows.length };
}

function writeStatus(res, code) {
  res.write(Buffer.from([code & 0xff]));
}

async function writeGetFileIntoStream(res, absFilePath) {
  let st;
  try {
    st = await fs.promises.stat(absFilePath);
  } catch {
    writeStatus(res, 2);
    return;
  }
  if (!st.isFile()) {
    writeStatus(res, 3);
    return;
  }
  if (st.size > 0xffffffff) {
    writeStatus(res, 4);
    return;
  }
  writeStatus(res, 0);
  const lb = Buffer.alloc(4);
  lb.writeUInt32BE(st.size >>> 0, 0);
  res.write(lb);
  const rs = fs.createReadStream(absFilePath);
  try {
    for await (const chunk of rs) {
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } finally {
    rs.destroy();
  }
}

async function processActionBatch(res, treeRoot, actions) {
  const stack = [treeRoot];
  let current = treeRoot;
  const base = path.resolve(clientService.getClientsBasePath());

  for (const raw of actions) {
    const op = raw && raw.op;
    const name = raw && raw.name;

    if (op === 'CD') {
      if (!name || typeof name !== 'string') {
        writeStatus(res, 1);
        continue;
      }
      const child = current.children.find((c) => c.type === 'DIR' && c.name === name);
      if (!child) {
        writeStatus(res, 1);
        continue;
      }
      stack.push(child);
      current = child;
      writeStatus(res, 0);
      continue;
    }

    if (op === 'CD_BACK') {
      if (stack.length <= 1) {
        writeStatus(res, 1);
        continue;
      }
      stack.pop();
      current = stack[stack.length - 1];
      writeStatus(res, 0);
      continue;
    }

    if (op === 'GET') {
      if (!name || typeof name !== 'string') {
        writeStatus(res, 1);
        continue;
      }
      const child = current.children.find((c) => c.type === 'FILE' && c.name === name);
      if (!child || !child.relPath) {
        writeStatus(res, 2);
        continue;
      }
      const abs = path.resolve(clientService.getFilePath(child.relPath));
      const relToBase = path.relative(base, abs);
      if (relToBase.startsWith('..') || path.isAbsolute(relToBase)) {
        writeStatus(res, 1);
        continue;
      }
      await writeGetFileIntoStream(res, abs);
      continue;
    }

    if (op === 'FINISH') {
      writeStatus(res, 0);
      continue;
    }

    writeStatus(res, 1);
  }
}

module.exports = {
  MAX_ACTION_BATCH,
  ensureUpdateEntry,
  ensureProfilesEntry,
  syncStartupUpdates,
  processActionBatch
};
