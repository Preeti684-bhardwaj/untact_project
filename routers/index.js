const express = require('express');
// const executiveAssignedRouter = require('./executiveAssigned.router');
// const executiveRouter = require('./executive.router');
// const eventRouter = require('./event.router');
// const conferenceRouter = require('./conference.router');
// const exhibitorBrand = require('./exhibitorBrand.router');
const agent=require('./Agent.router')
const admin=require('./Admin.router')
const organization=require('./Organization.router')
const jobCard=require('./JobCard.router')
const router = express.Router();

router.use('/agent',agent)
router.use('/admin',admin)
router.use('/organization',organization)
router.use('/jobCard',jobCard)
// router.use('/executive-assigned', executiveAssignedRouter);
// router.use('/executive', executiveRouter);
// router.use('/conference', conferenceRouter);
// router.use('/event',eventRouter);
// router.use('/exhibitor-brand',exhibitorBrand);
module.exports = router;
