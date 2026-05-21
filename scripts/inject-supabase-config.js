const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

const content = `window.__SUPABASE_CONFIG=${JSON.stringify({ url, anonKey })};\n`;
const out = path.join(__dirname, "..", "public", "js", "supabase-env.js");
fs.writeFileSync(out, content);
console.log("Wrote supabase-env.js —", url ? "configured" : "MISSING keys (set SUPABASE_URL + SUPABASE_ANON_KEY)");
