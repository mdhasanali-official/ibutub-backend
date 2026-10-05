const { setFormats, getFormats } = require("./formatCache");

function unescapeUrl(str) {
  if (!str) return "";
  return str.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

function cleanTitle(str) {
  if (!str) return "Threads Video";
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/(\s*on Threads|\s*• Threads|\s*\|\s*Threads)$/i, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x2022;/g, "•")
    .trim() || "Threads Video";
}

async function resolveThreadsUrl(url) {
  let cleaned = url.trim();
  if (cleaned.startsWith("http://")) cleaned = cleaned.replace("http://", "https://");
  if (!cleaned.startsWith("https://")) cleaned = "https://" + cleaned;

  return cleaned;
}

async function extractThreadsInfo(url) {
  const targetUrl = await resolveThreadsUrl(url);

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "no-cache"
  };

  const response = await fetch(targetUrl, {
    headers,
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Threads page returned status ${response.status}`);
  }

  const html = await response.text();

  let title = "Threads Video";
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                     html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = cleanTitle(titleMatch[1]);
  }

  let thumbnail = null;
  const thumbMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (thumbMatch && thumbMatch[1]) {
    thumbnail = unescapeUrl(thumbMatch[1]);
  }

  let videoUrl = null;

  const ogVideoMatch = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i);
  if (ogVideoMatch && ogVideoMatch[1]) {
    videoUrl = unescapeUrl(ogVideoMatch[1]);
  }

  if (!videoUrl) {
    const directMatches = html.match(/https:\/\/[^"'\s\\]*\.cdninstagram\.com\/[^"'\s\\]*\.mp4[^"'\s\\]*/gi) ||
                          html.match(/https:\/\/[^"'\s\\]*\.fbcdn\.net\/[^"'\s\\]*\.mp4[^"'\s\\]*/gi);
    if (directMatches && directMatches.length > 0) {
      videoUrl = unescapeUrl(directMatches[0]);
    }
  }

  if (!videoUrl) {
    const jsonMatches = html.matchAll(/"(?:video_versions|playback_url|video_url)":\s*(?:\[\{"url":\s*"([^"]+)"|"([^"]+)")/g);
    for (const m of jsonMatches) {
      const candidate = m[1] || m[2];
      if (candidate && candidate.includes(".mp4")) {
        videoUrl = unescapeUrl(candidate);
        break;
      }
    }
  }

  if (!videoUrl) {
    throw new Error("No video found in this Threads post (it may be a text/photo post or require login)");
  }

  let uploader = "Threads User";
  const userMatch = targetUrl.match(/threads\.(?:net|com)\/@([^\/\?#]+)/i);
  if (userMatch && userMatch[1]) {
    uploader = "@" + userMatch[1];
  }

  const rawFormats = [
    {
      format_id: "threads-video-hd",
      ext: "mp4",
      resolution: "1080p HD",
      hasVideo: true,
      hasAudio: true,
      filesize: null,
      note: "HD",
      _sourceUrl: videoUrl,
    },
    {
      format_id: "threads-audio",
      ext: "mp3",
      resolution: "Audio (MP3)",
      hasVideo: false,
      hasAudio: true,
      filesize: null,
      note: "MP3 Extract",
      _sourceUrl: videoUrl,
    }
  ];

  setFormats(
    url,
    rawFormats.map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      hasVideo: f.hasVideo,
      hasAudio: f.hasAudio,
      abr: 128,
      sourceUrl: f._sourceUrl,
    }))
  );

  const cleanFormats = rawFormats.map(({ _sourceUrl, ...rest }) => rest);

  return {
    platform: "threads",
    title,
    thumbnail,
    duration: null,
    uploader,
    formats: cleanFormats,
  };
}

module.exports = {
  extractThreadsInfo,
  resolveThreadsUrl,
};
