//routes/trackRoutes.js
const express = require("express");
const { trackVisit } = require("../controllers/trackController");

const router = express.Router();

router.post("/visit", trackVisit);

module.exports = router;
