const https = require("https");
const http = require("http");
const { setFormats } = require("./formatCache");

const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST ||
  "instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com";

const isRapidApiConfigured = () => {
  return Boolean(process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY.trim());
};

const mapResolutionToRapidFormat = (resolution, formatId) => {
  const combined = `${resolution || ""} ${formatId || ""}`.toLowerCase();
  if (combined.includes("audio") || combined.includes("mp3")) return "mp3";
  if (combined.includes("4k") || combined.includes("2160")) return "2160p";
  if (combined.includes("2k") || combined.includes("1440")) return "1440p";
  if (combined.includes("1080")) return "1080p";
  if (combined.includes("720")) return "720p";
  if (combined.includes("480")) return "480p";
  if (combined.includes("360")) return "360p";
  if (combined.includes("240")) return "240p";
  if (combined.includes("144")) return "144p";
  return "1080p";
};

const cleanVideoTitle = (filename) => {
  if (!filename) return "Video Download";
  return filename
    .replace(/\s*\([^)]*\)\.mp4$/i, "")
    .replace(/\.mp4$/i, "")
    .replace(/\.mp3$/i, "")
    .trim();
};

const callRapidApiPost = async (path, bodyData) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");

  const url = `https://${RAPIDAPI_HOST}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-rapidapi-key": apiKey.trim(),
      "x-rapidapi-host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI Error (${response.status}): ${errorText}`);
  }

  return await response.json();
};

const callRapidApiGet = async (pathWithQuery) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");

  const url = `https://${RAPIDAPI_HOST}${pathWithQuery}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiKey.trim(),
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI Error (${response.status}): ${errorText}`);
  }

  return await response.json();
};

const fetchRapidApiYouTube = async (videoUrl, format = "1080p") => {
  let data;
  try {
    data = await callRapidApiPost("/youtube/download", {
      url: videoUrl,
      format: format,
    });
  } catch (firstErr) {
    data = await callRapidApiPost(
      "/YouTube%20Download%20-%20MP4%20up%20to%204K%20or%20MP3",
      {
        url: videoUrl,
        format: format,
      },
    );
  }

  if (!data || !data.download_url) {
    throw new Error(data?.message || "RapidAPI did not return a download URL");
  }

  return data;
};

const fetchRapidApiSocial = async (mediaUrl) => {
  const encoded = encodeURIComponent(mediaUrl);
  try {
    return await callRapidApiGet(
      `/Download%20by%20Link?url=${encoded}`,
    );
  } catch {
    return await callRapidApiGet(`/?url=${encoded}`);
  }
};

const extractInfoRapidApi = async (url, platform) => {
  if (!isRapidApiConfigured()) {
    throw new Error("RapidAPI is not configured");
  }

  const isYouTube =
    platform === "youtube" ||
    url.includes("youtube.com") ||
    url.includes("youtu.be");

  if (isYouTube) {
    const result = await fetchRapidApiYouTube(url, "1080p");
    const rawTitle = cleanVideoTitle(result.filename);
    const thumbnail =
      result.thumbnails?.max ||
      result.thumbnails?.low ||
      `https://i.ytimg.com/vi/${result.video_id}/hqdefault.jpg`;

    const standardFormats = [
      {
        format_id: "rapid-2160p",
        ext: "mp4",
        resolution: "2160p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "4K Ultra HD",
        _rapidFormat: "2160p",
      },
      {
        format_id: "rapid-1440p",
        ext: "mp4",
        resolution: "1440p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "2K Quad HD",
        _rapidFormat: "1440p",
      },
      {
        format_id: "rapid-1080p",
        ext: "mp4",
        resolution: "1080p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "1080p Full HD",
        _rapidFormat: "1080p",
        _directUrl: result.download_url,
      },
      {
        format_id: "rapid-720p",
        ext: "mp4",
        resolution: "720p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "720p HD",
        _rapidFormat: "720p",
      },
      {
        format_id: "rapid-480p",
        ext: "mp4",
        resolution: "480p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "480p SD",
        _rapidFormat: "480p",
      },
      {
        format_id: "rapid-360p",
        ext: "mp4",
        resolution: "360p",
        hasVideo: true,
        hasAudio: true,
        filesize: null,
        note: "360p",
        _rapidFormat: "360p",
      },
      {
        format_id: "rapid-mp3",
        ext: "mp3",
        resolution: "MP3 Audio",
        hasVideo: false,
        hasAudio: true,
        is_audio: true,
        filesize: null,
        note: "MP3 Audio",
        _rapidFormat: "mp3",
      },
    ];

    setFormats(
      url,
      standardFormats.map((f) => ({
        format_id: f.format_id,
        ext: f.ext,
        hasVideo: f.hasVideo,
        hasAudio: f.hasAudio,
        sourceUrl: f._directUrl || null,
        rapidFormat: f._rapidFormat,
      })),
    );

    return {
      platform: "youtube",
      title: rawTitle,
      thumbnail: thumbnail,
      duration: result.duration || null,
      uploader: "YouTube",
      formats: standardFormats.map(({ _directUrl, _rapidFormat, ...rest }) => rest),
    };
  }

  const socialResult = await fetchRapidApiSocial(url);
  const downloadUrl =
    socialResult.download_url ||
    socialResult.url ||
    socialResult.media ||
    (Array.isArray(socialResult.medias) && socialResult.medias[0]?.url);

  if (!downloadUrl) {
    throw new Error("Could not find media link from RapidAPI response");
  }

  const title = socialResult.title || `${platform || "Social"} Video`;
  const thumbnail =
    socialResult.thumbnail || socialResult.thumb || socialResult.cover || null;

  const formats = [
    {
      format_id: "rapid-video",
      ext: "mp4",
      resolution: "HD Video",
      hasVideo: true,
      hasAudio: true,
      filesize: null,
      note: "HD Quality",
    },
    {
      format_id: "rapid-audio",
      ext: "mp3",
      resolution: "MP3 Audio",
      hasVideo: false,
      hasAudio: true,
      is_audio: true,
      filesize: null,
      note: "MP3 Audio",
    },
  ];

  setFormats(
    url,
    formats.map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      hasVideo: f.hasVideo,
      hasAudio: f.hasAudio,
      sourceUrl: downloadUrl,
      rapidFormat: f.format_id === "rapid-audio" ? "mp3" : "1080p",
    })),
  );

  return {
    platform: platform || "unknown",
    title: title,
    thumbnail: thumbnail,
    duration: socialResult.duration || null,
    uploader: socialResult.author || null,
    formats: formats,
  };
};

const getRapidDownloadUrl = async (url, formatId, resolution) => {
  const isYouTube =
    url.includes("youtube.com") || url.includes("youtu.be");
  const targetFormat = mapResolutionToRapidFormat(resolution, formatId);

  if (isYouTube) {
    const res = await fetchRapidApiYouTube(url, targetFormat);
    return {
      downloadUrl: res.download_url,
      filename: res.filename || "video",
      ext: targetFormat === "mp3" ? "mp3" : "mp4",
    };
  }

  const socialResult = await fetchRapidApiSocial(url);
  const downloadUrl =
    socialResult.download_url ||
    socialResult.url ||
    socialResult.media ||
    (Array.isArray(socialResult.medias) && socialResult.medias[0]?.url);

  if (!downloadUrl) {
    throw new Error("Failed to get download URL from RapidAPI");
  }

  return {
    downloadUrl: downloadUrl,
    filename: socialResult.title || "video",
    ext: targetFormat === "mp3" ? "mp3" : "mp4",
  };
};

const pipeStreamToClient = (
  streamUrl,
  res,
  filename,
  ext,
  onFinish,
  redirectsLeft = 5,
) => {
  const client = streamUrl.startsWith("https") ? https : http;

  client
    .get(
      streamUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
      (upstream) => {
        if (
          [301, 302, 303, 307, 308].includes(upstream.statusCode) &&
          upstream.headers.location &&
          redirectsLeft > 0
        ) {
          upstream.resume();
          pipeStreamToClient(
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
            `RapidAPI stream fetch failed: status=${upstream.statusCode}`,
          );
          if (onFinish) onFinish(false);
          if (!res.headersSent) {
            res.status(500).json({ message: "Download failed from CDN." });
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
        upstream.on("end", () => {
          if (onFinish) onFinish(true);
        });
        upstream.on("error", () => {
          if (onFinish) onFinish(false);
        });
      },
    )
    .on("error", (err) => {
      console.error("Pipe stream error:", err.message);
      if (onFinish) onFinish(false);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to stream download." });
      }
    });
};

module.exports = {
  isRapidApiConfigured,
  extractInfoRapidApi,
  getRapidDownloadUrl,
  pipeStreamToClient,
};
