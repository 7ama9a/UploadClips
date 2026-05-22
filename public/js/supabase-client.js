let _client = null;

function getSupabase() {
  if (_client) return _client;
  const cfg = window.__SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) {
    console.error("7Upload: Set SUPABASE_URL and SUPABASE_ANON_KEY (see SUPABASE-HOSTING.md)");
    return null;
  }
  if (!window.supabase?.createClient) {
    console.error("7Upload: Supabase JS library not loaded");
    return null;
  }
  const cleanUrl = cfg.url.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  _client = window.supabase.createClient(cleanUrl, cfg.anonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _client;
}

function clipVideoUrl(storagePath) {
  const sb = getSupabase();
  if (!sb || !storagePath) return "";
  const { data } = sb.storage.from("clips").getPublicUrl(storagePath);
  return data.publicUrl;
}
