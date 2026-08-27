//services/ftpService.js
const ftp = require("basic-ftp");
const { Readable } = require("stream");

const uploadTextFile = async (filename, content) => {
  const client = new ftp.Client(20000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: Number(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    });

    const root = process.env.FTP_ROOT || "/";
    if (root && root !== "/") {
      try {
        await client.cd(root);
      } catch {
        console.log(`FTP: could not cd to ${root}, staying at login dir`);
      }
    }

    const stream = Readable.from([content]);
    await client.uploadFrom(stream, filename);

    return { success: true };
  } catch (error) {
    console.error(`FTP upload failed for ${filename}: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    client.close();
  }
};

module.exports = { uploadTextFile };
