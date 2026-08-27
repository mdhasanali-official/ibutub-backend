//routes/adminDownloadRoutes.js
const express = require("express");
const {
  getDownloadLogs,
  getFailedTracker,
  getWeeklyFailChart,
} = require("../controllers/adminDownloadController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/downloads", adminAuth, getDownloadLogs);
router.get("/downloads/failed-tracker", adminAuth, getFailedTracker);
router.get("/downloads/weekly-fail-chart", adminAuth, getWeeklyFailChart);

module.exports = router;
