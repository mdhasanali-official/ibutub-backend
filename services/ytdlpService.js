//services/ytdlpService.js
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCookiesPath } = require("../utils/cookiesSetup");

const YTDLP_BIN = "yt-dlp";
const FILESIZE_LOOKUP_LIMIT = 6;
const FILESIZE_TIMEOUT_MS = 2000;

const YOUTUBE_CLIENTS = ["android", "ios", "web", "tv"];

const getProxyUrl = () => {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;

  if (!host || !port || !username || !password) return null;
  return `http://${username}:${password}@${host}:${port}`;
};

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

const withProxy = (args) => {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    return ["--proxy", proxyUrl, ...args];
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

const runYtdlpProcess = (args) => {
  return new Promise((resolve, reject) => {
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
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error("Failed to parse yt-dlp output"));
      }
    });

    proc.on("error", (err) => reject(err));
  });
};

const runYtdlpJson = async (url) => {
  const platform = detectPlatform(url);
  const baseArgs = withProxy(
    withCookies([
      "-j",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--socket-timeout",
      "10",
    ]),
  );

  if (platform !== "youtube") {
    try {
      return await runYtdlpProcess([...baseArgs, url]);
    } catch (err) {
      console.error(`yt-dlp [${platform}] failed: ${err.message}`);
      throw err;
    }
  }

  let lastError = null;
  for (const client of YOUTUBE_CLIENTS) {
    try {
      const args = [
        ...baseArgs,
        "--extractor-args",
        `youtube:player_client=${client}`,
        url,
      ];
      return await runYtdlpProcess(args);
    } catch (err) {
      lastError = err;
      console.error(`yt-dlp [youtube:${client}] failed: ${err.message}`);
    }
  }
  throw lastError || new Error("yt-dlp extraction failed");
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

const runStreamProcess = (
  url,
  formatSelector,
  outputTemplate,
  extraArgs,
  useProxy,
) => {
  const baseArgs = [
    "-f",
    formatSelector,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    "--concurrent-fragments",
    "4",
    ...extraArgs,
    "-o",
    outputTemplate,
    url,
  ];

  const args = useProxy
    ? withProxy(withCookies(baseArgs))
    : withCookies(baseArgs);

  return spawn(YTDLP_BIN, args);
};

const streamDownload = (url, formatId, res, filename, resolution, onFinish) => {
  const platform = detectPlatform(url);
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

  const isAudioOnly =
    String(resolution || "")
      .toLowerCase()
      .includes("audio") || String(formatId).startsWith("a-");

  const formatSelector = buildFormatSelector(formatId, resolution, isAudioOnly);

  const clientQueue = platform === "youtube" ? [...YOUTUBE_CLIENTS] : [null];

  let finished = false;
  let usedProxyFallback = false;
  const notifyFinish = (success) => {
    if (finished) return;
    finished = true;
    if (onFinish) onFinish(success);
  };

  const tryClient = (useProxy) => {
    const client = clientQueue.length > 0 ? clientQueue[0] : null;
    const extraArgs =
      client !== undefined && client !== null
        ? ["--extractor-args", `youtube:player_client=${client}`]
        : [];

    const proc = runStreamProcess(
      url,
      formatSelector,
      outputTemplate,
      extraArgs,
      useProxy,
    );
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("error", (err) => {
      console.error(`yt-dlp [${platform}] stream spawn error: ${err.message}`);
      handleFailure();
    });

    const handleFailure = () => {
      if (!usedProxyFallback && getProxyUrl()) {
        usedProxyFallback = true;
        return tryClient(true);
      }
      if (clientQueue.length > 1) {
        clientQueue.shift();
        usedProxyFallback = false;
        return tryClient(false);
      }
      notifyFinish(false);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed. Please try again." });
      }
    };

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`yt-dlp [${platform}] stream exited with code ${code}`);
        console.error(`yt-dlp [${platform}] stderr: ${stderr}`);
        return handleFailure();
      }

      const dir = os.tmpdir();
      const matched = fs.readdirSync(dir).find((f) => f.startsWith(tempId));
      const outputFile = matched ? path.join(dir, matched) : null;

      if (!outputFile || !fs.existsSync(outputFile)) {
        return handleFailure();
      }

      notifyFinish(true);

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
  };

  tryClient(false);
};

module.exports = { detectPlatform, extractInfo, streamDownload };
