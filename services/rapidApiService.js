//services/rapidApiService.js
const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const getYoutubeDetails = async (videoId) => {
  const host = "all-media-downloader4.p.rapidapi.com";
  const response = await fetch(
    `https://${host}/api/youtube/download?id=${videoId}`,
    {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    },
  );

  if (!response.ok)
    throw new Error(`AllMediaDownloader status ${response.status}`);

  const data = await response.json();
  const results = data.results || [];

  if (results.length === 0) throw new Error("No formats returned");

  return {
    title: "YouTube Video",
    thumbnail: null,
    duration: data.duration || null,
    uploader: null,
    formats: results.map((item, idx) => ({
      format_id: `amd-${idx}`,
      ext: (item.mime || "video/mp4").split("/")[1] || "mp4",
      resolution: item.quality || "video",
      hasVideo: !item.mime?.startsWith("audio"),
      hasAudio: !!item.has_audio,
      filesize: null,
      note: item.quality || "",
      url: item.url,
    })),
  };
};

module.exports = { extractVideoId, getYoutubeDetails };
