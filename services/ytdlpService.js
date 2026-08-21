//services/ytdlpService.js
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCookiesPath } = require("../utils/cookiesSetup");

const YTDLP_BIN = "yt-dlp";
const FILESIZE_LOOKUP_LIMIT = 6;
const FILESIZE_TIMEOUT_MS = 2000;

const detectPlatform = (url) => {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return "facebook";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("pinterest.com") || url.includes("pin.it"))
    return "pinterest";
  if (url.includes("threads.net")) return "threads";
  if (url.includes("linkedin.com")) return "linkedin";
  return "unknown";
};

const withCookies = (args) => {
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    return ["--cookies", cookiesPath, ...args];
  }
  return args;
};

const parseHeight = (resolution) => {
  if (!resolution) return null;
  const lower = String(resolution).toLowerCase();
  if (lower.includes("audio")) return null;
  const cross = lower.match(/\d+\s*x\s*(\d+)/);
  if (cross) return parseInt(cross[1], 10);
  const p = lower.match(/(\d+)p/);
  if (p) return parseInt(p[1], 10);
  const plain = lower.match(/(\d+)/);
  if (plain) return parseInt(plain[1], 10);
  return null;
};

const buildFormatSelector = (formatId, resolution, isAudioOnly) => {
  if (isAudioOnly) {
    return `${formatId}/bestaudio/best`;
  }
  const height = parseHeight(resolution);
  if (height) {
    return [
      `${formatId}+bestaudio`,
      `${formatId}`,
      `bestvideo[height<=${height}]+bestaudio`,
      `best[height<=${height}]`,
      "bestvideo+bestaudio",
      "best",
    ].join("/");
  }
  return `${formatId}+bestaudio/${formatId}/bestvideo+bestaudio/best`;
};

const runYtdlpJson = (url) => {
  return new Promise((resolve, reject) => {
    const platform = detectPlatform(url);
    const extraArgs =
      platform === "youtube"
        ? ["--extractor-args", "youtube:player_client=android"]
        : [];
    const args = withCookies([
      "-j",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--no-call-home",
      "--socket-timeout",
      "10",
      ...extraArgs,
      url,
    ]);
    const proc = spawn(YTDLP_BIN, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`yt-dlp [${platform}] exited with code ${code}`);
        console.error(`yt-dlp [${platform}] url: ${url}`);
        console.error(`yt-dlp [${platform}] stderr: ${stderr}`);
        return reject(new Error(stderr || "yt-dlp extraction failed"));
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (err) {
        console.error(`yt-dlp JSON parse failed: ${err.message}`);
        console.error(`yt-dlp raw stdout: ${stdout.slice(0, 500)}`);
        reject(new Error("Failed to parse yt-dlp output"));
      }
    });

    proc.on("error", (err) => {
      console.error(`yt-dlp spawn error: ${err.message}`);
      reject(err);
    });
  });
};

const fetchFilesize = async (url) => {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FILESIZE_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const length = response.headers.get("content-length");
    return length ? parseInt(length, 10) : null;
  } catch {
    return null;
  }
};

const extractInfo = async (url) => {
  const platform = detectPlatform(url);
  const raw = await runYtdlpJson(url);

  const rawFormats = (raw.formats || []).filter(
    (f) => f.vcodec !== "none" || f.acodec !== "none",
  );

  const formats = rawFormats.map((f) => ({
    format_id: f.format_id,
    ext: f.ext,
    resolution: f.resolution || (f.height ? `${f.height}p` : "audio"),
    hasVideo: f.vcodec !== "none",
    hasAudio: f.acodec !== "none",
    filesize: f.filesize || f.filesize_approx || null,
    note: f.format_note || "",
    _sourceUrl: f.url,
  }));

  const missing = formats
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => !f.filesize && f._sourceUrl)
    .slice(0, FILESIZE_LOOKUP_LIMIT);

  await Promise.all(
    missing.map(async ({ f, index }) => {
      const size = await fetchFilesize(f._sourceUrl);
      if (size) formats[index].filesize = size;
    }),
  );

  const cleanFormats = formats.map(({ _sourceUrl, ...rest }) => rest);

  return {
    platform,
    title: raw.title || "Untitled",
    thumbnail: raw.thumbnail || null,
    duration: raw.duration || null,
    uploader: raw.uploader || null,
    formats: cleanFormats,
  };
};

const streamDownload = (url, formatId, res, filename, resolution) => {
  const platform = detectPlatform(url);
  const extraArgs =
    platform === "youtube"
      ? ["--extractor-args", "youtube:player_client=android"]
      : [];
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

  const isAudioOnly =
    String(resolution || "")
      .toLowerCase()
      .includes("audio") || String(formatId).startsWith("a-");

  const formatSelector = buildFormatSelector(formatId, resolution, isAudioOnly);

  const args = withCookies([
    "-f",
    formatSelector,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    "--no-call-home",
    "--concurrent-fragments",
    "4",
    ...extraArgs,
    "-o",
    outputTemplate,
    url,
  ]);

  const proc = spawn(YTDLP_BIN, args);
  let stderr = "";

  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
    console.error(`yt-dlp [${platform}] stream stderr: ${chunk}`);
  });

  proc.on("error", (err) => {
    console.error(`yt-dlp [${platform}] stream spawn error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ message: "Download failed. Please try again." });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`yt-dlp [${platform}] stream exited with code ${code}`);
      console.error(`yt-dlp [${platform}] selector used: ${formatSelector}`);
      if (!res.headersSent) {
        res.status(500).json({
          message:
            "This quality is no longer available. Please paste the link again and pick another option.",
        });
      }
      return;
    }

    const dir = os.tmpdir();
    const matched = fs.readdirSync(dir).find((f) => f.startsWith(tempId));
    const outputFile = matched ? path.join(dir, matched) : null;

    if (!outputFile || !fs.existsSync(outputFile)) {
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed. Please try again." });
      }
      return;
    }

    const ext = path.extname(outputFile).replace(".", "") || "mp4";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.${ext}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");

    const readStream = fs.createReadStream(outputFile);
    readStream.pipe(res);

    const cleanup = () => fs.unlink(outputFile, () => {});
    readStream.on("close", cleanup);
    readStream.on("error", cleanup);
  });

  return proc;
};

module.exports = { detectPlatform, extractInfo, streamDownload };
