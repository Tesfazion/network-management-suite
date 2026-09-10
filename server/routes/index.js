const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { notFoundHandler } = require('../middleware/errors');

const dashboard = require('./dashboard');
const health = require('./health');
const infrastructure = require('./infrastructure');
const ipvlan = require('./ipvlan');
const issues = require('./issues');
const monitoring = require('./monitoring');
const diagram = require('./diagram');
const search = require('./search');
const setup = require('./setup');
const exportRoutes = require('./export');
const organizations = require('./organizations');

const router = express.Router();

router.use(requireAuth);

router.use(health);
router.use('/organizations', organizations);
router.use(dashboard);
router.use(infrastructure);
router.use(ipvlan);
router.use(issues);
router.use(monitoring);
router.use(diagram);
router.use(search);
router.use(setup);
router.use(exportRoutes);

router.use(notFoundHandler);

module.exports = router;