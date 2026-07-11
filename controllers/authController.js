//controllers/authController.js
const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existEmail = await User.findOne({ email });
    if (existEmail)
      return res.status(400).json({ message: "User already exists" });

    const existPhone = await User.findOne({ phone });
    if (existPhone)
      return res.status(400).json({ message: "Phone already used" });

    const user = await User.create({
      name,
      email,
      phone,
      password,
    });

    return res.status(201).json({
      message: "Registration Successful",
      userId: user._id,
    });
  } catch {
    return res.status(500).json({ message: "Register Failed" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(200).json({
      message: "Login Successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch {
    res.status(500).json({ message: "Login Failed" });
  }
};

exports.getProfile = async (req, res) => {
  try {
    return res.status(200).json({
      message: "Profile fetched successfully",
      user: req.user,
    });
  } catch {
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, phone, bio, address, country, city, zip, profileImage } =
      req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, phone, bio, address, country, city, zip, profileImage },
      { new: true },
    ).select("-password");

    return res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch {
    return res.status(500).json({ message: "Failed to update profile" });
  }
};
