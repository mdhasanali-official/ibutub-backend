//controllers/adminDownloadController.js
const DownloadHistory = require("../models/DownloadHistory");

exports.getDownloadLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const logs = await DownloadHistory.find(query)
      .select("platform ip status createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalLogs = await DownloadHistory.countDocuments(query);

    return res.status(200).json({
      message: "Download logs fetched successfully",
      page,
      totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      logs,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch download logs" });
  }
};

exports.getFailedTracker = async (req, res) => {
  try {
    const tracker = await DownloadHistory.aggregate([
      { $match: { status: "failed" } },
      {
        $group: {
          _id: "$platform",
          fails: { $sum: 1 },
          lastSeen: { $max: "$createdAt" },
        },
      },
      { $sort: { fails: -1 } },
    ]);

    return res.status(200).json({
      message: "Failed tracker fetched successfully",
      tracker,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch failed tracker" });
  }
};

exports.getWeeklyFailChart = async (req, res) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const result = await DownloadHistory.aggregate([
      { $match: { status: "failed", createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const map = new Map(result.map((r) => [r._id, r.count]));
    const chart = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      chart.push({
        d: d.toLocaleDateString("en-US", { weekday: "short" }),
        v: map.get(key) || 0,
      });
    }

    return res.status(200).json({
      message: "Weekly fail chart fetched successfully",
      chart,
    });
  } catch {
    return res
      .status(500)
      .json({ message: "Failed to fetch weekly fail chart" });
  }
};
