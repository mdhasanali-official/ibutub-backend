//services/formatCache.js
const store = new Map();
const TTL_MS = 4 * 60 * 60 * 1000;

const setFormats = (url, formats) => {
  store.set(url, { formats, expiresAt: Date.now() + TTL_MS });
};

const getFormats = (url) => {
  const entry = store.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(url);
    return null;
  }
  return entry.formats;
};

module.exports = { setFormats, getFormats };
