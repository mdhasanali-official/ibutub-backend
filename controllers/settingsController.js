//controllers/settingsController.js
const SiteSettings = require("../models/SiteSettings");
const { uploadTextFile } = require("../services/ftpService");
const {
  uploadBrandingToCloudinary,
  deleteFromCloudinary,
} = require("../middleware/upload");

exports.getPublicSettings = async (req, res) => {
  try {
    const s = await SiteSettings.getSettings();
    return res.status(200).json({
      settings: {
        banner: s.banner,
        maintenance: s.maintenance,
        branding: s.branding,
        social: s.social,
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to load settings" });
  }
};

exports.getAdminSettings = async (req, res) => {
  try {
    const s = await SiteSettings.getSettings();
    return res.status(200).json({ settings: s });
  } catch {
    return res.status(500).json({ message: "Failed to load settings" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { banner, maintenance, social, robotsTxt, siteUrl, sitemapPages } =
      req.body;
    const s = await SiteSettings.getSettings();

    if (banner) s.banner = { ...s.banner.toObject(), ...banner };
    if (maintenance)
      s.maintenance = { ...s.maintenance.toObject(), ...maintenance };
    if (social) s.social = { ...s.social.toObject(), ...social };
    if (typeof robotsTxt === "string") s.robotsTxt = robotsTxt;
    if (siteUrl) s.siteUrl = siteUrl;
    if (Array.isArray(sitemapPages)) s.sitemapPages = sitemapPages;

    await s.save();

    return res.status(200).json({
      message: "Settings saved successfully",
      settings: s,
    });
  } catch (error) {
    console.error(`updateSettings failed: ${error.message}`);
    return res.status(500).json({ message: "Failed to save settings" });
  }
};

exports.uploadBranding = async (req, res) => {
  try {
    const { type } = req.params;

    if (!["logo", "favicon"].includes(type))
      return res.status(400).json({ message: "Invalid branding type" });

    if (!req.file)
      return res.status(400).json({ message: "No image file provided" });

    const s = await SiteSettings.getSettings();
    const field = type === "logo" ? "logoUrl" : "faviconUrl";

    if (s.branding[field]) {
      await deleteFromCloudinary(s.branding[field], "neterskill/branding");
    }

    const imageUrl = await uploadBrandingToCloudinary(req.file.buffer);
    s.branding[field] = imageUrl;
    await s.save();

    return res.status(200).json({
      message: `${type === "logo" ? "Logo" : "Favicon"} uploaded successfully`,
      branding: s.branding,
    });
  } catch (error) {
    console.error(`uploadBranding failed: ${error.message}`);
    if (error.message.includes("File too large"))
      return res.status(400).json({ message: "Image must be less than 2MB" });
    return res.status(500).json({ message: "Failed to upload image" });
  }
};

exports.regenerateSitemap = async (req, res) => {
  try {
    const s = await SiteSettings.getSettings();
    const base = (s.siteUrl || "https://ibutbu.com").replace(/\/$/, "");
    const today = new Date().toISOString().split("T")[0];

    const urls = s.sitemapPages
      .map((p) => {
        const loc = p === "/" ? `${base}/` : `${base}${p}`;
        return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    const result = await uploadTextFile("sitemap.xml", xml);

    s.sitemapHistory.unshift({
      date: new Date(),
      urls: s.sitemapPages.length,
      status: result.success ? "সফল" : "ব্যর্থ",
    });
    s.sitemapHistory = s.sitemapHistory.slice(0, 10);
    await s.save();

    if (!result.success)
      return res.status(500).json({
        message: "Sitemap তৈরি হয়েছে কিন্তু সার্ভারে আপলোড করা যায়নি",
        error: result.error,
        sitemapHistory: s.sitemapHistory,
      });

    return res.status(200).json({
      message: "Sitemap সফলভাবে আপলোড হয়েছে",
      xml,
      sitemapHistory: s.sitemapHistory,
    });
  } catch (error) {
    console.error(`regenerateSitemap failed: ${error.message}`);
    return res.status(500).json({ message: "Sitemap তৈরি করা যায়নি" });
  }
};

exports.publishRobots = async (req, res) => {
  try {
    const { robotsTxt } = req.body;
    const s = await SiteSettings.getSettings();

    if (typeof robotsTxt === "string") {
      s.robotsTxt = robotsTxt;
      await s.save();
    }

    const result = await uploadTextFile("robots.txt", s.robotsTxt);

    if (!result.success)
      return res.status(500).json({
        message: "সংরক্ষণ হয়েছে কিন্তু সার্ভারে আপলোড করা যায়নি",
        error: result.error,
      });

    return res.status(200).json({
      message: "robots.txt সফলভাবে আপলোড হয়েছে",
      robotsTxt: s.robotsTxt,
    });
  } catch (error) {
    console.error(`publishRobots failed: ${error.message}`);
    return res.status(500).json({ message: "robots.txt আপলোড করা যায়নি" });
  }
};

exports.getSitemapXml = async (req, res) => {
  try {
    const s = await SiteSettings.getSettings();
    const base = (s.siteUrl || "https://ibutbu.com").replace(/\/$/, "");
    const today = new Date().toISOString().split("T")[0];

    const urls = s.sitemapPages
      .map((p) => {
        const loc = p === "/" ? `${base}/` : `${base}${p}`;
        return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    res.header("Content-Type", "application/xml");
    return res.send(xml);
  } catch {
    return res.status(500).send("Failed to generate sitemap");
  }
};

exports.getRobotsTxt = async (req, res) => {
  try {
    const s = await SiteSettings.getSettings();
    res.header("Content-Type", "text/plain");
    return res.send(s.robotsTxt);
  } catch {
    return res.status(500).send("Failed to load robots.txt");
  }
};
