//utils/cookiesSetup.js
const fs = require("fs");
const os = require("os");
const path = require("path");

const COOKIES_PATH = path.join(os.tmpdir(), "yt-cookies.txt");

const setupCookies = () => {
  const encoded = process.env.YT_COOKIES_BASE64;

  if (!encoded) {
    console.log("YT_COOKIES_BASE64 not set, continuing without cookies");
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    fs.writeFileSync(COOKIES_PATH, decoded);
    console.log("YouTube cookies file ready at", COOKIES_PATH);
    return COOKIES_PATH;
  } catch (error) {
    console.log("Failed to write cookies file:", error.message);
    return null;
  }
};

const getCookiesPath = () => {
  return fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : null;
};

module.exports = { setupCookies, getCookiesPath };
