// backend/src/worker.js
// Minimal backend for AI-powered post scheduler (Facebook + Instagram) on Cloudflare Workers + D1.
//
// Features:
// - REST API for posts: list/create/update
// - AI caption endpoint using OpenAI Chat Completions
// - Optional upload to R2 + serving media via the same Worker
// - Cron scheduler that publishes due posts to Meta Graph API

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

let schemaReady = false;
let schemaCheckPromise = null;

async function ensureSchema(env) {
  if (schemaReady) return;
  if (schemaCheckPromise) return schemaCheckPromise;

  schemaCheckPromise = (async () => {
    // Base table (for fresh DBs)
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        title TEXT,
        image_url TEXT NOT NULL,
        caption TEXT,
        hashtags TEXT,
        platforms TEXT NOT NULL,
        scheduled_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        published_at INTEGER,
        error TEXT,
        log TEXT
      )`
    ).run();

    // Add profile_key column if missing (for existing DB)
    try {
      await env.DB.prepare("ALTER TABLE posts ADD COLUMN profile_key TEXT").run();
      console.log("Added profile_key column to posts table");
    } catch (err) {
      const msg = String(err || "");
      if (!msg.includes("duplicate column") && !msg.includes("duplicate column name")) {
        console.warn("ensureSchema: error adding profile_key column:", err);
      }
    }

    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_posts_status_scheduled ON posts (status, scheduled_at)"
    ).run();

    // Try to add a 'log' column for per-post logs (safe if it already exists)
    try {
      await env.DB.prepare("ALTER TABLE posts ADD COLUMN log TEXT").run();
    } catch (e) {
      // If column already exists, SQLite will throw "duplicate column name", ignore it
      // console.log("log column exists or cannot be added:", e.message);
    }

    schemaReady = true;
    schemaCheckPromise = null;
  })();

  return schemaCheckPromise;
}

function buildCaption(post) {
    const parts = [];
    if (post.caption) parts.push(post.caption);
    if (post.hashtags) parts.push(post.hashtags);
    return parts.join("\n\n");
}

function nowUnix() {
    return Math.floor(Date.now() / 1000);
}

function cleanBaseUrl(value, fallback) {
    if (!value) return fallback;
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const { pathname } = url;
            const method = request.method.toUpperCase();

            if (method === "OPTIONS") {
                return new Response(null, { status: 204, headers: CORS_HEADERS });
            }

            if (pathname === "/api/health") {
                return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
                    headers: JSON_HEADERS,
                });
            }

            if (pathname === "/api/upload" && method === "POST") {
                return handleUpload(request, env);
            }

            if (pathname.startsWith("/media/") && method === "GET") {
                return serveMedia(pathname, env);
            }

            if (pathname === "/api/posts" && method === "GET") {
                await ensureSchema(env);
                return listPosts(env, url);
            }

            if (pathname === "/api/posts" && method === "POST") {
                await ensureSchema(env);
                return createPost(request, env);
            }

      if (pathname.startsWith("/api/posts/")) {
        await ensureSchema(env);
        const parts = pathname.split("/");
        const id = parts[3]; // /api/posts/:id/...
        const tail = parts.slice(4).join("/");

        if (!id) {
          return new Response(JSON.stringify({ error: "Missing post id" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }

        if (tail === "schedule" && method === "POST") {
          return markPostScheduled(id, env);
        }

        if (tail === "cancel" && method === "POST") {
          return cancelPost(id, env);
        }

        if (method === "PUT" && !tail) {
          return updatePost(id, request, env);
        }

        if (method === "GET" && !tail) {
          return getPost(id, env);
        }
      }

            if (pathname === "/api/ai/caption" && method === "POST") {
                return generateCaption(request, env);
            }

            if (pathname === "/api/scheduler/run" && method === "POST") {
                await ensureSchema(env);
                await runScheduler(env);
                return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
            }

            return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
        } catch (err) {
            console.error("Unhandled error in fetch:", err);
            return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
                status: 500,
                headers: JSON_HEADERS,
            });
        }
    },

    async scheduled(event, env, ctx) {
        try {
            await ensureSchema(env);
            await runScheduler(env);
        } catch (err) {
            console.error("Scheduler error:", err);
        }
    },
};

/**
 * DB helpers (D1)
 */

async function listPosts(env, url) {
    const searchParams = url.searchParams;
    const statusFilter = searchParams.get("status");
    let query = "SELECT * FROM posts";
    const binds = [];

    if (statusFilter) {
        query += " WHERE status = ?";
        binds.push(statusFilter);
    }
    query += " ORDER BY scheduled_at ASC";

    const { results } = await env.DB.prepare(query).bind(...binds).all();

    return new Response(JSON.stringify(results || []), { headers: JSON_HEADERS });
}

async function getPost(id, env) {
    const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    if (!row) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

async function createPost(request, env) {
  const body = await request.json();
  const id = crypto.randomUUID();
  const now = nowUnix();

  const {
    title = "",
    imageUrl,
    caption = "",
    hashtags = "",
    platforms = ["fb"],
    scheduledAt,
    status = "scheduled",
    profileKey = "calgary", // NEW: default profile
  } = body || {};

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: "imageUrl is required" }), { status: 400, headers: JSON_HEADERS });
  }

  if (!scheduledAt) {
    return new Response(JSON.stringify({ error: "scheduledAt (unix seconds) is required" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const platformsStr = Array.isArray(platforms) ? platforms.join(",") : String(platforms);
  const scheduledUnix = typeof scheduledAt === "number" ? scheduledAt : Number(scheduledAt);

  await env.DB.prepare(
    `INSERT INTO posts (
        id,
        title,
        image_url,
        caption,
        hashtags,
        platforms,
        scheduled_at,
        status,
        created_at,
        updated_at,
        profile_key
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      title,
      imageUrl,
      caption,
      hashtags,
      platformsStr,
      scheduledUnix,
      status,
      now,
      now,
      profileKey
    )
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return new Response(JSON.stringify(row), { status: 201, headers: JSON_HEADERS });
}

async function updatePost(id, request, env) {
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const body = await request.json();

  const title = body.title ?? existing.title;
  const imageUrl = body.imageUrl ?? existing.image_url;
  const caption = body.caption ?? existing.caption;
  const hashtags = body.hashtags ?? existing.hashtags;
  const platforms = body.platforms
    ? Array.isArray(body.platforms)
      ? body.platforms.join(",")
      : String(body.platforms)
    : existing.platforms;
  const scheduledAt =
    body.scheduledAt !== undefined
      ? typeof body.scheduledAt === "number"
        ? body.scheduledAt
        : Number(body.scheduledAt)
      : existing.scheduled_at;
  const status = body.status ?? existing.status;
  const profileKey = body.profileKey ?? existing.profile_key ?? "calgary";
  const updatedAt = nowUnix();

  await env.DB.prepare(
    `UPDATE posts
     SET title = ?, image_url = ?, caption = ?, hashtags = ?, platforms = ?, scheduled_at = ?, status = ?, updated_at = ?, profile_key = ?
     WHERE id = ?`
  )
    .bind(title, imageUrl, caption, hashtags, platforms, scheduledAt, status, updatedAt, profileKey, id)
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

async function markPostScheduled(id, env) {
    const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
    }

    await env.DB.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?")
        .bind("scheduled", nowUnix(), id)
        .run();

    const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
    return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

async function cancelPost(id, env) {
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  }

  await env.DB.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?")
    .bind("cancelled", nowUnix(), id)
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

/**
 * AI caption generation via OpenAI Chat Completions
 * Expects: { prompt: string, tone?: string, platform?: "fb"|"ig"|"both" }
 */

async function generateCaption(request, env) {
  const apiKey = env.OPENAI_API_KEY || env.OPENAI_KEY || env.OPENAI_TOKEN;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not set (tried OPENAI_API_KEY/OPENAI_KEY/OPENAI_TOKEN)" }),
      {
        status: 400,
        headers: JSON_HEADERS,
      }
    );
  }

  const body = await request.json();
  const { prompt = "", tone = "friendly", platform = "both", profile = "calgary" } = body || {};

  const apiBase = cleanBaseUrl(env.OPENAI_API_BASE, "https://api.openai.com");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  let profileRules = "";
  if (profile === "calgary") {
    profileRules = `
Local SEO focus:
- Talk about Calgary homeowners and nearby areas (Airdrie, Chestermere, Okotoks when natural).
- Include the website "https://popcornceilingremovalcalgary.com" once in a natural way
  (e.g. "Details at popcornceilingremovalcalgary.com").
- Use hashtags like #calgary #yyc plus service terms (#popcornceilingremoval #drywall #interiorpainting).
`;
  } else if (profile === "epf") {
    profileRules = `
Local SEO focus:
- Talk about Mississauga, Oakville, Burlington, Hamilton and the GTA.
- Include the website "https://epfproservices.com" once in a natural way.
- Use hashtags with city + GTA + services (e.g. #mississauga #oakville #gta #popcornceilingremoval #interiorpainting).
`;
  } else if (profile === "wallpaper") {
    profileRules = `
Local SEO focus:
- Wallpaper removal in Toronto / GTA.
- Mention the brand "Wallpaper Removal Pro" and include the website once (e.g. wallpaperremovalpro.com or your real URL).
- Use hashtags around wallpaper removal + GTA (e.g. #wallpaperremoval #gtahomes #toronto).
`;
  }

  const systemPrompt =
    "You are a social media copywriter for a home-improvement company (popcorn ceiling removal, drywall, painting, wallpaper removal). " +
    "Write natural, human captions that sound like a real contractor, not a robot. " +
    "Make each caption feel unique; vary the hook and structure so it doesn't sound like a copy-paste template.";

  const platformLabel =
    platform === "both" ? "Facebook AND Instagram" : platform === "fb" ? "Facebook" : "Instagram";

  const userPrompt = `
Create ONE caption for ${platformLabel}.

Details:
${prompt}

Profile-specific SEO rules:
${profileRules}

Global rules:
- Start with a strong first line that hooks attention (change your hook style from post to post).
- 2–4 short sentences or bullet-style lines (easy to read on phones).
- Include a clear call to action (DM us or visit the website for a quote) but keep it casual and human.
- Add 6–10 hashtags at the end, focused on local city/area + service keywords.
- 2–4 emojis max, only if they feel natural.
- Avoid generic boilerplate like "another happy customer" or "we transformed this space" as the main line; be more specific.
`;

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.9, // more variety
  };

  let res;
  try {
    res = await fetch(`${apiBase}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("OpenAI network error", err);
    return new Response(JSON.stringify({ error: `OpenAI network error: ${err.message || err}` }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error("OpenAI error", res.status, errorText);
    return new Response(JSON.stringify({ error: `OpenAI API error ${res.status}`, detail: errorText }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";

  return new Response(JSON.stringify({ text }), { headers: JSON_HEADERS });
}

/**
 * Scheduler:
 * - Runs via Worker Cron (see wrangler.toml triggers).
 * - Finds posts with status='scheduled' and scheduled_at <= now.
 * - Publishes each post to FB / IG using Meta Graph API.
 */

async function runScheduler(env) {
  const now = nowUnix();

  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE status = ? AND scheduled_at <= ? ORDER BY scheduled_at ASC"
  )
    .bind("scheduled", now)
    .all();

  if (!results || results.length === 0) {
    return;
  }

  console.log(`Scheduler: found ${results.length} posts to publish`);

  for (const post of results) {
    const logs = [];
    const nowTs = nowUnix();

    try {
      const platforms = (post.platforms || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const profileKey = post.profile_key || "calgary";
      const profileConfig = getProfileConfig(env, profileKey);

      if (platforms.includes("fb")) {
        const fbRes = await publishToFacebook(post, env, profileConfig);
        if (fbRes?.ok) {
          logs.push(
            `FB OK: ${new Date(nowTs * 1000).toISOString()} -> ${fbRes.data?.id || JSON.stringify(fbRes.data)}`
          );
        } else {
          logs.push(
            `FB ERROR: ${new Date(nowTs * 1000).toISOString()} -> ${fbRes?.detail || fbRes?.error || ""}`
          );
        }
      }

      if (platforms.includes("ig")) {
        const igRes = await publishToInstagram(post, env, profileConfig);
        if (igRes?.ok) {
          logs.push(
            `IG OK: ${new Date(nowTs * 1000).toISOString()} -> ${igRes.data?.id || JSON.stringify(igRes.data)}`
          );
        } else {
          logs.push(
            `IG ERROR: ${new Date(nowTs * 1000).toISOString()} -> ${igRes?.detail || igRes?.error || ""}`
          );
        }
      }

      const logText = logs.join("\n");

      await env.DB.prepare(
        "UPDATE posts SET status = ?, published_at = ?, updated_at = ?, error = NULL, log = ? WHERE id = ?"
      )
        .bind("published", nowTs, nowTs, logText, post.id)
        .run();
    } catch (err) {
      console.error("Error publishing post", post.id, err);
      const errString = String(err);

      await env.DB.prepare("UPDATE posts SET status = ?, error = ?, updated_at = ?, log = ? WHERE id = ?")
        .bind("failed", errString, nowTs, errString, post.id)
        .run();
    }
  }
}

/**
 * File upload → R2
 * POST /api/upload
 * Body: multipart/form-data with field "file"
 * Returns: { key, url }
 */
async function handleUpload(request, env) {
    if (!env.MEDIA_BUCKET) {
        return new Response(JSON.stringify({ error: "MEDIA_BUCKET not configured" }), {
            status: 500,
            headers: JSON_HEADERS,
        });
    }

    let formData;
    try {
        formData = await request.formData();
    } catch (err) {
        console.error("Error parsing formData in /api/upload:", err);
        return new Response(JSON.stringify({ error: "Invalid form data" }), {
            status: 400,
            headers: JSON_HEADERS,
        });
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
        return new Response(JSON.stringify({ error: "Missing file field" }), {
            status: 400,
            headers: JSON_HEADERS,
        });
    }

    const originalName = file.name || "upload";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const key = `${crypto.randomUUID()}-${safeName}`;

    await env.MEDIA_BUCKET.put(key, file.stream(), {
        httpMetadata: {
            contentType: file.type || "application/octet-stream",
        },
    });

    const base = new URL(request.url).origin;
    const url = `${base}/media/${encodeURIComponent(key)}`;

    return new Response(JSON.stringify({ key, url }), {
        status: 201,
        headers: JSON_HEADERS,
    });
}

/**
 * Serve media from R2
 * GET /media/:key
 */
async function serveMedia(pathname, env) {
    if (!env.MEDIA_BUCKET) {
        return new Response("MEDIA_BUCKET not configured", { status: 500 });
    }

    const key = decodeURIComponent(pathname.replace(/^\/media\//, ""));
    if (!key) {
        return new Response("Missing key", { status: 400 });
    }

    const object = await env.MEDIA_BUCKET.get(key);
    if (!object) {
        return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
}

/**
 * Meta Graph API helpers
 * You must configure these in Cloudflare:
 * - META_GRAPH_VERSION (optional, default v24.0)
 * - META_PAGE_ID
 * - META_PAGE_ACCESS_TOKEN
 * - META_IG_USER_ID
 * - META_IG_ACCESS_TOKEN (or reuse PAGE_ACCESS_TOKEN)
 */

function getGraphConfig(env) {
  const version = env.META_GRAPH_VERSION || "v24.0";
  const base = env.META_GRAPH_BASE || "https://graph.facebook.com";
  return { version, base };
}

function getProfileConfig(env, profileKey) {
  // Default: Calgary (uses your existing env vars)
  if (!profileKey || profileKey === "calgary") {
    return {
      fbPageId: env.META_PAGE_ID, // 807570945780920
      fbToken: env.META_PAGE_ACCESS_TOKEN,
      igUserId: env.META_IG_USER_ID, // 17841477810663121
      igToken: env.META_IG_ACCESS_TOKEN,
    };
  }

  if (profileKey === "epf") {
    return {
      fbPageId: env.META_PAGE_ID_EPF,
      fbToken: env.META_PAGE_ACCESS_TOKEN_EPF,
      igUserId: env.META_IG_USER_ID_EPF,
      igToken: env.META_IG_ACCESS_TOKEN_EPF,
    };
  }

  if (profileKey === "wallpaper") {
    return {
      fbPageId: env.META_PAGE_ID_WALLPAPER,
      fbToken: env.META_PAGE_ACCESS_TOKEN_WALLPAPER,
      igUserId: env.META_IG_USER_ID_WALLPAPER,
      igToken: env.META_IG_ACCESS_TOKEN_WALLPAPER,
    };
  }

  // Fallback to Calgary if unknown key
  return {
    fbPageId: env.META_PAGE_ID,
    fbToken: env.META_PAGE_ACCESS_TOKEN,
    igUserId: env.META_IG_USER_ID,
    igToken: env.META_IG_ACCESS_TOKEN,
  };
}

async function publishToFacebook(post, env, profileConfig) {
  const pageId = profileConfig.fbPageId;
  const token = profileConfig.fbToken;

  console.log("FB publish using PAGE_ID", pageId, "token prefix", token?.slice(0, 10));

  if (!pageId || !token) {
    console.warn("META_PAGE_ID or META_PAGE_ACCESS_TOKEN missing for this profile, skipping FB publish");
    return { ok: false, error: "fb_config_missing" };
  }

  const message = [post.caption || "", post.hashtags || ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  // IMPORTANT: Page endpoint, not /me
  const url = `https://graph.facebook.com/v19.0/${pageId}/photos`;

  const body = new URLSearchParams();
  body.set("url", post.image_url); // must be public URL
  if (message) body.set("caption", message);
  body.set("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Facebook publish error:", res.status, text);
    return { ok: false, error: "fb_error", detail: text };
  }

  console.log("Facebook publish OK:", text);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { ok: true, data };
}

async function publishToInstagram(post, env, profileConfig) {
  const igUserId = profileConfig.igUserId;
  const token = profileConfig.igToken;

  console.log(
    "IG publish using IG_USER_ID",
    igUserId,
    "token prefix",
    token?.slice(0, 10),
    "image_url",
    post.image_url
  );

  if (!igUserId || !token) {
    console.warn("META_IG_USER_ID or META_IG_ACCESS_TOKEN missing for this profile, skipping IG publish");
    return { ok: false, error: "ig_config_missing" };
  }

  // 1) Create media container
  const caption = [post.caption || "", post.hashtags || ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const createUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;

  const createParams = new URLSearchParams();
  createParams.set("image_url", post.image_url); // must be public HTTPS
  if (caption) createParams.set("caption", caption);
  createParams.set("access_token", token);

  const createRes = await fetch(createUrl, {
    method: "POST",
    body: createParams,
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    console.error("IG media create error:", createRes.status, createText);
    return { ok: false, error: "ig_create_error", detail: createText };
  }

  let createData;
  try {
    createData = JSON.parse(createText);
  } catch {
    createData = { raw: createText };
  }

  const creationId = createData.id;
  console.log("IG media container created:", creationId);

  if (!creationId) {
    console.error("IG media container has no id:", createData);
    return { ok: false, error: "ig_no_creation_id", detail: createData };
  }

  // 2) Poll status_code until FINISHED or ERROR (with small waits)
  const statusUrl = `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(
    token
  )}`;

  let statusCode = "IN_PROGRESS";
  const maxAttempts = 5;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusRes = await fetch(statusUrl);
    const statusText = await statusRes.text();

    if (!statusRes.ok) {
      console.error("IG status check error:", statusRes.status, statusText);
      return { ok: false, error: "ig_status_error", detail: statusText };
    }

    let statusData;
    try {
      statusData = JSON.parse(statusText);
    } catch {
      statusData = { raw: statusText };
    }

    statusCode = statusData.status_code || "UNKNOWN";
    console.log(`IG status attempt ${attempt}:`, statusCode);

    if (statusCode === "FINISHED") {
      break;
    }

    if (statusCode === "ERROR") {
      console.error("IG media processing error:", statusData);
      return { ok: false, error: "ig_media_error", detail: statusData };
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (statusCode !== "FINISHED") {
    console.warn("IG media not finished after polling, will try again later:", {
      creationId,
      statusCode,
    });
    return { ok: false, error: "ig_not_ready", creationId, statusCode };
  }

  // 3) Publish the media
  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;

  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const publishRes = await fetch(publishUrl, {
    method: "POST",
    body: publishParams,
  });

  const publishText = await publishRes.text();
  if (!publishRes.ok) {
    console.error("IG publish error:", publishRes.status, publishText);
    return { ok: false, error: "ig_publish_error", detail: publishText };
  }

  console.log("IG publish OK:", publishText);
  let publishData;
  try {
    publishData = JSON.parse(publishText);
  } catch {
    publishData = { raw: publishText };
  }

  return { ok: true, data: publishData };
}
