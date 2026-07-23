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

const mapRapidApiToInfo = (data) => {
  const videoItems = data.videos?.items || [];
  const audioItems = data.audios?.items || [];

  const videoFormats = videoItems.map((item, idx) => ({
    format_id: `v-${idx}`,
    ext: item.extension,
    resolution: item.quality || (item.height ? `${item.height}p` : "video"),
    hasVideo: true,
    hasAudio: !!item.hasAudio,
    filesize: item.size || null,
    note: item.quality || "",
  }));

  const audioFormats = audioItems.map((item, idx) => ({
    format_id: `a-${idx}`,
    ext: item.extension,
    resolution: "audio only",
    hasVideo: false,
    hasAudio: true,
    filesize: item.size || null,
    note: item.quality || item.extension,
  }));

  const bestThumbnail =
    data.thumbnails?.[data.thumbnails.length - 1]?.url || null;

  return {
    platform: "youtube",
    title: data.title || "Untitled",
    thumbnail: bestThumbnail,
    duration: data.lengthSeconds || null,
    uploader: data.channel?.name || null,
    formats: [...videoFormats, ...audioFormats],
  };
};

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
      info = mapRapidApiToInfo(data);
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

      const data = await getYoutubeDetails(videoId);
      const [type, idxStr] = format_id.split("-");
      const idx = parseInt(idxStr, 10);
      const items = type === "a" ? data.audios?.items : data.videos?.items;
      const item = items?.[idx];

      if (!item || !item.url)
        return res.status(404).json({ message: "Format not found" });

      const upstream = await fetch(item.url);
      if (!upstream.ok || !upstream.body)
        return res.status(502).json({ message: "Failed to fetch file" });

      const ext = item.extension || "mp4";
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
