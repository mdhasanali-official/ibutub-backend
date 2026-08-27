//models/SiteSettings.js
const mongoose = require("mongoose");

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },

    banner: {
      enabled: { type: Boolean, default: false },
      text: { type: String, default: "" },
    },

    maintenance: {
      enabled: { type: Boolean, default: false },
      message: {
        type: String,
        default: "সাইটে কিছু আপডেট চলছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      },
    },

    branding: {
      logoUrl: { type: String, default: null },
      faviconUrl: { type: String, default: null },
    },

    social: {
      facebook: { type: String, default: "" },
      twitter: { type: String, default: "" },
      instagram: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },

    siteUrl: { type: String, default: "https://ibutbu.com" },

    robotsTxt: {
      type: String,
      default:
        "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: https://ibutbu.com/sitemap.xml",
    },

    sitemapPages: {
      type: [String],
      default: ["/", "/youtube", "/tiktok", "/facebook", "/instagram"],
    },

    sitemapHistory: [
      {
        date: { type: Date, default: Date.now },
        urls: Number,
        status: String,
      },
    ],
  },
  { timestamps: true },
);

siteSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: "main" });
  if (!doc) doc = await this.create({ key: "main" });
  return doc;
};

module.exports = mongoose.model("SiteSettings", siteSettingsSchema);
