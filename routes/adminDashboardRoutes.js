// routes/adminDashboardRoutes.js
const express = require("express");
const {
  getAdminDashboardStats,
  getDownloadsChart,
  getPlatformStats,
} = require("../controllers/adminDashboardController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/dashboard-stats", adminAuth, getAdminDashboardStats);
router.get("/dashboard-chart", adminAuth, getDownloadsChart);
router.get("/dashboard-platforms", adminAuth, getPlatformStats);

module.exports = router;
