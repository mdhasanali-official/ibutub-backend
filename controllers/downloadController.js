//controllers/downloadController.js
const { extractInfo, streamDownload } = require("../services/ytdlpService");
const DownloadHistory = require("../models/DownloadHistory");

const SUPPORTED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.watch",
  "twitter.com",
  "x.com",
  "reddit.com",
  "pinterest.com",
  "pin.it",
  "threads.net",
  "linkedin.com",
];

const sanitizeFilename = (name) => {
  if (!name) return "video";
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim();
  return cleaned.slice(0, 80) || "video";
};

exports.extractVideo = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) return res.status(400).json({ message: "URL is required" });

    const isSupported = SUPPORTED_HOSTS.some((host) => url.includes(host));
    if (!isSupported)
      return res.status(400).json({ message: "Unsupported platform" });

    const info = await extractInfo(url);

    await DownloadHistory.create({
      url,
      platform: info.platform,
      title: info.title,
      ip: req.ip,
      status: "extracted",
    });

    return res.status(200).json({
      message: "Video info fetched successfully",
      data: info,
    });
  } catch (error) {
    console.error(`extractVideo failed: ${error.message}`);
    return res.status(500).json({
      message: "Failed to extract video info",
      error: error.message,
    });
  }
};

exports.streamVideo = async (req, res) => {
  try {
    const { url, format_id, filename, resolution } = req.query;

    if (!url || !format_id)
      return res
        .status(400)
        .json({ message: "url and format_id are required" });

    const safeName = sanitizeFilename(filename);

    streamDownload(url, format_id, res, safeName, resolution, (success) => {
      DownloadHistory.findOneAndUpdate(
        { url },
        { status: success ? "downloaded" : "failed" },
        { sort: { createdAt: -1 } },
      ).catch(() => {});
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to stream video",
      error: error.message,
    });
  }
};
