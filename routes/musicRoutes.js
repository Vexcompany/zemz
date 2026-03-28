// routes/musicRoutes.js — FIXED (file ini sebelumnya berisi controller bukan router!)
// File ini tidak lagi dipakai di server.js yang sudah difix,
// tapi disimpan untuk referensi kalau mau pakai routing model lama.

const express = require('express');
const router = express.Router();
const { searchAppleMusic, downloadAppleMusic } = require('../controllers/musicController');

router.get('/apple-search', searchAppleMusic);
router.post('/apple-download', downloadAppleMusic);

module.exports = router;
