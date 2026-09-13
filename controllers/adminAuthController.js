//controllers/adminAuthController.js
const SuperAdmin = require("../models/superAdmin");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../middleware/upload");

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await SuperAdmin.findOne({ email });
    if (!admin)
      return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: admin._id, role: "super_admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(200).json({
      message: "Admin Login Successful",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        profileImage: admin.profileImage,
        role: "super_admin",
      },
    });
  } catch {
    res.status(500).json({ message: "Admin Login Failed" });
  }
};

exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await SuperAdmin.findById(req.admin.id).select("-password");

    if (!admin) return res.status(404).json({ message: "Admin not found" });

    return res.status(200).json({
      message: "Profile fetched successfully",
      admin,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
};

exports.updateAdminProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;

    const admin = await SuperAdmin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (name && name.trim()) {
      admin.name = name.trim();
    }

    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Current password is required to set new password" });
      }

      const isMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!isMatch) {
        return res
          .status(400)
          .json({ message: "Current password does not match" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "New password must be at least 6 characters" });
      }

      admin.password = await bcrypt.hash(newPassword, 10);
    }

    await admin.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        profileImage: admin.profileImage,
        role: "super_admin",
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to update profile" });
  }
};

exports.uploadAdminProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const admin = await SuperAdmin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (admin.profileImage) {
      await deleteFromCloudinary(admin.profileImage);
    }

    const imageUrl = await uploadToCloudinary(req.file.buffer);

    admin.profileImage = imageUrl;
    await admin.save();

    return res.status(200).json({
      message: "Profile image uploaded successfully",
      profileImage: imageUrl,
    });
  } catch (error) {
    if (error.message && error.message.includes("File too large")) {
      return res.status(400).json({ message: "Image must be less than 100KB" });
    }
    return res.status(500).json({ message: "Failed to upload image" });
  }
};
