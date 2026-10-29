const { extractInfo, streamDownload, detectPlatform } = require("../services/ytdlpService");
const {
  isRapidApiConfigured,
  extractInfoRapidApi,
} = require("../services/rapidApiService");
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
  "threads.com",
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

    const cleanUrl = String(url).toLowerCase().trim();
    const isSupported = SUPPORTED_HOSTS.some((host) =>
      cleanUrl.includes(host.toLowerCase()),
    );
    if (!isSupported)
      return res.status(400).json({ message: "Unsupported platform" });

    let info;
    try {
      info = await extractInfo(url);
    } catch (firstErr) {
      try {
        info = await extractInfo(url);
      } catch (secondErr) {
        if (isRapidApiConfigured()) {
          console.warn(
            "yt-dlp extraction failed, attempting RapidAPI fallback:",
            secondErr.message,
          );
          info = await extractInfoRapidApi(url, detectPlatform(url));
        } else {
          throw secondErr;
        }
      }
    }

    if ((!info || !info.formats || info.formats.length === 0) && isRapidApiConfigured()) {
      try {
        info = await extractInfoRapidApi(url, detectPlatform(url));
      } catch (e) {
        console.warn("RapidAPI fallback after empty formats failed:", e.message);
      }
    }

    await DownloadHistory.create({
      url,
      platform: info.platform,
      title: info.title,
      ip: req.ip,
      status: "extracted",
    }).catch(() => {});

    return res.status(200).json({
      message: "Video info fetched successfully",
      data: info,
    });
  } catch (error) {
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
