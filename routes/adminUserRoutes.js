// routes/adminUserRoutes.js
const express = require("express");
const {
  getUsers,
  getSingleUser,
  updateUser,
  toggleSuspendUser,
} = require("../controllers/adminUserController");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

router.get("/users", adminAuth, getUsers);
router.get("/users/:id", adminAuth, getSingleUser);
router.put("/users/:id", adminAuth, updateUser);
router.put("/users/:id/suspend", adminAuth, toggleSuspendUser);

module.exports = router;
