import {
  getUser,
  oauthLogin,
  logout,
  handleAuthCallback,
  onAuthChange,
  AUTH_EVENTS
} from "https://esm.sh/@netlify/identity";

let currentUser = null;
let clipsCache = [];

const pages = {
  home: document.getElementById("page-home"),
  clips: document.getElementById("page-clips"),
  users: document.getElementById("page-users"),
  upload: document.getElementById("page-upload"),
  profile: document.getElementById("page-profile"),
};

function showToast(msg, isError) {
  const toast = document.getElementById("toast");
  if (!toast) return;
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

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const user = await getUser();
  const token = user?.token?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return fetch(path, { ...options, headers });
}

async function fetchClipsWithMeta(userIdFilter) {
  try {
    const url = userIdFilter ? `/api/clips?user_id=${userIdFilter}` : "/api/clips";
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to fetch clips");
    return await res.json();
  } catch (err) {
    console.error("Error fetching clips:", err);
    return [];
  }
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
    try {
      const res = await apiFetch(`/api/clips/${clip.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("Like failed");
      const data = await res.json();
      
      clip.liked = data.liked;
      if (clip.liked) {
        clip.likes += 1;
      } else {
        clip.likes = Math.max(0, clip.likes - 1);
      }
      
      updateLikeUI(root, clip.likes, clip.liked);
      const cached = clipsCache.find((c) => c.id === clip.id);
      if (cached) {
        cached.likes = clip.likes;
        cached.liked = clip.liked;
      }
    } catch (err) {
      console.error(err);
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
  try {
    const res = await apiFetch("/api/users");
    if (!res.ok) throw new Error("Failed to fetch users");
    const profiles = await res.json();

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
          <p class="meta">${u.clips_count || 0} ${t("profile.clipsCount")}</p>
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
  if (!content || !grid) return;
  content.innerHTML = "";
  grid.innerHTML = "";
  try {
    const res = await apiFetch(`/api/users/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch profile");
    const profile = await res.json();

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
  if (!overlay || !video || !title || !desc || !views || !likeSlot) return;

  try {
    const viewRes = await apiFetch(`/api/clips/${clipId}/view`, { method: "POST" });
    const viewData = await viewRes.json();

    let clip = clipsCache.find((c) => c.id === clipId);
    if (!clip) {
      clipsCache = await fetchClipsWithMeta();
      clip = clipsCache.find((c) => c.id === clipId);
    }
    if (!clip) throw new Error("not found");

    clip.views = viewData.views || (clip.views + 1);
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
  if (!slot) return;
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
    await logout();
    currentUser = null;
    renderAuth(null);
    showToast(t("auth.logout"));
    navigate();
  });
}

async function loginWithDiscord() {
  try {
    oauthLogin("discord");
  } catch (err) {
    console.error("Login redirect failed:", err);
    showToast(t("login.fail"), true);
  }
}

async function fetchMe() {
  try {
    const res = await apiFetch("/api/me");
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data && data.id) {
      currentUser = {
        id: data.id,
        username: data.username,
        avatar: data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
      };
      renderAuth(currentUser);
    } else {
      currentUser = null;
      renderAuth(null);
    }
  } catch {
    currentUser = null;
    renderAuth(null);
  }
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
  if (fileNameEl) fileNameEl.textContent = file.name;
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

  const btn = document.getElementById("upload-btn");
  if (btn) btn.disabled = true;

  try {
    const title =
      document.getElementById("clip-title").value.trim() ||
      selectedFile.name ||
      "Untitled";
    const description = document.getElementById("clip-desc").value.trim();

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("title", title);
    formData.append("description", description);

    const res = await apiFetch("/api/clips", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Upload request failed");

    showToast(t("upload.success"));
    selectedFile = null;
    if (fileNameEl) fileNameEl.textContent = "";
    document.getElementById("clip-title").value = "";
    document.getElementById("clip-desc").value = "";
    location.hash = "clips";
  } catch (err) {
    console.error(err);
    showToast(t("upload.fail"), true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("clip-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "clip-modal") closeModal();
});

function closeModal() {
  const modal = document.getElementById("clip-modal");
  if (modal) modal.classList.remove("open");
  const v = document.getElementById("modal-video");
  if (v) {
    v.pause();
    v.removeAttribute("src");
  }
}

document.getElementById("menu-toggle")?.addEventListener("click", () => {
  document.getElementById("nav-links")?.classList.toggle("mobile-open");
});

window.addEventListener("hashchange", navigate);

async function boot() {
  try {
    // 1. Process potential Netlify Identity callbacks (hash URLs for OAuth redirect, etc.)
    const result = await handleAuthCallback();
    if (result) {
      showToast(t("login.ok"));
    }
  } catch (err) {
    console.error("Auth callback error:", err);
    showToast(t("login.fail"), true);
  }

  // 2. Fetch authenticated user profile and render navigation/auth UI
  await fetchMe();

  // 3. Listen for auth changes to re-fetch/render on login/logout
  onAuthChange(async (event, user) => {
    if (event === AUTH_EVENTS.LOGIN || event === AUTH_EVENTS.TOKEN_REFRESH) {
      await fetchMe();
    } else if (event === AUTH_EVENTS.LOGOUT) {
      currentUser = null;
      renderAuth(null);
    }
    navigate();
  });

  navigate();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
