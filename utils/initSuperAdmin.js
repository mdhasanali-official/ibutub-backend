//utils/initSuperAdmin.js
const SuperAdmin = require("../models/superAdmin");

const initSuperAdmin = async () => {
  try {
    const exists = await SuperAdmin.findOne({
      email: process.env.SUPER_ADMIN_EMAIL,
    });

    if (exists) {
      console.log("Super Admin already exists");
      return;
    }

    await SuperAdmin.create({
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    });

    console.log("Super Admin Created Successfully");
  } catch (err) {
    console.log("Super Admin Initialization Failed", err);
  }
};

module.exports = initSuperAdmin;
