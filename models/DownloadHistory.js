//models/DownloadHistory.js
const mongoose = require("mongoose");

const downloadHistorySchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    platform: { type: String, required: true },
    title: { type: String },
    ip: { type: String },
    status: {
      type: String,
      enum: ["extracted", "downloaded", "failed"],
      default: "extracted",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DownloadHistory", downloadHistorySchema);
