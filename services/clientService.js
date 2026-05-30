'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const settings = require('../config/settings');

class ClientService {
  getClientsBasePath() {
    return path.join(__dirname, '../uploads/clients');
  }

  async getFilesList(dirPath, arch = null, isInsideLibrariesOrAssets = false) {
    const files = [];
    const clientsBasePath = this.getClientsBasePath();

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            const relativePath = path.relative(clientsBasePath, dirPath).replace(/\\/g, '/');
            const isLibrariesOrAssets =
              relativePath.includes('libraries') ||
              relativePath.includes('assets') ||
              isInsideLibrariesOrAssets;

            if ((entry.name === 'natives' || entry.name === 'java') && arch && !isLibrariesOrAssets) {
              const archPath = path.join(fullPath, arch);
              try {
                await fs.access(archPath);
                const archFiles = await this.getFilesList(archPath, null, false);
                files.push(...archFiles);
              } catch {
                const fallbackFiles = await this.getFilesList(fullPath, null, false);
                files.push(...fallbackFiles);
              }
            } else {
              const subFiles = await this.getFilesList(fullPath, null, isLibrariesOrAssets);
              files.push(...subFiles);
            }
          } else {
            const relativeFromClients = path.relative(clientsBasePath, fullPath).replace(/\\/g, '/');
            const fileBuffer = await fs.readFile(fullPath);
            const md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
            files.push({
              path: relativeFromClients,
              size: fileBuffer.length,
              md5: md5Hash
            });
          }
        } catch (entryError) {
          console.error('Error processing entry:', fullPath, entryError.message || entryError);
        }
      }
    } catch (error) {
      console.error('Error reading directory:', dirPath, error);
    }

    return files;
  }

  async getClientFiles(serverDir, version, arch = 'macos-arm64') {
    const clientsBasePath = this.getClientsBasePath();
    const instancePath = path.join(clientsBasePath, 'instances', serverDir);
    const versionPath = path.join(clientsBasePath, 'versions', version);
    const allFiles = [];

    try {
      await fs.access(instancePath);
      const instanceFiles = await this.getFilesList(instancePath, null);
      allFiles.push(...instanceFiles);
    } catch {
      // no instance dir
    }

    try {
      await fs.access(versionPath);
      const versionFiles = await this.getFilesList(versionPath, arch);
      allFiles.push(...versionFiles);
    } catch {
      // no version dir
    }

    return { files: allFiles };
  }

  getFilePath(relativePath) {
    return path.join(this.getClientsBasePath(), relativePath);
  }

  getLoaderPath(arch) {
    return path.join(__dirname, '../uploads/loader', arch, settings.fileName);
  }

  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    return 0;
  }

  getPublicBaseUrl() {
    return settings.publicBaseUrl;
  }

  getLauncherDownloadUrl(arch) {
    const baseUrl = this.getPublicBaseUrl();
    return `${baseUrl}/uploads/loader/${arch}/${settings.fileName}`;
  }

  async checkForUpdate(currentVersion, arch) {
    const latestVersion = settings.latestVersion;
    const hasUpdate = this.compareVersions(currentVersion, latestVersion) < 0;
    const baseUrl = this.getPublicBaseUrl();

    return {
      hasUpdate,
      latestVersion,
      downloadUrl: this.getLauncherDownloadUrl(arch),
      baseUrl
    };
  }
}

module.exports = new ClientService();
