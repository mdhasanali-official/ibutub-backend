//models/Visit.js
const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
  },
  { timestamps: true },
);

visitSchema.index({ ip: 1, createdAt: 1 });

module.exports = mongoose.model("Visit", visitSchema);
