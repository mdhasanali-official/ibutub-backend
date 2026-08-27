//routes/settingsRoutes.js
const express = require("express");
const {
  getPublicSettings,
  getAdminSettings,
  updateSettings,
  uploadBranding,
  regenerateSitemap,
  publishRobots,
  getSitemapXml,
  getRobotsTxt,
} = require("../controllers/settingsController");
const adminAuth = require("../middleware/adminAuth");
const { brandingUpload } = require("../middleware/upload");

const router = express.Router();

router.get("/settings/public", getPublicSettings);

router.get("/admin/settings", adminAuth, getAdminSettings);
router.put("/admin/settings", adminAuth, updateSettings);
router.post(
  "/admin/settings/branding/:type",
  adminAuth,
  brandingUpload.single("image"),
  uploadBranding,
);
router.post("/admin/settings/sitemap/regenerate", adminAuth, regenerateSitemap);
router.post("/admin/settings/robots/publish", adminAuth, publishRobots);

module.exports = { settingsRouter: router, getSitemapXml, getRobotsTxt };
