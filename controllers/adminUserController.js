//controllers/adminUserController.js
const User = require("../models/user");

exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    };

    const users = await User.find(query)
      .select("name email role isSuspended createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalUsers = await User.countDocuments(query);

    return res.status(200).json({
      message: "Users fetched successfully",
      page,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      users,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch users" });
  }
};

exports.getSingleUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("name email role isSuspended createdAt")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ user });
  } catch {
    return res.status(500).json({ message: "Failed to fetch user" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, role } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { name, role },
      { new: true, runValidators: true },
    )
      .select("name email role isSuspended")
      .lean();

    if (!updated) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      message: "User updated successfully",
      user: updated,
    });
  } catch {
    return res.status(500).json({ message: "User update failed" });
  }
};

exports.toggleSuspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.isSuspended = !user.isSuspended;
    await user.save();

    return res.status(200).json({
      message: user.isSuspended
        ? "User suspended successfully"
        : "User Unsuspended successfully",
      isSuspended: user.isSuspended,
    });
  } catch {
    return res.status(500).json({ message: "User suspend action failed" });
  }
};
