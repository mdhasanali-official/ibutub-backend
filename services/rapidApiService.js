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
  const host = "youtube-media-downloader.p.rapidapi.com";
  const response = await fetch(
    `https://${host}/v2/video/details?videoId=${videoId}&urlAccess=normal&videos=auto&audios=auto`,
    {
      headers: {
        "x-rapidapi-host": host,
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    },
  );

  if (!response.ok) throw new Error(`DataFanatic status ${response.status}`);
  const data = await response.json();
  if (data.errorId !== "Success")
    throw new Error(data.errorId || "DataFanatic error");

  const videoItems = data.videos?.items || [];
  const audioItems = data.audios?.items || [];

  return {
    title: data.title || "Untitled",
    thumbnail: data.thumbnails?.[data.thumbnails.length - 1]?.url || null,
    duration: data.lengthSeconds || null,
    uploader: data.channel?.name || null,
    formats: [
      ...videoItems.map((item, idx) => ({
        format_id: `v-${idx}`,
        ext: item.extension,
        resolution: item.quality || "video",
        hasVideo: true,
        hasAudio: !!item.hasAudio,
        filesize: item.size || null,
        note: item.quality || "",
        url: item.url,
      })),
      ...audioItems.map((item, idx) => ({
        format_id: `a-${idx}`,
        ext: item.extension,
        resolution: "audio only",
        hasVideo: false,
        hasAudio: true,
        filesize: item.size || null,
        note: item.quality || item.extension,
        url: item.url,
      })),
    ],
  };
};

module.exports = { extractVideoId, getYoutubeDetails };
