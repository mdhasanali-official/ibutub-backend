// controllers/adminDashboardController.js
const User = require("../models/user");

exports.getAdminDashboardStats = async (req, res) => {
  try {
    const [totalUsers, suspendedUsers, todayUsers, last7DaysGrowth] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ isSuspended: true }),
        User.countDocuments({
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        }),
        User.aggregate([
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
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
      ]);

    res.status(200).json({
      message: "Dashboard stats loaded successfully",
      stats: {
        totalUsers,
        suspendedUsers,
        todayUsers,
        growthLast7Days: last7DaysGrowth,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};
