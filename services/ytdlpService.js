const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCookiesPath } = require("../utils/cookiesSetup");
const { setFormats, getFormats } = require("./formatCache");
const { extractThreadsInfo } = require("./threadsService");

const YTDLP_BIN = "yt-dlp";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
  if (url.includes("threads.net") || url.includes("threads.com"))
    return "threads";
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
  if (lower.includes("8k") || lower.includes("4320")) return 4320;
  if (lower.includes("4k") || lower.includes("2160")) return 2160;
  if (lower.includes("2k") || lower.includes("1440")) return 1440;
  const cross = lower.match(/\d+\s*x\s*(\d+)/);
  if (cross) return parseInt(cross[1], 10);
  const p = lower.match(/(\d{3,4})p/);
  if (p) return parseInt(p[1], 10);
  const pAny = lower.match(/(\d+)p/);
  if (pAny) return parseInt(pAny[1], 10);
  const plain = lower.match(/(\d{3,4})/);
  if (plain) return parseInt(plain[1], 10);
  return null;
};

const buildFormatSelector = (formatId, resolution, isAudioOnly) => {
  if (isAudioOnly) {
    if (formatId && formatId !== "audio_mp3" && !formatId.startsWith("photo-")) {
      return `${formatId}/bestaudio/best`;
    }
    return "bestaudio/best";
  }
  const height = parseHeight(resolution);
  if (height) {
    if (formatId && !formatId.startsWith("photo-")) {
      return [
        `${formatId}+bestaudio`,
        `${formatId}`,
        `bestvideo[height<=${height}]+bestaudio`,
        `bestvideo[height<=?${height}]+bestaudio`,
        `best[height<=${height}]`,
        "bestvideo+bestaudio",
        "best",
      ].join("/");
    }
    return [
      `bestvideo[height<=${height}]+bestaudio`,
      `bestvideo[height<=?${height}]+bestaudio`,
      `best[height<=${height}]`,
      "bestvideo+bestaudio",
      "best",
    ].join("/");
  }
  if (formatId && !formatId.startsWith("photo-")) {
    return `${formatId}+bestaudio/${formatId}/bestvideo+bestaudio/best`;
  }
  return "bestvideo+bestaudio/best";
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
  const commonArgs = [
    "-j",
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    "--socket-timeout",
    "15",
    "--user-agent",
    USER_AGENT,
  ];

  if (platform === "youtube") {
    try {
      const cookieArgs = withCookies([...commonArgs, url]);
      const json = await runYtdlpProcess(cookieArgs);
      if (json && (json.formats || []).length > 2) {
        return json;
      }
    } catch (err) {
      console.warn(`Primary youtube extraction with cookies retry: ${err.message}`);
    }

    try {
      return await runYtdlpProcess([...commonArgs, url]);
    } catch (err) {
    }

    const fallbackClients = ["android_vr", "web_creator", "mweb", "android", "tv_embedded"];
    for (const client of fallbackClients) {
      try {
        const clientArgs = withCookies([
          ...commonArgs,
          "--extractor-args",
          `youtube:player_client=${client}`,
          url,
        ]);
        const res = await runYtdlpProcess(clientArgs);
        if (res && (res.formats || []).length > 2) {
          return res;
        }
      } catch (cErr) {
      }
    }

    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      try {
        const proxyArgs = withProxy(withCookies([...commonArgs, url]));
        return await runYtdlpProcess(proxyArgs);
      } catch (err) {
      }
    }

    throw new Error("Failed to extract YouTube video. Please check URL.");
  }

  try {
    return await runYtdlpProcess([...commonArgs, url]);
  } catch (err) {
    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      try {
        const proxyArgs = withProxy(withCookies([...commonArgs, url]));
        return await runYtdlpProcess(proxyArgs);
      } catch (proxyErr) {
      }
    }
    throw err;
  }
};

const extractInfo = async (url) => {
  const platform = detectPlatform(url);

  if (platform === "threads") {
    try {
      return await extractThreadsInfo(url);
    } catch (threadsErr) {
      console.warn(`Threads extraction failed: ${threadsErr.message}`);
      throw threadsErr;
    }
  }

  const raw = await runYtdlpJson(url);

  const rawFormats = (raw.formats || []).filter(
    (f) => f.vcodec !== "none" || f.acodec !== "none",
  );

  if (rawFormats.length === 0) {
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    if (entries.length > 0) {
      const photoFormats = entries
        .map((entry, idx) => {
          const bestImg =
            entry.url ||
            (entry.thumbnails &&
              entry.thumbnails[entry.thumbnails.length - 1]?.url) ||
            entry.thumbnail;
          return {
            format_id: `photo-${idx + 1}`,
            ext: "jpg",
            resolution: `Photo ${idx + 1}`,
            hasVideo: false,
            hasAudio: false,
            isImage: true,
            filesize: null,
            note: `HD Photo ${idx + 1}`,
            abr: 0,
            _sourceUrl: bestImg,
          };
        })
        .filter((f) => f._sourceUrl);

      if (photoFormats.length > 0) {
        setFormats(
          url,
          photoFormats.map((f) => ({
            format_id: f.format_id,
            ext: f.ext,
            hasVideo: false,
            hasAudio: false,
            isImage: true,
            sourceUrl: f._sourceUrl,
          })),
        );

        const cleanFormats = photoFormats.map(
          ({ _sourceUrl, abr, ...rest }) => rest,
        );

        return {
          platform,
          title: raw.title || "Photo Album",
          thumbnail: photoFormats[0]?._sourceUrl || raw.thumbnail || null,
          duration: null,
          uploader: raw.uploader || null,
          formats: cleanFormats,
        };
      }
    }

    const singleImg =
      (raw.thumbnails && raw.thumbnails[raw.thumbnails.length - 1]?.url) ||
      raw.thumbnail ||
      raw.url;

    if (singleImg) {
      const photoFormat = {
        format_id: "photo-1",
        ext: "jpg",
        resolution: "HD Photo",
        hasVideo: false,
        hasAudio: false,
        isImage: true,
        filesize: null,
        note: "HD Photo",
        abr: 0,
        _sourceUrl: singleImg,
      };

      setFormats(url, [
        {
          format_id: photoFormat.format_id,
          ext: photoFormat.ext,
          hasVideo: false,
          hasAudio: false,
          isImage: true,
          sourceUrl: photoFormat._sourceUrl,
        },
      ]);

      return {
        platform,
        title: raw.title || "Photo Post",
        thumbnail: singleImg,
        duration: null,
        uploader: raw.uploader || null,
        formats: [
          {
            format_id: photoFormat.format_id,
            ext: photoFormat.ext,
            resolution: photoFormat.resolution,
            hasVideo: false,
            hasAudio: false,
            isImage: true,
            filesize: null,
            note: photoFormat.note,
          },
        ],
      };
    }
  }

  setFormats(
    url,
    rawFormats.map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      hasVideo: f.vcodec !== "none",
      hasAudio: f.acodec !== "none",
      abr: f.abr || 0,
      sourceUrl: f.url,
    })),
  );

  const formatsMap = new Map();
  const audioFormats = [];

  for (const f of rawFormats) {
    if (f.vcodec !== "none" && f.height) {
      const h = f.height;
      const existing = formatsMap.get(h);
      if (!existing || (!existing.filesize && f.filesize) || f.ext === "mp4" || (f.vcodec && f.vcodec.startsWith("avc"))) {
        formatsMap.set(h, f);
      }
    } else if (f.acodec !== "none" && f.vcodec === "none") {
      audioFormats.push(f);
    }
  }

  const sortedHeights = Array.from(formatsMap.keys()).sort((a, b) => b - a);
  const videoFormats = sortedHeights.map((h) => {
    const f = formatsMap.get(h);
    let note = `${h}p`;
    if (h >= 4320) note = "8K Ultra HD";
    else if (h >= 2160) note = "4K Ultra HD";
    else if (h >= 1440) note = "2K Quad HD";
    else if (h === 1080) note = "1080p Full HD";
    else if (h === 720) note = "720p HD";
    else if (h === 480) note = "480p SD";
    else if (h === 360) note = "360p";
    else if (h === 240) note = "240p";
    else if (h === 144) note = "144p";

    const calcSize = f.filesize || f.filesize_approx || (f.tbr && raw.duration ? Math.round((f.tbr * 1024 * raw.duration) / 8) : null);

    return {
      format_id: f.format_id,
      ext: f.ext || "mp4",
      resolution: `${h}p`,
      hasVideo: true,
      hasAudio: f.acodec !== "none",
      filesize: calcSize,
      note: note,
      abr: f.abr || 0,
      height: h,
    };
  });

  const bestAudio = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
  const audioItem = {
    format_id: bestAudio ? bestAudio.format_id : "audio_mp3",
    ext: "mp3",
    resolution: "MP3 Audio",
    hasVideo: false,
    hasAudio: true,
    is_audio: true,
    filesize: bestAudio ? (bestAudio.filesize || bestAudio.filesize_approx || (bestAudio.abr && raw.duration ? Math.round((bestAudio.abr * 1024 * raw.duration) / 8) : null)) : null,
    note: "MP3 Audio",
    abr: bestAudio ? bestAudio.abr || 320 : 320,
  };

  const finalFormats = videoFormats.length > 0 ? [...videoFormats, audioItem] : rawFormats.map((f) => ({
    format_id: f.format_id,
    ext: f.ext,
    resolution: f.resolution || (f.height ? `${f.height}p` : "video"),
    hasVideo: f.vcodec !== "none",
    hasAudio: f.acodec !== "none",
    filesize: f.filesize || f.filesize_approx || null,
    note: f.format_note || `${f.height || "" }p`,
    abr: f.abr || 0,
  }));

  return {
    platform,
    title: raw.title || "Untitled",
    thumbnail: raw.thumbnail || null,
    duration: raw.duration || null,
    uploader: raw.uploader || null,
    formats: finalFormats,
  };
};

const fetchToResponse = (
  url,
  res,
  filename,
  ext,
  onFinish,
  redirectsLeft = 5,
) => {
  https
    .get(url, { headers: { "User-Agent": USER_AGENT } }, (upstream) => {
      if (
        [301, 302, 303, 307, 308].includes(upstream.statusCode) &&
        upstream.headers.location &&
        redirectsLeft > 0
      ) {
        upstream.resume();
        fetchToResponse(
          upstream.headers.location,
          res,
          filename,
          ext,
          onFinish,
          redirectsLeft - 1,
        );
        return;
      }

      if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
        console.error(
          `Direct CDN fetch failed: status=${upstream.statusCode} url=${url.slice(0, 100)}`,
        );
        onFinish(false);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ message: "Download failed. Please try again." });
        }
        return;
      }

      if (upstream.headers["content-length"]) {
        res.setHeader("Content-Length", upstream.headers["content-length"]);
      }
      if (upstream.headers["content-type"]) {
        res.setHeader("Content-Type", upstream.headers["content-type"]);
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.${ext}"`,
      );
      res.setHeader("Accept-Ranges", "bytes");

      upstream.pipe(res);
      upstream.on("end", () => onFinish(true));
      upstream.on("error", () => onFinish(false));
    })
    .on("error", () => {
      onFinish(false);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed. Please try again." });
      }
    });
};

const runStreamProcess = (url, formatSelector, outputTemplate, isAudioOnly) => {
  const platform = detectPlatform(url);
  const baseArgs = [
    "-f",
    formatSelector,
    ...(isAudioOnly ? ["-x", "--audio-format", "mp3"] : ["--merge-output-format", "mp4"]),
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    ...(platform === "youtube" ? ["--extractor-args", "youtube:player_client=android,web,mweb,ios,android_vr"] : []),
    "--concurrent-fragments",
    "8",
    "--user-agent",
    USER_AGENT,
    "-o",
    outputTemplate,
    url,
  ];

  return spawn(YTDLP_BIN, withCookies(baseArgs));
};

const streamDownloadOther = (
  url,
  formatId,
  res,
  filename,
  resolution,
  notifyFinish,
) => {
  const platform = detectPlatform(url);
  const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

  const isAudioOnly =
    String(resolution || "")
      .toLowerCase()
      .includes("audio") ||
    String(formatId).startsWith("a-") ||
    String(formatId) === "audio_mp3" ||
    String(formatId) === "251" ||
    String(formatId) === "140";

  const formatSelector = buildFormatSelector(formatId, resolution, isAudioOnly);
  const proc = runStreamProcess(url, formatSelector, outputTemplate, isAudioOnly);
  let stderr = "";

  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  proc.on("error", (err) => {
    console.error(`yt-dlp [${platform}] stream spawn error: ${err.message}`);
    notifyFinish(false);
    if (!res.headersSent) {
      res.status(500).json({ message: "Download failed. Please try again." });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`yt-dlp [${platform}] stream exited with code ${code}`);
      console.error(`yt-dlp [${platform}] stderr: ${stderr}`);
      notifyFinish(false);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed. Please try again." });
      }
      return;
    }

    const dir = os.tmpdir();
    const matched = fs.readdirSync(dir).find((f) => f.startsWith(tempId));
    const outputFile = matched ? path.join(dir, matched) : null;

    if (!outputFile || !fs.existsSync(outputFile)) {
      notifyFinish(false);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed. Please try again." });
      }
      return;
    }

    notifyFinish(true);

    const ext = path.extname(outputFile).replace(".", "") || (isAudioOnly ? "mp3" : "mp4");
    const stats = fs.statSync(outputFile);
    res.setHeader("Content-Length", stats.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.${ext}"`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");

    const readStream = fs.createReadStream(outputFile);
    readStream.pipe(res);

    const cleanup = () => fs.unlink(outputFile, () => {});
    readStream.on("close", cleanup);
    readStream.on("error", cleanup);
  });
};

const streamDownload = (url, formatId, res, filename, resolution, onFinish) => {
  let finished = false;
  const notifyFinish = (success) => {
    if (finished) return;
    finished = true;
    if (onFinish) onFinish(success);
  };

  const cachedFormats = getFormats(url);
  const chosenFormat = cachedFormats?.find((f) => f.format_id === formatId) || cachedFormats?.[0];
  if (chosenFormat?.isImage && chosenFormat?.sourceUrl) {
    const ext = chosenFormat.ext || "jpg";
    fetchToResponse(chosenFormat.sourceUrl, res, filename, ext, notifyFinish);
    return;
  }

  streamDownloadOther(url, formatId, res, filename, resolution, notifyFinish);
};

module.exports = { detectPlatform, extractInfo, streamDownload };