'use strict';

const path = require('path');

module.exports = {
  get publicBaseUrl() {
    return process.env.MIRROR_PUBLIC_BASE_URL || 'http://127.0.0.1:3356';
  },

  serversJsonPath:
    process.env.MIRROR_SERVERS_JSON ||
    path.join(__dirname, '..', 'data', 'mirror-servers.json'),

  latestVersion: process.env.LAUNCHER_LATEST_VERSION || '2.0.77',
  fileName: process.env.LAUNCHER_FILE_NAME || 'RLauncher.zip',

  architectures: ['macos-arm64', 'macos-x64', 'windows-x64', 'linux-x64']
};
