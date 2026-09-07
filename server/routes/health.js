const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()), version: 1 });
});

module.exports = router;