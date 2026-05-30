'use strict';

const clientUpdateCacheService = require('../services/clientUpdateCacheService');
const serverRegistry = require('../services/serverRegistry');
const settings = require('../config/settings');

const SUPPORTED_ARCH = settings.architectures;

const getUpdateList = async (req, res) => {
  try {
    const rows = await serverRegistry.getActiveServersClientInfo();
    const updates = rows.map((r) => ({
      serverId: String(r.id),
      name: r.name,
      dir: r.dir,
      version: r.version,
      has_server: serverRegistry.normalizeHasServer(r.has_server)
    }));
    res.json({ updates });
  } catch (e) {
    console.error('[client v2] update-list:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

const getSignedManifest = async (req, res) => {
  try {
    const serverId = req.params.id;
    const arch = req.query.arch || 'macos-arm64';
    if (!SUPPORTED_ARCH.includes(arch)) {
      return res.status(400).json({
        success: false,
        message: `Неподдерживаемая архитектура. Допустимо: ${SUPPORTED_ARCH.join(', ')}`
      });
    }

    const server = await serverRegistry.getServerById(serverId);
    if (!server) {
      return res.status(404).json({ success: false, message: 'Сервер не найден' });
    }
    if (!server.dir || !server.version) {
      return res.status(400).json({
        success: false,
        message: 'У сервера не заданы dir или version'
      });
    }

    const entry = await clientUpdateCacheService.ensureUpdateEntry(server, arch);
    res.json({
      holder: { object: entry.object, signature: entry.signature },
      algorithm: entry.algorithm,
      syncedAt: entry.syncedAt
    });
  } catch (e) {
    console.error('[client v2] manifest:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

const getSignedProfiles = async (req, res) => {
  try {
    const entry = await clientUpdateCacheService.ensureProfilesEntry();
    res.json({
      holder: { object: entry.object, signature: entry.signature },
      algorithm: entry.algorithm,
      syncedAt: entry.syncedAt
    });
  } catch (e) {
    console.error('[client v2] profiles:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

const postUpdateStream = async (req, res) => {
  try {
    const serverId = req.params.id;
    const arch = req.query.arch || 'macos-arm64';
    if (!SUPPORTED_ARCH.includes(arch)) {
      return res.status(400).json({ success: false, message: 'Неподдерживаемая архитектура' });
    }

    const actions = req.body && req.body.actions;
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ success: false, message: 'Нужен массив actions' });
    }
    if (actions.length > clientUpdateCacheService.MAX_ACTION_BATCH) {
      return res.status(400).json({
        success: false,
        message: `Не более ${clientUpdateCacheService.MAX_ACTION_BATCH} действий за запрос`
      });
    }

    const server = await serverRegistry.getServerById(serverId);
    if (!server) {
      return res.status(404).json({ success: false, message: 'Сервер не найден' });
    }
    if (!server.dir || !server.version) {
      return res.status(400).json({
        success: false,
        message: 'У сервера не заданы dir или version'
      });
    }

    const entry = await clientUpdateCacheService.ensureUpdateEntry(server, arch);
    const tree = entry.object && entry.object.tree;
    if (!tree) {
      return res.status(500).json({ success: false, message: 'Пустое дерево манифеста' });
    }

    res.setHeader('Content-Type', 'application/x-minehub-update-stream');
    res.setHeader('Cache-Control', 'no-store');
    await clientUpdateCacheService.processActionBatch(res, tree, actions);
    res.end();
  } catch (e) {
    console.error('[client v2] update-stream:', e);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: e.message });
    } else {
      res.destroy();
    }
  }
};

module.exports = {
  getUpdateList,
  getSignedManifest,
  getSignedProfiles,
  postUpdateStream
};
