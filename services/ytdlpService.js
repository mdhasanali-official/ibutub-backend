//services/ytdlpService.js
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCookiesPath } = require("../utils/cookiesSetup");

const YTDLP_BIN = "yt-dlp";

const detectPlatform = (url) => {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return "facebook";
  return "unknown";
};

const withCookies = (args) => {
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    return ["--cookies", cookiesPath, ...args];
  }
  return args;
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
    const timeout = setTimeout(() => controller.abort(), 5000);
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

  const formats = await Promise.all(
    rawFormats.map(async (f) => {
      let filesize = f.filesize || f.filesize_approx || null;
      if (!filesize) {
        filesize = await fetchFilesize(f.url);
      }
      return {
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || (f.height ? `${f.height}p` : "audio"),
        hasVideo: f.vcodec !== "none",
        hasAudio: f.acodec !== "none",
        filesize,
        note: f.format_note || "",
      };
    }),
  );

  return {
    platform,
    title: raw.title || "Untitled",
    thumbnail: raw.thumbnail || null,
    duration: raw.duration || null,
    uploader: raw.uploader || null,
    formats,
  };
};

const streamDownload = (url, formatId, res, filename) => {
  const platform = detectPlatform(url);
  const extraArgs =
    platform === "youtube"
      ? ["--extractor-args", "youtube:player_client=android"]
      : [];
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

  const args = withCookies([
    "-f",
    `${formatId}+bestaudio/${formatId}`,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-warnings",
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
      res.status(500).json({ message: "Download stream failed" });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`yt-dlp [${platform}] stream exited with code ${code}`);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed", error: stderr });
      }
      return;
    }

    const dir = os.tmpdir();
    const matched = fs.readdirSync(dir).find((f) => f.startsWith(tempId));
    const outputFile = matched ? path.join(dir, matched) : null;

    if (!outputFile || !fs.existsSync(outputFile)) {
      if (!res.headersSent) {
        res.status(500).json({ message: "Downloaded file not found" });
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
