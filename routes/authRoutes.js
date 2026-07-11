//routes/authRoutes.js
const express = require("express");
const {
  register,
  login,
  getProfile,
  updateProfile,
} = require("../controllers/authController");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", userAuth, getProfile);
router.put("/profile/update", userAuth, updateProfile);

module.exports = router;
