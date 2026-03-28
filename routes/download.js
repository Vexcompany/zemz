// routes/download.js — FIXED
// Dipanggil dari server.js sebagai: app.use('/api/apple-download', downloadRoutes)
// Endpoint akhir: POST /api/apple-download  body: { url }

const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

// POST /api/apple-download — ini yang dipanggil index.html
router.post('/', downloadController.download);

// GET /api/apple-download/info?url=
router.get('/info', downloadController.getInfo);

// GET /api/apple-download/tracks
router.get('/tracks', downloadController.getAllTracks);

// GET /api/apple-download/search?q=
router.get('/search', downloadController.searchLocal);

// POST /api/apple-download/reupload
router.post('/reupload', downloadController.reupload);

module.exports = router;
