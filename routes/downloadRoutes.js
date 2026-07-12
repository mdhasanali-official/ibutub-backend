//routes/downloadRoutes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  extractVideo,
  streamVideo,
} = require("../controllers/downloadController");

const router = express.Router();

const extractLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { message: "Too many requests, please try again shortly" },
});

router.post("/extract", extractLimiter, extractVideo);
router.get("/stream", streamVideo);

module.exports = router;
