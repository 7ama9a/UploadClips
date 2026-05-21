let currentUser = null;
let clipsCache = [];
let realtimeChannel = null;

const pages = {
  home: document.getElementById("page-home"),
  clips: document.getElementById("page-clips"),
  users: document.getElementById("page-users"),
  upload: document.getElementById("page-upload"),
  profile: document.getElementById("page-profile"),
};

function showToast(msg, isError) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function setActiveNav(name) {
  document.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === name);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function discordAvatar(user) {
  const m = user?.user_metadata || {};
  if (m.avatar_url) return m.avatar_url;
  return "https://cdn.discordapp.com/embed/avatars/0.png";
}

async function syncProfile(user) {
  const sb = getSupabase();
  if (!sb || !user) return;
  const m = user.user_metadata || {};
  const username =
    m.full_name ||
    m.name ||
    m.preferred_username ||
    m.custom_claims?.global_name ||
    user.email?.split("@")[0] ||
    "user";
  await sb.from("profiles").upsert({
    id: user.id,
    username,
    avatar_url: m.avatar_url || discordAvatar(user),
  });
}

function mapClipRow(row, likeCount, liked) {
  const p = row.profiles || {};
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    videoUrl: clipVideoUrl(row.storage_path),
    views: row.views,
    likes: likeCount,
    liked,
    author: {
      id: row.user_id,
      username: p.username || "?",
      avatar: p.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png",
    },
  };
}

async function attachLikesToClips(clips) {
  if (!clips?.length) return [];
  const sb = getSupabase();
  const ids = clips.map((c) => c.id);
  const { data: likes } = await sb.from("likes").select("clip_id, user_id").in("clip_id", ids);
  const countMap = {};
  const myLikes = new Set();
  const uid = currentUser?.id;
  (likes || []).forEach((l) => {
    countMap[l.clip_id] = (countMap[l.clip_id] || 0) + 1;
    if (uid && l.user_id === uid) myLikes.add(l.clip_id);
  });
  return clips.map((row) =>
    mapClipRow(row, countMap[row.id] || 0, myLikes.has(row.id))
  );
}

async function fetchClipsWithMeta(userIdFilter) {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from("clips")
    .select("*, profiles(id, username, avatar_url)")
    .order("created_at", { ascending: false });

  if (userIdFilter) query = query.eq("user_id", userIdFilter);

  const { data: clips, error } = await query;
  if (error) throw error;
  return attachLikesToClips(clips || []);
}

function navigate() {
  const hash = location.hash.slice(1) || "home";
  const [page, param] = hash.split("/");

  Object.values(pages).forEach((p) => p && p.classList.remove("active"));
  const section = pages[page] || pages.home;
  if (section) section.classList.add("active");
  setActiveNav(pages[page] ? page : "home");

  if (page === "clips") loadClips("clips-grid");
  if (page === "users") loadUsers();
  if (page === "home") loadClips("home-clips", 6);
  if (page === "profile" && param) loadProfile(param);
  if (page === "upload" && !currentUser) showToast(t("upload.needLogin"), true);
}

function likeButtonHtml(clip, uniqueId) {
  const id = `heart-${uniqueId}`;
  const checked = clip.liked ? "checked" : "";
  const display = clip.likes;
  const next = clip.liked ? clip.likes : clip.likes + 1;
  return `
    <div class="like-button" data-clip-id="${clip.id}">
      <input class="heart-input on" id="${id}" type="checkbox" ${checked} />
      <label class="like" for="${id}">
        <svg class="like-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"></path>
        </svg>
        <span class="like-text">${t("likes")}</span>
      </label>
      <span class="like-count one">${display}</span>
      <span class="like-count two">${next}</span>
    </div>`;
}

function renderClipCard(clip, container, index) {
  const card = document.createElement("article");
  card.className = "clip-card";
  card.innerHTML = `
    <div class="card-image-container">
      <video src="${clip.videoUrl}" muted preload="metadata" playsinline></video>
    </div>
    <p class="card-title">${escapeHtml(clip.title)}</p>
    <p class="card-des">${escapeHtml(clip.description || "")}</p>
    <div class="clip-meta">
      <a href="#profile/${clip.author?.id}" class="author-link">${escapeHtml(clip.author?.username || "?")}</a>
      <span class="views-badge">👁 ${clip.views} ${t("views")}</span>
    </div>
    <div style="margin-top:8px">${likeButtonHtml(clip, `${container}-${index}`)}</div>
  `;
  card.querySelector(".card-image-container").addEventListener("click", () => openClipModal(clip.id));
  card.querySelector(".card-title").addEventListener("click", () => openClipModal(clip.id));
  bindLike(card, clip);
  return card;
}

function bindLike(root, clip) {
  const input = root.querySelector(".heart-input");
  if (!input) return;
  input.addEventListener("change", async (e) => {
    e.stopPropagation();
    if (!currentUser) {
      input.checked = false;
      showToast(t("like.needLogin"), true);
      return;
    }
    const sb = getSupabase();
    try {
      if (clip.liked) {
        const { error } = await sb
          .from("likes")
          .delete()
          .eq("clip_id", clip.id)
          .eq("user_id", currentUser.id);
        if (error) throw error;
        clip.liked = false;
        clip.likes = Math.max(0, clip.likes - 1);
      } else {
        const { error } = await sb.from("likes").insert({
          clip_id: clip.id,
          user_id: currentUser.id,
        });
        if (error) throw error;
        clip.liked = true;
        clip.likes += 1;
      }
      updateLikeUI(root, clip.likes, clip.liked);
      const cached = clipsCache.find((c) => c.id === clip.id);
      if (cached) {
        cached.likes = clip.likes;
        cached.liked = clip.liked;
      }
    } catch {
      input.checked = !input.checked;
    }
  });
}

function updateLikeUI(root, likes, liked) {
  const input = root.querySelector(".heart-input");
  const one = root.querySelector(".like-count.one");
  const two = root.querySelector(".like-count.two");
  if (input) input.checked = liked;
  if (one) one.textContent = likes;
  if (two) two.textContent = liked ? likes : likes + 1;
}

async function loadClips(containerId, limit) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = "";
  try {
    clipsCache = await fetchClipsWithMeta();
    let list = clipsCache;
    if (limit) list = list.slice(0, limit);
    if (!list.length) {
      grid.innerHTML = `<p class="empty-state">${t("empty.clips")}</p>`;
      return;
    }
    list.forEach((clip, i) => grid.appendChild(renderClipCard(clip, containerId, i)));
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="empty-state">${t("empty.clips")}</p>`;
  }
}

async function loadUsers() {
  const grid = document.getElementById("users-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const sb = getSupabase();
  try {
    const { data: profiles, error } = await sb
      .from("profiles")
      .select("id, username, avatar_url, joined_at")
      .order("joined_at", { ascending: false });
    if (error) throw error;

    const { data: clips } = await sb.from("clips").select("user_id");
    const counts = {};
    (clips || []).forEach((c) => {
      counts[c.user_id] = (counts[c.user_id] || 0) + 1;
    });

    if (!profiles?.length) {
      grid.innerHTML = `<p class="empty-state">${t("empty.users")}</p>`;
      return;
    }

    profiles.forEach((u) => {
      const card = document.createElement("div");
      card.className = "user-card";
      card.innerHTML = `
        <img class="avatar" src="${u.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="" />
        <div class="info">
          <p class="name">${escapeHtml(u.username)}</p>
          <p class="meta">${counts[u.id] || 0} ${t("profile.clipsCount")}</p>
        </div>
      `;
      card.addEventListener("click", () => {
        location.hash = `profile/${u.id}`;
      });
      grid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="empty-state">${t("empty.users")}</p>`;
  }
}

async function loadProfile(userId) {
  const content = document.getElementById("profile-content");
  const grid = document.getElementById("profile-clips");
  content.innerHTML = "";
  grid.innerHTML = "";
  const sb = getSupabase();
  try {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;

    content.innerHTML = `
      <div class="profile-header">
        <img src="${profile.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="" />
        <div>
          <h2>${escapeHtml(profile.username)}</h2>
          <p class="sub">${t("profile.joined")}: ${new Date(profile.joined_at).toLocaleDateString()}</p>
        </div>
      </div>
    `;

    const userClips = await fetchClipsWithMeta(userId);
    if (!userClips.length) {
      grid.innerHTML = `<p class="empty-state">${t("empty.clips")}</p>`;
      return;
    }
    userClips.forEach((clip, i) =>
      grid.appendChild(renderClipCard(clip, "profile-clips", i))
    );
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="empty-state">User not found</p>`;
  }
}

async function openClipModal(clipId) {
  const overlay = document.getElementById("clip-modal");
  const video = document.getElementById("modal-video");
  const title = document.getElementById("modal-title");
  const desc = document.getElementById("modal-desc");
  const views = document.getElementById("modal-views");
  const likeSlot = document.getElementById("modal-like");
  const sb = getSupabase();

  try {
    await sb.rpc("increment_clip_views", { clip_uuid: clipId });

    let clip = clipsCache.find((c) => c.id === clipId);
    if (!clip) {
      clipsCache = await fetchClipsWithMeta();
      clip = clipsCache.find((c) => c.id === clipId);
    }
    if (!clip) throw new Error("not found");

    clip.views += 1;
    title.textContent = clip.title;
    desc.textContent = clip.description || "";
    video.src = clip.videoUrl;
    views.textContent = `👁 ${clip.views} ${t("views")}`;
    likeSlot.innerHTML = likeButtonHtml(clip, "modal");
    bindLike(likeSlot, clip);
    overlay.classList.add("open");
    video.play().catch(() => {});
  } catch (err) {
    console.error(err);
    showToast(t("upload.fail"), true);
  }
}

function renderAuth(user) {
  const slot = document.getElementById("auth-slot");
  if (!user) {
    slot.innerHTML = `<button type="button" class="discord-login-btn" id="login-btn">${t("auth.login")}</button>`;
    document.getElementById("login-btn")?.addEventListener("click", loginWithDiscord);
    return;
  }
  slot.innerHTML = `
    <a href="#profile/${user.id}" class="user-menu">
      <img src="${user.avatar}" alt="" />
      <span class="username">${escapeHtml(user.username)}</span>
    </a>
    <button type="button" class="btn-ghost" id="logout-btn">${t("auth.logout")}</button>
  `;
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    const sb = getSupabase();
    await sb.auth.signOut();
    currentUser = null;
    renderAuth(null);
    showToast(t("auth.logout"));
  });
}

async function loginWithDiscord() {
  const sb = getSupabase();
  if (!sb) {
    showToast("Supabase not configured", true);
    return;
  }
  const { error } = await sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) showToast(t("login.fail"), true);
}

async function fetchMe() {
  const sb = getSupabase();
  if (!sb) {
    renderAuth(null);
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) {
    currentUser = null;
    renderAuth(null);
    return;
  }
  await syncProfile(session.user);
  const { data: profile } = await sb
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", session.user.id)
    .single();

  currentUser = {
    id: session.user.id,
    username: profile?.username || session.user.email || "user",
    avatar: profile?.avatar_url || discordAvatar(session.user),
  };
  renderAuth(currentUser);
}

function initRealtime() {
  const sb = getSupabase();
  if (!sb || realtimeChannel) return;

  realtimeChannel = sb
    .channel("7upload")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "clips" },
      () => {
        const hash = location.hash.slice(1).split("/")[0] || "home";
        if (hash === "clips") loadClips("clips-grid");
        if (hash === "home") loadClips("home-clips", 6);
        const profileId = location.hash.match(/profile\/([^/]+)/)?.[1];
        if (profileId) loadProfile(profileId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "likes" },
      () => {
        const hash = location.hash.slice(1).split("/")[0] || "home";
        if (hash === "clips") loadClips("clips-grid");
        if (hash === "home") loadClips("home-clips", 6);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => {
        if (location.hash.includes("users")) loadUsers();
      }
    )
    .subscribe();
}

/* Upload */
const fileDrop = document.getElementById("file-drop");
const fileInput = document.getElementById("video-file");
const fileNameEl = document.getElementById("file-name");
let selectedFile = null;

fileDrop?.addEventListener("click", () => fileInput?.click());
fileDrop?.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDrop.classList.add("dragover");
});
fileDrop?.addEventListener("dragleave", () => fileDrop.classList.remove("dragover"));
fileDrop?.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDrop.classList.remove("dragover");
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput?.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
}

document.getElementById("upload-btn")?.addEventListener("click", async () => {
  if (!currentUser) {
    showToast(t("upload.needLogin"), true);
    location.hash = "upload";
    return;
  }
  if (!selectedFile) {
    showToast(t("upload.drop"), true);
    return;
  }

  const sb = getSupabase();
  const btn = document.getElementById("upload-btn");
  btn.disabled = true;

  try {
    const ext = selectedFile.name.includes(".")
      ? selectedFile.name.slice(selectedFile.name.lastIndexOf("."))
      : ".mp4";
    const storagePath = `${currentUser.id}/${Date.now()}${ext}`;

    const { error: upErr } = await sb.storage
      .from("clips")
      .upload(storagePath, selectedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: selectedFile.type || "video/mp4",
      });
    if (upErr) throw upErr;

    const title =
      document.getElementById("clip-title").value.trim() ||
      selectedFile.name ||
      "Untitled";
    const description = document.getElementById("clip-desc").value.trim();

    const { error: dbErr } = await sb.from("clips").insert({
      user_id: currentUser.id,
      title: title.slice(0, 120),
      description: description.slice(0, 500),
      storage_path: storagePath,
      original_name: selectedFile.name,
      mime_type: selectedFile.type,
      file_size: selectedFile.size,
    });
    if (dbErr) throw dbErr;

    showToast(t("upload.success"));
    selectedFile = null;
    fileNameEl.textContent = "";
    document.getElementById("clip-title").value = "";
    document.getElementById("clip-desc").value = "";
    location.hash = "clips";
  } catch (err) {
    console.error(err);
    showToast(t("upload.fail"), true);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("clip-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "clip-modal") closeModal();
});

function closeModal() {
  document.getElementById("clip-modal").classList.remove("open");
  const v = document.getElementById("modal-video");
  v.pause();
  v.removeAttribute("src");
}

document.getElementById("menu-toggle")?.addEventListener("click", () => {
  document.getElementById("nav-links").classList.toggle("mobile-open");
});

window.addEventListener("hashchange", navigate);

async function boot() {
  const sb = getSupabase();
  if (!sb) {
    showToast("Add Supabase keys — see SUPABASE-HOSTING.md", true);
    return;
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) {
      const loader = document.getElementById("login-loader");
      loader?.classList.add("show");
      await syncProfile(session.user);
      setTimeout(() => loader?.classList.remove("show"), 1200);
      showToast(t("login.ok"));
    }
    await fetchMe();
  });

  initRealtime();
  navigate();
  await fetchMe();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
