// controllers/adminDashboardController.js
const User = require("../models/user");
const DownloadHistory = require("../models/DownloadHistory");
const Visit = require("../models/Visit");

const getStartOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getDaysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

exports.getAdminDashboardStats = async (req, res) => {
  try {
    const todayStart = getStartOfDay();
    const sevenDaysAgo = getDaysAgo(7);
    const thirtyDaysAgo = getDaysAgo(30);

    const [
      totalUsers,
      suspendedUsers,
      todayUsers,
      last7DaysGrowth,
      visitsToday,
      visits7Days,
      visits30Days,
      visitsLifetime,
      downloadsToday,
      downloads7Days,
      downloads30Days,
      downloadsLifetime,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isSuspended: true }),
      User.countDocuments({
        createdAt: { $gte: todayStart },
      }),
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Visit.countDocuments({ createdAt: { $gte: todayStart } }),
      Visit.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Visit.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Visit.countDocuments({}),
      DownloadHistory.countDocuments({
        status: "downloaded",
        createdAt: { $gte: todayStart },
      }),
      DownloadHistory.countDocuments({
        status: "downloaded",
        createdAt: { $gte: sevenDaysAgo },
      }),
      DownloadHistory.countDocuments({
        status: "downloaded",
        createdAt: { $gte: thirtyDaysAgo },
      }),
      DownloadHistory.countDocuments({ status: "downloaded" }),
    ]);

    res.status(200).json({
      message: "Dashboard stats loaded successfully",
      stats: {
        totalUsers,
        suspendedUsers,
        todayUsers,
        growthLast7Days: last7DaysGrowth,
        visits: {
          today: visitsToday,
          last7Days: visits7Days,
          last30Days: visits30Days,
          lifetime: visitsLifetime,
        },
        downloads: {
          today: downloadsToday,
          last7Days: downloads7Days,
          last30Days: downloads30Days,
          lifetime: downloadsLifetime,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};

exports.getDownloadsChart = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const now = new Date();
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (days - 1),
        0,
        0,
        0,
        0,
      ),
    );

    const result = await DownloadHistory.aggregate([
      { $match: { status: "downloaded", createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const map = new Map(result.map((r) => [r._id, r.count]));
    const chart = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split("T")[0];
      chart.push({
        d:
          days > 7
            ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
            : d.toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              }),
        v: map.get(key) || 0,
      });
    }

    return res.status(200).json({
      message: "Downloads chart fetched successfully",
      chart,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch downloads chart" });
  }
};

exports.getPlatformStats = async (req, res) => {
  try {
    const result = await DownloadHistory.aggregate([
      { $match: { status: "downloaded" } },
      { $group: { _id: "$platform", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = result.reduce((sum, r) => sum + r.count, 0);
    const platforms = result.map((r) => ({
      name: r._id,
      count: r.count,
      pct: total ? Math.round((r.count / total) * 100) : 0,
    }));

    return res.status(200).json({
      message: "Platform stats fetched successfully",
      platforms,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch platform stats" });
  }
};
