// // services/ytdlpService.js
// const { spawn } = require("child_process");
// const https = require("https");
// const fs = require("fs");
// const os = require("os");
// const path = require("path");
// const { getCookiesPath } = require("../utils/cookiesSetup");
// const { setFormats, getFormats } = require("./formatCache");

// const YTDLP_BIN = "yt-dlp";
// const FILESIZE_LOOKUP_LIMIT = 6;
// const FILESIZE_TIMEOUT_MS = 2000;

// const YOUTUBE_CLIENTS = ["android", "ios", "web", "tv"];

// const USER_AGENT =
//   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// const getProxyUrl = () => {
//   const host = process.env.PROXY_HOST;
//   const port = process.env.PROXY_PORT;
//   const username = process.env.PROXY_USERNAME;
//   const password = process.env.PROXY_PASSWORD;

//   if (!host || !port || !username || !password) return null;
//   return `http://${username}:${password}@${host}:${port}`;
// };

// const detectPlatform = (url) => {
//   if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
//   if (url.includes("tiktok.com")) return "tiktok";
//   if (url.includes("instagram.com")) return "instagram";
//   if (url.includes("facebook.com") || url.includes("fb.watch"))
//     return "facebook";
//   if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
//   if (url.includes("reddit.com")) return "reddit";
//   if (url.includes("pinterest.com") || url.includes("pin.it"))
//     return "pinterest";
//   if (url.includes("threads.net")) return "threads";
//   if (url.includes("linkedin.com")) return "linkedin";
//   return "unknown";
// };

// const withCookies = (args) => {
//   const cookiesPath = getCookiesPath();
//   if (cookiesPath) {
//     return ["--cookies", cookiesPath, ...args];
//   }
//   return args;
// };

// const withProxy = (args) => {
//   const proxyUrl = getProxyUrl();
//   if (proxyUrl) {
//     return ["--proxy", proxyUrl, ...args];
//   }
//   return args;
// };

// const parseHeight = (resolution) => {
//   if (!resolution) return null;
//   const lower = String(resolution).toLowerCase();
//   if (lower.includes("audio")) return null;
//   const cross = lower.match(/\d+\s*x\s*(\d+)/);
//   if (cross) return parseInt(cross[1], 10);
//   const p = lower.match(/(\d+)p/);
//   if (p) return parseInt(p[1], 10);
//   const plain = lower.match(/(\d+)/);
//   if (plain) return parseInt(plain[1], 10);
//   return null;
// };

// const buildFormatSelector = (formatId, resolution, isAudioOnly) => {
//   if (isAudioOnly) {
//     return `${formatId}/bestaudio/best`;
//   }
//   const height = parseHeight(resolution);
//   if (height) {
//     return [
//       `${formatId}+bestaudio`,
//       `${formatId}`,
//       `bestvideo[height<=${height}]+bestaudio`,
//       `best[height<=${height}]`,
//       "bestvideo+bestaudio",
//       "best",
//     ].join("/");
//   }
//   return `${formatId}+bestaudio/${formatId}/bestvideo+bestaudio/best`;
// };

// const runYtdlpProcess = (args) => {
//   return new Promise((resolve, reject) => {
//     const proc = spawn(YTDLP_BIN, args);
//     let stdout = "";
//     let stderr = "";

//     proc.stdout.on("data", (chunk) => (stdout += chunk));
//     proc.stderr.on("data", (chunk) => (stderr += chunk));

//     proc.on("close", (code) => {
//       if (code !== 0) {
//         return reject(new Error(stderr || "yt-dlp extraction failed"));
//       }
//       try {
//         resolve(JSON.parse(stdout));
//       } catch (err) {
//         reject(new Error("Failed to parse yt-dlp output"));
//       }
//     });

//     proc.on("error", (err) => reject(err));
//   });
// };

// const runYtdlpJson = async (url) => {
//   const platform = detectPlatform(url);
//   const baseArgs = withProxy(
//     withCookies([
//       "-j",
//       "--no-playlist",
//       "--no-warnings",
//       "--no-check-certificates",
//       "--socket-timeout",
//       "10",
//     ]),
//   );

//   if (platform !== "youtube") {
//     try {
//       return await runYtdlpProcess([...baseArgs, url]);
//     } catch (err) {
//       console.error(`yt-dlp [${platform}] failed: ${err.message}`);
//       throw err;
//     }
//   }

//   let lastError = null;
//   for (const client of YOUTUBE_CLIENTS) {
//     try {
//       const args = [
//         ...baseArgs,
//         "--extractor-args",
//         `youtube:player_client=${client}`,
//         url,
//       ];
//       return await runYtdlpProcess(args);
//     } catch (err) {
//       lastError = err;
//       console.error(`yt-dlp [youtube:${client}] failed: ${err.message}`);
//     }
//   }
//   throw lastError || new Error("yt-dlp extraction failed");
// };

// const fetchFilesize = async (url) => {
//   if (!url) return null;
//   try {
//     const controller = new AbortController();
//     const timeout = setTimeout(() => controller.abort(), FILESIZE_TIMEOUT_MS);
//     const response = await fetch(url, {
//       method: "HEAD",
//       signal: controller.signal,
//     });
//     clearTimeout(timeout);
//     const length = response.headers.get("content-length");
//     return length ? parseInt(length, 10) : null;
//   } catch {
//     return null;
//   }
// };

// const extractInfo = async (url) => {
//   const platform = detectPlatform(url);
//   const raw = await runYtdlpJson(url);

//   const rawFormats = (raw.formats || []).filter(
//     (f) => f.vcodec !== "none" || f.acodec !== "none",
//   );

//   const formats = rawFormats.map((f) => ({
//     format_id: f.format_id,
//     ext: f.ext,
//     resolution: f.resolution || (f.height ? `${f.height}p` : "audio"),
//     hasVideo: f.vcodec !== "none",
//     hasAudio: f.acodec !== "none",
//     filesize: f.filesize || f.filesize_approx || null,
//     note: f.format_note || "",
//     abr: f.abr || 0,
//     _sourceUrl: f.url,
//   }));

//   const missing = formats
//     .map((f, index) => ({ f, index }))
//     .filter(({ f }) => !f.filesize && f._sourceUrl)
//     .slice(0, FILESIZE_LOOKUP_LIMIT);

//   await Promise.all(
//     missing.map(async ({ f, index }) => {
//       const size = await fetchFilesize(f._sourceUrl);
//       if (size) formats[index].filesize = size;
//     }),
//   );

//   if (platform === "youtube") {
//     setFormats(
//       url,
//       formats.map((f) => ({
//         format_id: f.format_id,
//         ext: f.ext,
//         hasVideo: f.hasVideo,
//         hasAudio: f.hasAudio,
//         abr: f.abr,
//         sourceUrl: f._sourceUrl,
//       })),
//     );
//   }

//   const cleanFormats = formats.map(({ _sourceUrl, abr, ...rest }) => rest);

//   return {
//     platform,
//     title: raw.title || "Untitled",
//     thumbnail: raw.thumbnail || null,
//     duration: raw.duration || null,
//     uploader: raw.uploader || null,
//     formats: cleanFormats,
//   };
// };

// const resolveYoutubeDirectUrls = async (url, formatId, isAudioOnly) => {
//   let formats = getFormats(url);

//   if (!formats) {
//     const raw = await runYtdlpJson(url);
//     formats = (raw.formats || [])
//       .filter((f) => f.vcodec !== "none" || f.acodec !== "none")
//       .map((f) => ({
//         format_id: f.format_id,
//         ext: f.ext,
//         hasVideo: f.vcodec !== "none",
//         hasAudio: f.acodec !== "none",
//         abr: f.abr || 0,
//         sourceUrl: f.url,
//       }));
//     setFormats(url, formats);
//   }

//   const chosen = formats.find((f) => f.format_id === formatId);
//   if (!chosen || !chosen.sourceUrl) return null;

//   if (isAudioOnly || (chosen.hasAudio && chosen.hasVideo)) {
//     return { type: "single", url: chosen.sourceUrl, ext: chosen.ext || "mp4" };
//   }

//   const bestAudio = formats
//     .filter((f) => f.hasAudio && !f.hasVideo && f.sourceUrl)
//     .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

//   if (!bestAudio) {
//     return { type: "single", url: chosen.sourceUrl, ext: chosen.ext || "mp4" };
//   }

//   return {
//     type: "merge",
//     videoUrl: chosen.sourceUrl,
//     audioUrl: bestAudio.sourceUrl,
//   };
// };

// const fetchToResponse = (
//   url,
//   res,
//   filename,
//   ext,
//   onFinish,
//   redirectsLeft = 5,
// ) => {
//   https
//     .get(url, { headers: { "User-Agent": USER_AGENT } }, (upstream) => {
//       if (
//         [301, 302, 303, 307, 308].includes(upstream.statusCode) &&
//         upstream.headers.location &&
//         redirectsLeft > 0
//       ) {
//         upstream.resume();
//         fetchToResponse(
//           upstream.headers.location,
//           res,
//           filename,
//           ext,
//           onFinish,
//           redirectsLeft - 1,
//         );
//         return;
//       }

//       if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
//         onFinish(false);
//         if (!res.headersSent) {
//           res
//             .status(500)
//             .json({ message: "Download failed. Please try again." });
//         }
//         return;
//       }

//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename="${filename}.${ext}"`,
//       );
//       res.setHeader("Content-Type", "application/octet-stream");

//       upstream.pipe(res);
//       upstream.on("end", () => onFinish(true));
//       upstream.on("error", () => onFinish(false));
//     })
//     .on("error", () => {
//       onFinish(false);
//       if (!res.headersSent) {
//         res.status(500).json({ message: "Download failed. Please try again." });
//       }
//     });
// };

// const mergeToResponse = (videoUrl, audioUrl, res, filename, onFinish) => {
//   res.setHeader(
//     "Content-Disposition",
//     `attachment; filename="${filename}.mp4"`,
//   );
//   res.setHeader("Content-Type", "application/octet-stream");

//   const proc = spawn("ffmpeg", [
//     "-user_agent",
//     USER_AGENT,
//     "-reconnect",
//     "1",
//     "-reconnect_streamed",
//     "1",
//     "-reconnect_delay_max",
//     "5",
//     "-i",
//     videoUrl,
//     "-user_agent",
//     USER_AGENT,
//     "-reconnect",
//     "1",
//     "-reconnect_streamed",
//     "1",
//     "-reconnect_delay_max",
//     "5",
//     "-i",
//     audioUrl,
//     "-c:v",
//     "copy",
//     "-c:a",
//     "copy",
//     "-movflags",
//     "frag_keyframe+empty_moov",
//     "-f",
//     "mp4",
//     "pipe:1",
//   ]);

//   proc.stdout.pipe(res);

//   let stderr = "";
//   proc.stderr.on("data", (chunk) => {
//     stderr += chunk;
//   });

//   proc.on("error", () => {
//     onFinish(false);
//     if (!res.headersSent) {
//       res.status(500).json({ message: "Download failed. Please try again." });
//     }
//   });

//   proc.on("close", (code) => {
//     if (code !== 0) {
//       console.error(`ffmpeg merge failed: ${stderr}`);
//     }
//     onFinish(code === 0);
//   });
// };

// const runStreamProcess = (url, formatSelector, outputTemplate, extraArgs) => {
//   const baseArgs = [
//     "-f",
//     formatSelector,
//     "--merge-output-format",
//     "mp4",
//     "--no-playlist",
//     "--no-warnings",
//     "--no-check-certificates",
//     "--concurrent-fragments",
//     "4",
//     ...extraArgs,
//     "-o",
//     outputTemplate,
//     url,
//   ];

//   return spawn(YTDLP_BIN, withCookies(baseArgs));
// };

// const streamDownloadOther = (
//   url,
//   formatId,
//   res,
//   filename,
//   resolution,
//   notifyFinish,
// ) => {
//   const platform = detectPlatform(url);
//   const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
//   const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

//   const isAudioOnly =
//     String(resolution || "")
//       .toLowerCase()
//       .includes("audio") || String(formatId).startsWith("a-");

//   const formatSelector = buildFormatSelector(formatId, resolution, isAudioOnly);
//   const proc = runStreamProcess(url, formatSelector, outputTemplate, []);
//   let stderr = "";

//   proc.stderr.on("data", (chunk) => {
//     stderr += chunk;
//   });

//   proc.on("error", (err) => {
//     console.error(`yt-dlp [${platform}] stream spawn error: ${err.message}`);
//     notifyFinish(false);
//     if (!res.headersSent) {
//       res.status(500).json({ message: "Download failed. Please try again." });
//     }
//   });

//   proc.on("close", (code) => {
//     if (code !== 0) {
//       console.error(`yt-dlp [${platform}] stream exited with code ${code}`);
//       console.error(`yt-dlp [${platform}] stderr: ${stderr}`);
//       notifyFinish(false);
//       if (!res.headersSent) {
//         res.status(500).json({ message: "Download failed. Please try again." });
//       }
//       return;
//     }

//     const dir = os.tmpdir();
//     const matched = fs.readdirSync(dir).find((f) => f.startsWith(tempId));
//     const outputFile = matched ? path.join(dir, matched) : null;

//     if (!outputFile || !fs.existsSync(outputFile)) {
//       notifyFinish(false);
//       if (!res.headersSent) {
//         res.status(500).json({ message: "Download failed. Please try again." });
//       }
//       return;
//     }

//     notifyFinish(true);

//     const ext = path.extname(outputFile).replace(".", "") || "mp4";
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="${filename}.${ext}"`,
//     );
//     res.setHeader("Content-Type", "application/octet-stream");

//     const readStream = fs.createReadStream(outputFile);
//     readStream.pipe(res);

//     const cleanup = () => fs.unlink(outputFile, () => {});
//     readStream.on("close", cleanup);
//     readStream.on("error", cleanup);
//   });
// };

// const streamDownload = (url, formatId, res, filename, resolution, onFinish) => {
//   const platform = detectPlatform(url);

//   let finished = false;
//   const notifyFinish = (success) => {
//     if (finished) return;
//     finished = true;
//     if (onFinish) onFinish(success);
//   };

//   const isAudioOnly =
//     String(resolution || "")
//       .toLowerCase()
//       .includes("audio") || String(formatId).startsWith("a-");

//   if (platform === "youtube") {
//     resolveYoutubeDirectUrls(url, formatId, isAudioOnly)
//       .then((resolved) => {
//         if (!resolved) {
//           notifyFinish(false);
//           if (!res.headersSent) {
//             res
//               .status(500)
//               .json({ message: "Download failed. Please try again." });
//           }
//           return;
//         }

//         if (resolved.type === "merge") {
//           mergeToResponse(
//             resolved.videoUrl,
//             resolved.audioUrl,
//             res,
//             filename,
//             notifyFinish,
//           );
//         } else {
//           fetchToResponse(
//             resolved.url,
//             res,
//             filename,
//             resolved.ext,
//             notifyFinish,
//           );
//         }
//       })
//       .catch((error) => {
//         console.error(`youtube direct resolve failed: ${error.message}`);
//         notifyFinish(false);
//         if (!res.headersSent) {
//           res
//             .status(500)
//             .json({ message: "Download failed. Please try again." });
//         }
//       });
//     return;
//   }

//   streamDownloadOther(url, formatId, res, filename, resolution, notifyFinish);
// };

// module.exports = { detectPlatform, extractInfo, streamDownload };


// services/ytdlpService.js
const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCookiesPath } = require("../utils/cookiesSetup");
const { setFormats } = require("./formatCache");

const YTDLP_BIN = "yt-dlp";
const FILESIZE_LOOKUP_LIMIT = 6;
const FILESIZE_TIMEOUT_MS = 2000;

const YOUTUBE_CLIENTS = ["android", "ios", "web", "tv"];

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

const buildYoutubeAdaptiveSelector = (resolution, isAudioOnly) => {
  if (isAudioOnly) {
    return "bestaudio/best";
  }
  const height = parseHeight(resolution);
  if (height) {
    return [
      `bestvideo[height<=${height}]+bestaudio`,
      `bestvideo+bestaudio`,
      `best[height<=${height}]`,
      "best",
    ].join("/");
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

const runYtdlpJsonWithFormat = async (url, formatSelector) => {
  const baseArgs = withProxy(
    withCookies([
      "-f",
      formatSelector,
      "-j",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--socket-timeout",
      "10",
    ]),
  );

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
      console.error(
        `yt-dlp [youtube:${client}] format resolve failed: ${err.message}`,
      );
    }
  }
  throw lastError || new Error("yt-dlp format resolution failed");
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

  if (platform === "youtube") {
    setFormats(
      url,
      formats.map((f) => ({
        format_id: f.format_id,
        ext: f.ext,
        hasVideo: f.hasVideo,
        hasAudio: f.hasAudio,
      })),
    );
  }

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

const resolveYoutubeDirectUrls = async (url, resolution, isAudioOnly) => {
  const formatSelector = buildYoutubeAdaptiveSelector(resolution, isAudioOnly);
  const raw = await runYtdlpJsonWithFormat(url, formatSelector);

  const requestedCount = Array.isArray(raw.requested_formats)
    ? raw.requested_formats.length
    : 0;
  console.error(
    `resolveYoutubeDirectUrls debug: selector="${formatSelector}" resolved_format_id=${raw.format_id} resolved_height=${raw.height} requestedFormatsCount=${requestedCount} topUrlPresent=${Boolean(raw.url)}`,
  );

  if (requestedCount === 2) {
    const [first, second] = raw.requested_formats;
    const video = first.vcodec && first.vcodec !== "none" ? first : second;
    const audio = first.acodec && first.acodec !== "none" ? first : second;

    console.error(
      `resolveYoutubeDirectUrls debug: video_itag=${video && video.format_id} video_url_present=${Boolean(video && video.url)} audio_itag=${audio && audio.format_id} audio_url_present=${Boolean(audio && audio.url)}`,
    );

    if (video && audio && video.url && audio.url && video !== audio) {
      return { type: "merge", videoUrl: video.url, audioUrl: audio.url };
    }
  }

  if (raw.url) {
    return { type: "single", url: raw.url, ext: raw.ext || "mp4" };
  }

  return null;
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

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.${ext}"`,
      );
      res.setHeader("Content-Type", "application/octet-stream");

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

const mergeToResponse = (videoUrl, audioUrl, res, filename, onFinish) => {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}.mp4"`,
  );
  res.setHeader("Content-Type", "application/octet-stream");

  const proc = spawn("ffmpeg", [
    "-user_agent",
    USER_AGENT,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-i",
    videoUrl,
    "-user_agent",
    USER_AGENT,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-i",
    audioUrl,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-movflags",
    "frag_keyframe+empty_moov",
    "-f",
    "mp4",
    "pipe:1",
  ]);

  proc.stdout.pipe(res);

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  proc.on("error", () => {
    onFinish(false);
    if (!res.headersSent) {
      res.status(500).json({ message: "Download failed. Please try again." });
    }
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`ffmpeg merge failed: ${stderr}`);
    }
    onFinish(code === 0);
  });
};

const runStreamProcess = (url, formatSelector, outputTemplate, extraArgs) => {
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
      .includes("audio") || String(formatId).startsWith("a-");

  const formatSelector = buildFormatSelector(formatId, resolution, isAudioOnly);
  const proc = runStreamProcess(url, formatSelector, outputTemplate, []);
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

const streamDownload = (url, formatId, res, filename, resolution, onFinish) => {
  const platform = detectPlatform(url);

  let finished = false;
  const notifyFinish = (success) => {
    if (finished) return;
    finished = true;
    if (onFinish) onFinish(success);
  };

  const isAudioOnly =
    String(resolution || "")
      .toLowerCase()
      .includes("audio") || String(formatId).startsWith("a-");

  if (platform === "youtube") {
    resolveYoutubeDirectUrls(url, resolution, isAudioOnly)
      .then((resolved) => {
        if (!resolved) {
          notifyFinish(false);
          if (!res.headersSent) {
            res
              .status(500)
              .json({ message: "Download failed. Please try again." });
          }
          return;
        }

        if (resolved.type === "merge") {
          mergeToResponse(
            resolved.videoUrl,
            resolved.audioUrl,
            res,
            filename,
            notifyFinish,
          );
        } else {
          fetchToResponse(
            resolved.url,
            res,
            filename,
            resolved.ext,
            notifyFinish,
          );
        }
      })
      .catch((error) => {
        console.error(`youtube direct resolve failed: ${error.message}`);
        notifyFinish(false);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ message: "Download failed. Please try again." });
        }
      });
    return;
  }

  streamDownloadOther(url, formatId, res, filename, resolution, notifyFinish);
};

module.exports = { detectPlatform, extractInfo, streamDownload };