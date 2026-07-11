// routes/adminDashboardRoutes.js
const express = require("express");
const {
  getAdminDashboardStats,
} = require("../controllers/adminDashboardController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/dashboard-stats", adminAuth, getAdminDashboardStats);

module.exports = router;
