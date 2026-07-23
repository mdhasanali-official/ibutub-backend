//controllers/downloadController.js
const { extractInfo, streamDownload } = require("../services/ytdlpService");
const {
  extractVideoId,
  getYoutubeDetails,
} = require("../services/rapidApiService");
const DownloadHistory = require("../models/DownloadHistory");

const SUPPORTED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.watch",
];

const sanitizeFilename = (name) => {
  if (!name) return "video";
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim();
  return cleaned.slice(0, 80) || "video";
};

const isYoutubeUrl = (url) =>
  url.includes("youtube.com") || url.includes("youtu.be");

exports.extractVideo = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) return res.status(400).json({ message: "URL is required" });

    const isSupported = SUPPORTED_HOSTS.some((host) => url.includes(host));
    if (!isSupported)
      return res.status(400).json({ message: "Unsupported platform" });

    let info;

    if (isYoutubeUrl(url)) {
      const videoId = extractVideoId(url);
      if (!videoId)
        return res.status(400).json({ message: "Invalid YouTube URL" });

      const data = await getYoutubeDetails(videoId);
      info = {
        platform: "youtube",
        title: data.title,
        thumbnail: data.thumbnail,
        duration: data.duration,
        uploader: data.uploader,
        formats: data.formats,
      };

      req.app.locals.formatUrlCache =
        req.app.locals.formatUrlCache || new Map();
      data.formats.forEach((f) => {
        req.app.locals.formatUrlCache.set(`${videoId}:${f.format_id}`, {
          url: f.url,
          ext: f.ext,
          expiresAt: Date.now() + 1000 * 60 * 30,
        });
      });
    } else {
      info = await extractInfo(url);
    }

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
    const { url, format_id, filename } = req.query;

    if (!url || !format_id)
      return res
        .status(400)
        .json({ message: "url and format_id are required" });

    const safeName = sanitizeFilename(filename);

    if (isYoutubeUrl(url)) {
      const videoId = extractVideoId(url);
      if (!videoId)
        return res.status(400).json({ message: "Invalid YouTube URL" });

      const cache = req.app.locals.formatUrlCache;
      const cached = cache?.get(`${videoId}:${format_id}`);

      let directUrl = cached?.url;
      let ext = cached?.ext || "mp4";

      if (!cached || cached.expiresAt < Date.now()) {
        const data = await getYoutubeDetails(videoId);
        const match = data.formats.find((f) => f.format_id === format_id);
        if (!match)
          return res.status(404).json({ message: "Format not found" });
        directUrl = match.url;
        ext = match.ext;
      }

      const upstream = await fetch(directUrl);
      if (!upstream.ok || !upstream.body) {
        console.error(
          `Upstream fetch failed with status ${upstream.status} for ${directUrl}`,
        );
        return res.status(502).json({ message: "Failed to fetch file" });
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}.${ext}"`,
      );
      res.setHeader("Content-Type", "application/octet-stream");

      const { Readable } = require("stream");
      Readable.fromWeb(upstream.body).pipe(res);

      DownloadHistory.findOneAndUpdate(
        { url },
        { status: "downloaded" },
        { sort: { createdAt: -1 } },
      ).catch(() => {});
      return;
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.mp4"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");

    streamDownload(url, format_id, res);

    DownloadHistory.findOneAndUpdate(
      { url },
      { status: "downloaded" },
      { sort: { createdAt: -1 } },
    ).catch(() => {});
  } catch (error) {
    return res.status(500).json({
      message: "Failed to stream video",
      error: error.message,
    });
  }
};
