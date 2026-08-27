//controllers/trackController.js
const Visit = require("../models/Visit");

exports.trackVisit = async (req, res) => {
  try {
    const ip = req.ip;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await Visit.findOne({
      ip,
      createdAt: { $gte: startOfDay },
    });

    if (existing) {
      return res.status(200).json({ message: "Visit already tracked today" });
    }

    await Visit.create({ ip });

    return res.status(201).json({ message: "Visit tracked successfully" });
  } catch {
    return res.status(500).json({ message: "Failed to track visit" });
  }
};
