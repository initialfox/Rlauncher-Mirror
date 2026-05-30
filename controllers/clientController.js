'use strict';

const fs = require('fs').promises;
const path = require('path');
const clientService = require('../services/clientService');
const settings = require('../config/settings');

const checkUpdate = async (req, res) => {
  try {
    const { version, arch } = req.query;

    if (!version) {
      return res.status(400).json({ success: false, message: 'Версия не указана' });
    }
    if (!arch) {
      return res.status(400).json({ success: false, message: 'Архитектура не указана' });
    }
    if (!settings.architectures.includes(arch)) {
      return res.status(400).json({ success: false, message: 'Неподдерживаемая архитектура' });
    }

    const updateInfo = await clientService.checkForUpdate(version, arch);
    res.json({ success: true, ...updateInfo });
  } catch (error) {
    console.error('Ошибка при проверке обновления:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при проверке обновления: ' + error.message
    });
  }
};

const downloadLoader = async (req, res) => {
  try {
    const { arch } = req.params;
    if (!settings.architectures.includes(arch)) {
      return res.status(400).json({
        success: false,
        message: `Неподдерживаемая архитектура. Поддерживаются: ${settings.architectures.join(', ')}`
      });
    }

    const loaderPath = clientService.getLoaderPath(arch);
    try {
      await fs.access(loaderPath);
    } catch {
      return res.status(404).json({
        success: false,
        message: `Лаунчер для архитектуры ${arch} не найден`
      });
    }

    res.setHeader('Content-Disposition', `attachment; filename=${settings.fileName}`);
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(path.resolve(loaderPath));
  } catch (error) {
    console.error('Ошибка при скачивании лаунчера:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при скачивании лаунчера: ' + error.message
    });
  }
};

module.exports = { checkUpdate, downloadLoader };
