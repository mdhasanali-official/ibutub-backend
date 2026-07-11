//routes/adminAuthRoutes.js
const express = require("express");
const {
  adminLogin,
  getAdminProfile,
  updateAdminProfile,
  uploadAdminProfileImage,
} = require("../controllers/adminAuthController");
const adminAuth = require("../middleware/adminAuth");
const { upload } = require("../middleware/upload");
const router = express.Router();

router.post("/login", adminLogin);
router.get("/profile", adminAuth, getAdminProfile);
router.put("/profile/update", adminAuth, updateAdminProfile);
router.post(
  "/profile/upload-image",
  adminAuth,
  upload.single("profileImage"),
  uploadAdminProfileImage,
);

module.exports = router;
