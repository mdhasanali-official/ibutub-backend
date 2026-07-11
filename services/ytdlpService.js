//services/ytdlpService.js
const { spawn } = require("child_process");

const YTDLP_BIN = "yt-dlp";

const detectPlatform = (url) => {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return "facebook";
  return "unknown";
};

const runYtdlpJson = (url) => {
  return new Promise((resolve, reject) => {
    const args = ["-j", "--no-playlist", "--no-warnings", url];
    const proc = spawn(YTDLP_BIN, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || "yt-dlp extraction failed"));
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (err) {
        reject(new Error("Failed to parse yt-dlp output"));
      }
    });

    proc.on("error", (err) => reject(err));
  });
};

const extractInfo = async (url) => {
  const platform = detectPlatform(url);
  const raw = await runYtdlpJson(url);

  const formats = (raw.formats || [])
    .filter((f) => f.vcodec !== "none" || f.acodec !== "none")
    .map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || (f.height ? `${f.height}p` : "audio"),
      hasVideo: f.vcodec !== "none",
      hasAudio: f.acodec !== "none",
      filesize: f.filesize || f.filesize_approx || null,
      note: f.format_note || "",
    }));

  return {
    platform,
    title: raw.title || "Untitled",
    thumbnail: raw.thumbnail || null,
    duration: raw.duration || null,
    uploader: raw.uploader || null,
    formats,
  };
};

const streamDownload = (url, formatId, res) => {
  const args = [
    "-f",
    formatId,
    "--no-playlist",
    "--no-warnings",
    "-o",
    "-",
    url,
  ];

  const proc = spawn(YTDLP_BIN, args);

  proc.stdout.pipe(res);

  proc.stderr.on("data", () => {});

  proc.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ message: "Download stream failed" });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0 && !res.writableEnded) {
      res.end();
    }
  });

  return proc;
};

module.exports = { detectPlatform, extractInfo, streamDownload };
