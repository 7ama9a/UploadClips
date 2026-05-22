import type { Config, Context } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getStore } from "@netlify/blobs";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles, clips, likes } from "../../db/schema.js";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const method = req.method;

  // Set up common CORS headers just in case of local/preview differences, but keep it simple
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  try {
    // 1. GET /api/video - Serve video file from Netlify Blobs
    if (method === "GET" && url.pathname === "/api/video") {
      const path = url.searchParams.get("path");
      if (!path) {
        return new Response(JSON.stringify({ error: "Missing path" }), { status: 400, headers });
      }

      const store = getStore("clips");
      const metadata = await store.getMetadata(path);
      const contentType = metadata?.metadata?.contentType || "video/mp4";

      const stream = await store.get(path, { type: "stream" });
      if (!stream) {
        return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers });
      }

      return new Response(stream, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000",
        }
      });
    }

    // 2. GET /api/me - Fetch authenticated user & upsert profile
    if (method === "GET" && url.pathname === "/api/me") {
      const user = await getUser();
      if (!user) {
        return new Response(JSON.stringify({ user: null }), { status: 200, headers });
      }

      const metadata = user.user_metadata || {};
      const username = metadata.full_name || metadata.name || metadata.preferred_username || user.email?.split("@")[0] || "user";
      const avatarUrl = metadata.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png";

      // Upsert profile in Database
      await db.insert(profiles).values({
        id: user.id,
        username,
        avatarUrl,
      }).onConflictDoUpdate({
        target: profiles.id,
        set: { username, avatarUrl }
      });

      return new Response(JSON.stringify({
        id: user.id,
        username,
        avatar: avatarUrl,
      }), { status: 200, headers });
    }

    // 3. GET /api/clips - List clips (optionally filtered by user_id)
    if (method === "GET" && url.pathname === "/api/clips") {
      const userIdFilter = url.searchParams.get("user_id");
      const user = await getUser();
      const currentUserId = user?.id;

      let query = db
        .select({
          clip: clips,
          author: profiles,
        })
        .from(clips)
        .leftJoin(profiles, eq(clips.userId, profiles.id));

      if (userIdFilter) {
        // @ts-ignore
        query = query.where(eq(clips.userId, userIdFilter));
      }

      // @ts-ignore
      const allClips = await query.orderBy(desc(clips.createdAt));
      const allLikes = await db.select().from(likes);

      const results = allClips.map(({ clip, author }) => {
        const clipLikes = allLikes.filter(l => l.clipId === clip.id);
        const liked = currentUserId ? clipLikes.some(l => l.userId === currentUserId) : false;
        return {
          id: clip.id,
          title: clip.title,
          description: clip.description,
          videoUrl: `/api/video?path=${encodeURIComponent(clip.storagePath)}`,
          views: clip.views,
          likes: clipLikes.length,
          liked,
          createdAt: clip.createdAt,
          author: {
            id: author?.id || clip.userId,
            username: author?.username || "user",
            avatar: author?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png",
          }
        };
      });

      return new Response(JSON.stringify(results), { status: 200, headers });
    }

    // 4. POST /api/clips - Create new clip (multipart/form-data)
    if (method === "POST" && url.pathname === "/api/clips") {
      const user = await getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }

      const formData = await req.formData();
      const file = formData.get("video") as File;
      const title = (formData.get("title") as string) || "Untitled";
      const description = (formData.get("description") as string) || "";

      if (!file) {
        return new Response(JSON.stringify({ error: "Missing video file" }), { status: 400, headers });
      }

      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".mp4";
      const storagePath = `${user.id}/${Date.now()}${ext}`;
      const fileBuffer = await file.arrayBuffer();

      // Store in Netlify Blobs
      const store = getStore("clips");
      await store.set(storagePath, fileBuffer, {
        metadata: { contentType: file.type || "video/mp4" }
      });

      // Insert clip in Database
      const [newClip] = await db.insert(clips).values({
        userId: user.id,
        title: title.substring(0, 120),
        description: description.substring(0, 500),
        storagePath,
        originalName: file.name,
        mimeType: file.type || "video/mp4",
        fileSize: String(file.size),
      }).returning();

      return new Response(JSON.stringify(newClip), { status: 201, headers });
    }

    // 5. POST /api/clips/:id/like - Toggle like on a clip
    if (method === "POST" && url.pathname.startsWith("/api/clips/") && url.pathname.endsWith("/like")) {
      const user = await getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }

      const match = url.pathname.match(/\/api\/clips\/([^/]+)\/like/);
      const clipId = match ? match[1] : null;
      if (!clipId) {
        return new Response(JSON.stringify({ error: "Missing clip ID" }), { status: 400, headers });
      }

      const existingLike = await db
        .select()
        .from(likes)
        .where(and(eq(likes.clipId, clipId), eq(likes.userId, user.id)))
        .limit(1);

      if (existingLike.length > 0) {
        await db
          .delete(likes)
          .where(and(eq(likes.clipId, clipId), eq(likes.userId, user.id)));
        return new Response(JSON.stringify({ liked: false }), { status: 200, headers });
      } else {
        await db.insert(likes).values({
          clipId,
          userId: user.id,
        });
        return new Response(JSON.stringify({ liked: true }), { status: 200, headers });
      }
    }

    // 6. POST /api/clips/:id/view - Increment views on a clip
    if (method === "POST" && url.pathname.startsWith("/api/clips/") && url.pathname.endsWith("/view")) {
      const match = url.pathname.match(/\/api\/clips\/([^/]+)\/view/);
      const clipId = match ? match[1] : null;
      if (!clipId) {
        return new Response(JSON.stringify({ error: "Missing clip ID" }), { status: 400, headers });
      }

      const [updated] = await db
        .update(clips)
        .set({ views: sql`${clips.views} + 1` })
        .where(eq(clips.id, clipId))
        .returning();

      return new Response(JSON.stringify({ views: updated?.views || 0 }), { status: 200, headers });
    }

    // 7. GET /api/users - List all users
    if (method === "GET" && url.pathname === "/api/users") {
      const allProfiles = await db
        .select()
        .from(profiles)
        .orderBy(desc(profiles.joinedAt));

      const allClips = await db.select({ userId: clips.userId }).from(clips);
      const counts: Record<string, number> = {};
      allClips.forEach(c => {
        counts[c.userId] = (counts[c.userId] || 0) + 1;
      });

      const results = allProfiles.map(p => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatarUrl,
        joined_at: p.joinedAt,
        clips_count: counts[p.id] || 0,
      }));

      return new Response(JSON.stringify(results), { status: 200, headers });
    }

    // 8. GET /api/users/:id - Fetch single user profile
    if (method === "GET" && url.pathname.startsWith("/api/users/")) {
      const match = url.pathname.match(/\/api\/users\/([^/]+)/);
      const userId = match ? match[1] : null;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user ID" }), { status: 400, headers });
      }

      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      if (!profile) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers });
      }

      return new Response(JSON.stringify({
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        joined_at: profile.joinedAt,
      }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers });
  } catch (err: any) {
    console.error("API error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/*",
};
