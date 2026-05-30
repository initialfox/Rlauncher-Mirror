'use strict';

const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const clientUpdateController = require('../controllers/clientUpdateController');

router.get('/v2/update-list', clientUpdateController.getUpdateList);
router.get('/v2/profiles', clientUpdateController.getSignedProfiles);
router.get('/v2/server/:id/manifest', clientUpdateController.getSignedManifest);
router.post('/v2/server/:id/update-stream', clientUpdateController.postUpdateStream);

router.get('/check-update', clientController.checkUpdate);
router.get('/loader/download/:arch', clientController.downloadLoader);

const legacyV1Disabled = (req, res) =>
  res.status(410).json({
    success: false,
    message: 'Legacy API отключен. Используйте /api/client/v2/*'
  });

router.get('/server/:id/files', legacyV1Disabled);
router.head('/download/*', legacyV1Disabled);
router.get('/download/*', legacyV1Disabled);

module.exports = router;
