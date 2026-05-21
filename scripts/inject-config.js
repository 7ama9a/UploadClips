const fs = require("fs");
const path = require("path");

const api = (process.env.API_URL || "").replace(/\/$/, "");
const frontend = (
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  process.env.FRONTEND_URL ||
  ""
).replace(/\/$/, "");

const content = `window.__7UPLOAD_CONFIG=${JSON.stringify({ api, frontend })};\n`;
const out = path.join(__dirname, "..", "public", "js", "config.js");
fs.writeFileSync(out, content);
console.log("Wrote config.js — API:", api || "(same origin)");
