// backend/src/worker.js
// Minimal backend for AI-powered post scheduler (Facebook + Instagram) on Cloudflare Workers + D1.
//
// Features:
// - REST API for posts: list/create/update
// - AI caption endpoint using OpenAI Chat Completions
// - Cron scheduler that publishes due posts to Meta Graph API
//
// NOTE: This is a starter template. You must:
// - Configure D1 in wrangler.toml and create the DB + apply schema.sql.
// - Add environment variables (OpenAI + Meta tokens) in Cloudflare dashboard or wrangler.
// - Register a Meta app and get proper permissions + long-lived tokens.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method.toUpperCase();

      await ensureSchema(env);

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (pathname === "/api/health") {
        return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
          headers: JSON_HEADERS,
        });
      }

      if (pathname === "/api/posts" && method === "GET") {
        return await listPosts(env, url);
      }

      if (pathname === "/api/posts" && method === "POST") {
        return await createPost(request, env);
      }

      if (pathname.startsWith("/api/posts/")) {
        const id = pathname.split("/")[3]; // /api/posts/:id or /api/posts/:id/schedule
        const tail = pathname.split("/").slice(4).join("/");

        if (!id) {
          return new Response(JSON.stringify({ error: "Missing post id" }), { status: 400, headers: JSON_HEADERS });
        }

        if (tail === "schedule" && method === "POST") {
          return await markPostScheduled(id, env);
        }

        if (method === "PUT") {
          return await updatePost(id, request, env);
        }

        if (method === "GET" && !tail) {
          return await getPost(id, env);
        }
      }

      if (pathname === "/api/ai/caption" && method === "POST") {
        return await generateCaption(request, env);
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
    // Runs from Cron trigger every few minutes.
    try {
      await ensureSchema(env);
      await runScheduler(env);
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  },
};

/**
 * Helpers
 */

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

let schemaReady = false;
let schemaCheckPromise = null;

async function ensureSchema(env) {
  if (schemaReady) return;
  if (schemaCheckPromise) return schemaCheckPromise;

  schemaCheckPromise = (async () => {
    try {
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
          error TEXT
        )`
      ).run();

      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_posts_status_scheduled ON posts (status, scheduled_at)"
      ).run();

      schemaReady = true;
    } catch (err) {
      schemaReady = false;
      console.error("Schema ensure error:", err);
      throw err;
    } finally {
      schemaCheckPromise = null;
    }
  })();

  return schemaCheckPromise;
}

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
    `INSERT INTO posts (id, title, image_url, caption, hashtags, platforms, scheduled_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, title, imageUrl, caption, hashtags, platformsStr, scheduledUnix, status, now, now)
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
  const platforms = body.platforms ? (Array.isArray(body.platforms) ? body.platforms.join(",") : String(body.platforms)) : existing.platforms;
  const scheduledAt = body.scheduledAt !== undefined
    ? (typeof body.scheduledAt === "number" ? body.scheduledAt : Number(body.scheduledAt))
    : existing.scheduled_at;
  const status = body.status ?? existing.status;
  const updatedAt = nowUnix();

  await env.DB.prepare(
    `UPDATE posts
     SET title = ?, image_url = ?, caption = ?, hashtags = ?, platforms = ?, scheduled_at = ?, status = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(title, imageUrl, caption, hashtags, platforms, scheduledAt, status, updatedAt, id)
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

/**
 * AI caption generation via OpenAI Chat Completions
 * Expects: { prompt: string, tone?: string, platform?: "fb"|"ig"|"both" }
 */

async function generateCaption(request, env) {
  const apiKey = env.OPENAI_API_KEY || env.OPENAI_KEY || env.OPENAI_TOKEN;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set (tried OPENAI_API_KEY/OPENAI_KEY/OPENAI_TOKEN)" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const body = await request.json();
  const { prompt = "", tone = "friendly", platform = "both" } = body || {};
  const apiBase = cleanBaseUrl(env.OPENAI_API_BASE, "https://api.openai.com");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const systemPrompt =
    "You are a social media copywriter for a home-improvement company (popcorn ceiling removal, drywall, painting)." +
    " Write natural, human captions that sound like a real contractor, not a robot.";

  const userPrompt = `
Create ONE caption for ${platform === "both" ? "Facebook AND Instagram" : platform === "fb" ? "Facebook" : "Instagram"}.

Details:
${prompt}

Rules:
- Start with a strong first line that hooks attention.
- 2–4 short sentences or bullet-style lines.
- Include a clear call to action (DM or call for quote) but keep it casual.
- Add 6–10 hashtags at the end, mixing local city/area + service keywords.
- No emojis overload: 2–4 max, keep it clean.
`;

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
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
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

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
    try {
      const platforms = (post.platforms || "").split(",").map((p) => p.trim()).filter(Boolean);

      if (platforms.includes("fb")) {
        await publishToFacebook(post, env);
      }
      if (platforms.includes("ig")) {
        await publishToInstagram(post, env);
      }

      await env.DB.prepare(
        "UPDATE posts SET status = ?, published_at = ?, updated_at = ?, error = NULL WHERE id = ?"
      )
        .bind("published", now, now, post.id)
        .run();
    } catch (err) {
      console.error("Error publishing post", post.id, err);
      await env.DB.prepare("UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ?")
        .bind("failed", String(err), now, post.id)
        .run();
    }
  }
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

async function publishToFacebook(post, env) {
  const { version, base } = getGraphConfig(env);
  const pageId = env.META_PAGE_ID;
  const token = env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    throw new Error("META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured");
  }

  const caption = buildCaption(post);

  const endpoint = `${base}/${version}/${pageId}/photos`;
  const body = new URLSearchParams({
    url: post.image_url,
    caption,
    access_token: token,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Facebook API error ${res.status}: ${text}`);
  }

  console.log("Published FB photo for post", post.id, text);
}

async function publishToInstagram(post, env) {
  const { version, base } = getGraphConfig(env);
  const igUserId = env.META_IG_USER_ID;
  const token = env.META_IG_ACCESS_TOKEN || env.META_PAGE_ACCESS_TOKEN;

  if (!igUserId || !token) {
    throw new Error("META_IG_USER_ID or META_IG_ACCESS_TOKEN/PAGE_ACCESS_TOKEN not configured");
  }

  const caption = buildCaption(post);

  // Step 1: create media container
  const mediaEndpoint = `${base}/${version}/${igUserId}/media`;
  const mediaBody = new URLSearchParams({
    image_url: post.image_url,
    caption,
    access_token: token,
  });

  const mediaRes = await fetch(mediaEndpoint, {
    method: "POST",
    body: mediaBody,
  });

  const mediaText = await mediaRes.text();
  if (!mediaRes.ok) {
    throw new Error(`IG media error ${mediaRes.status}: ${mediaText}`);
  }

  let creationId;
  try {
    const parsed = JSON.parse(mediaText);
    creationId = parsed.id;
  } catch {
    throw new Error(`IG media response parse error: ${mediaText}`);
  }

  // Step 2: publish container
  const publishEndpoint = `${base}/${version}/${igUserId}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const publishRes = await fetch(publishEndpoint, {
    method: "POST",
    body: publishBody,
  });

  const publishText = await publishRes.text();
  if (!publishRes.ok) {
    throw new Error(`IG publish error ${publishRes.status}: ${publishText}`);
  }

  console.log("Published IG media for post", post.id, publishText);
}
