const fs = require("fs");
const path = require("path");

let url = (process.env.SUPABASE_URL || "").trim();
if (url) {
  url = url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}
const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();

const content = `window.__SUPABASE_CONFIG=${JSON.stringify({ url, anonKey })};\n`;
const out = path.join(__dirname, "..", "public", "js", "supabase-env.js");
fs.writeFileSync(out, content);
console.log("Wrote supabase-env.js —", url ? "configured" : "MISSING keys (set SUPABASE_URL + SUPABASE_ANON_KEY)");
