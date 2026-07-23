//services/rapidApiService.js
const RAPIDAPI_HOST = "youtube-media-downloader.p.rapidapi.com";

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
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY not configured");
  }

  const response = await fetch(
    `https://${RAPIDAPI_HOST}/v2/video/details?videoId=${videoId}&urlAccess=normal&videos=auto&audios=auto`,
    {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": apiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`RapidAPI request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (data.errorId !== "Success") {
    throw new Error(data.errorId || "RapidAPI returned an error");
  }

  return data;
};

module.exports = { extractVideoId, getYoutubeDetails };
