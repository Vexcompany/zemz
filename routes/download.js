const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

// POST /api/download - Download & upload ke Catbox
router.post('/', downloadController.download);

// GET /api/download/info?url= - Cek info track
router.get('/info', downloadController.getInfo);

// GET /api/download/tracks - List semua track di database
router.get('/tracks', downloadController.getAllTracks);

// GET /api/download/search?q=query - Cari di database lokal
router.get('/search', downloadController.searchLocal);

// POST /api/download/reupload - Force reupload ke Catbox
router.post('/reupload', downloadController.reupload);

module.exports = router;