require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = (process.env.FRONTEND_URL || BASE_URL).replace(/\/$/, "");
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || BASE_URL).replace(/\/$/, "");
const JWT_SECRET = process.env.SESSION_SECRET || "7upload-secret-change-me";
const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(__dirname, "uploads");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

[UPLOADS_DIR, DATA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const db = new Database(path.join(DATA_DIR, "clips.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar TEXT,
    discriminator TEXT,
    joined_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    file_size INTEGER,
    views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS likes (
    clip_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (clip_id, user_id),
    FOREIGN KEY (clip_id) REFERENCES clips(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const app = express();
const server = http.createServer(app);
const allowedOrigins = [FRONTEND_URL, BASE_URL, API_PUBLIC_URL].filter(
  (v, i, a) => v && a.indexOf(v) === i
);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

if (isProd) app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

function getUserId(req) {
  if (req.user?.id) return req.user.id;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    return payload.sub;
  } catch {
    return null;
  }
}

function getUser(req) {
  const id = getUserId(req);
  if (!id) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

app.use((req, _res, next) => {
  req.dbUser = () => getUser(req);
  next();
});
app.use(
  session({
    secret: process.env.SESSION_SECRET || "7upload-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProd,
      sameSite: "lax",
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  done(null, user || false);
});

function upsertDiscordUser(profile) {
  const existing = db
    .prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(profile.id);
  if (existing) {
    db.prepare(
      "UPDATE users SET username = ?, avatar = ?, discriminator = ? WHERE discord_id = ?"
    ).run(
      profile.username,
      profile.avatar,
      profile.discriminator || "0",
      profile.id
    );
    return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(profile.id);
  }
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, discord_id, username, avatar, discriminator) VALUES (?, ?, ?, ?, ?)"
  ).run(
    id,
    profile.id,
    profile.username,
    profile.avatar,
    profile.discriminator || "0"
  );
  io.emit("user:joined", { id, username: profile.username });
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL || `${BASE_URL}/auth/discord/callback`,
        scope: ["identify"],
      },
      (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = upsertDiscordUser(profile);
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage });

function avatarUrl(user) {
  if (!user?.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.${ext}`;
}

function clipRowToJson(row, currentUserId) {
  const author = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  const likeCount = db
    .prepare("SELECT COUNT(*) as c FROM likes WHERE clip_id = ?")
    .get(row.id).c;
  const liked =
    currentUserId &&
    db
      .prepare("SELECT 1 FROM likes WHERE clip_id = ? AND user_id = ?")
      .get(row.id, currentUserId);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoUrl: `${API_PUBLIC_URL}/uploads/${row.filename}`,
    views: row.views,
    likes: likeCount,
    liked: !!liked,
    createdAt: row.created_at,
    author: author
      ? {
          id: author.id,
          username: author.username,
          avatar: avatarUrl(author),
        }
      : null,
  };
}

function requireAuth(req, res, next) {
  if (req.isAuthenticated() || getUserId(req)) return next();
  res.status(401).json({ error: "Login required" });
}

app.get("/auth/discord", (req, res, next) => {
  if (!process.env.DISCORD_CLIENT_ID) {
    return res.status(503).send("Discord OAuth not configured. See README.");
  }
  passport.authenticate("discord")(req, res, next);
});

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", {
    failureRedirect: `${FRONTEND_URL}/?login=failed`,
  }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${FRONTEND_URL}/?login=success&token=${token}`);
  }
);

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect(`${FRONTEND_URL}/`);
  });
});

app.get("/api/me", (req, res) => {
  const user = req.user || req.dbUser();
  if (!user) return res.json({ user: null });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: avatarUrl(user),
      discordId: user.discord_id,
    },
  });
});

app.get("/api/users", (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM clips c WHERE c.user_id = u.id) as clip_count
       FROM users u ORDER BY u.joined_at DESC`
    )
    .all();
  res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: avatarUrl(u),
      clipCount: u.clip_count,
      joinedAt: u.joined_at,
    })),
  });
});

app.get("/api/users/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const clips = db
    .prepare("SELECT * FROM clips WHERE user_id = ? ORDER BY created_at DESC")
    .all(user.id)
    .map((row) => clipRowToJson(row, getUserId(req)));
  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: avatarUrl(user),
      joinedAt: user.joined_at,
    },
    clips,
  });
});

app.get("/api/clips", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM clips ORDER BY created_at DESC")
    .all();
  res.json({
    clips: rows.map((row) => clipRowToJson(row, getUserId(req))),
  });
});

app.get("/api/clips/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM clips WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE clips SET views = views + 1 WHERE id = ?").run(row.id);
  row.views += 1;
  const clip = clipRowToJson(row, getUserId(req));
  io.emit("clip:view", { id: row.id, views: row.views });
  res.json({ clip });
});

app.post("/api/clips", requireAuth, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video file required" });
  const id = uuidv4();
  const title = (req.body.title || req.file.originalname || "Untitled").slice(0, 120);
  const description = (req.body.description || "").slice(0, 500);
  db.prepare(
    `INSERT INTO clips (id, user_id, title, description, filename, original_name, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    getUserId(req),
    title,
    description,
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size
  );
  const row = db.prepare("SELECT * FROM clips WHERE id = ?").get(id);
  const uid = getUserId(req);
  const clip = clipRowToJson(row, uid);
  io.emit("clip:new", clip);
  res.json({ clip });
});

app.post("/api/clips/:id/like", requireAuth, (req, res) => {
  const uid = getUserId(req);
  const clip = db.prepare("SELECT * FROM clips WHERE id = ?").get(req.params.id);
  if (!clip) return res.status(404).json({ error: "Not found" });
  const existing = db
    .prepare("SELECT 1 FROM likes WHERE clip_id = ? AND user_id = ?")
    .get(clip.id, uid);
  if (existing) {
    db.prepare("DELETE FROM likes WHERE clip_id = ? AND user_id = ?").run(
      clip.id,
      uid
    );
  } else {
    db.prepare("INSERT INTO likes (clip_id, user_id) VALUES (?, ?)").run(
      clip.id,
      uid
    );
  }
  const likes = db
    .prepare("SELECT COUNT(*) as c FROM likes WHERE clip_id = ?")
    .get(clip.id).c;
  const liked = !!db
    .prepare("SELECT 1 FROM likes WHERE clip_id = ? AND user_id = ?")
    .get(clip.id, uid);
  io.emit("clip:like", { id: clip.id, likes, liked });
  res.json({ likes, liked });
});

app.use("/uploads", express.static(UPLOADS_DIR));

if (process.env.SERVE_STATIC !== "false") {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
}

io.on("connection", () => {});

server.listen(PORT, () => {
  console.log(`7Upload running at ${BASE_URL}`);
  if (!process.env.DISCORD_CLIENT_ID) {
    console.warn("Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env for login.");
  }
});
