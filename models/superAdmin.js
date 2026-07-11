//models/superAdmin.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const superAdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "super_admin",
    },
    profileImage: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: "Super Admin",
    },
  },
  { timestamps: true },
);

superAdminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model("SuperAdmin", superAdminSchema);
