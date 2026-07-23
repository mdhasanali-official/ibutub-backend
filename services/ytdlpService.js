//services/ytdlpService.js
const { spawn } = require("child_process");
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
        ? ["--extractor-args", "youtube:player_client=android,web"]
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
  const platform = detectPlatform(url);
  const extraArgs =
    platform === "youtube"
      ? ["--extractor-args", "youtube:player_client=android,web"]
      : [];
  const args = withCookies([
    "-f",
    `${formatId}+bestaudio/${formatId}`,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-warnings",
    ...extraArgs,
    "-o",
    "-",
    url,
  ]);

  const proc = spawn(YTDLP_BIN, args);

  proc.stdout.pipe(res);

  proc.stderr.on("data", (chunk) => {
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
    }
    if (code !== 0 && !res.writableEnded) {
      res.end();
    }
  });

  return proc;
}; 

module.exports = { detectPlatform, extractInfo, streamDownload };
