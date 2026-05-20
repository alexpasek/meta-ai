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
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS facebook_connections (
        profile_key TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        page_name TEXT,
        page_access_token TEXT NOT NULL,
        page_token_expires_at INTEGER,
        user_id TEXT,
        user_name TEXT,
        user_access_token TEXT,
        user_token_expires_at INTEGER,
        granted_permissions TEXT,
        missing_permissions TEXT,
        token_status TEXT NOT NULL DEFAULT 'unknown',
        reconnect_required INTEGER NOT NULL DEFAULT 0,
        last_checked_at INTEGER,
        last_error TEXT,
        alert_sent_at INTEGER,
        debug_payload TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    ).run();

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS facebook_oauth_states (
        state TEXT PRIMARY KEY,
        profile_key TEXT NOT NULL,
        page_id TEXT,
        return_url TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`
    ).run();

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS meta_maintenance (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      )`
    ).run();

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

      // CORS preflight first
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      // Public media access should bypass auth
      if (pathname.startsWith("/media/") && method === "GET") {
        return serveMedia(pathname, env);
      }

      if (pathname === "/api/meta/oauth/callback" && method === "GET") {
        await ensureSchema(env);
        return handleFacebookOAuthCallback(request, env);
      }

      // Minimal auth: APP_ACCESS_KEY
      const appKey = env.APP_ACCESS_KEY;
      if (appKey) {
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

                if (!token || token !== appKey) {
                    return new Response(JSON.stringify({ error: "unauthorized" }), {
                        status: 401,
                        headers: JSON_HEADERS,
                    });
                }
            }

      if (pathname === "/api/health") {
        return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
          headers: JSON_HEADERS,
        });
      }

            if (pathname === "/api/upload" && method === "POST") {
                return handleUpload(request, env);
            }

            if (pathname === "/api/images" && method === "GET") {
                return listGeneratedImages(request, env);
            }

            if (pathname === "/api/images" && method === "DELETE") {
                return deleteGeneratedImage(request, env);
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
        const segments = pathname.split("/");
        const id = segments[3]; // /api/posts/:id/...
        const tail = segments.slice(4).join("/");

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

        if (tail === "publish-now" && method === "POST") {
          return publishNow(id, env);
        }

        if (tail === "retry" && method === "POST") {
          return retryPost(id, env);
        }

        if (!tail && method === "DELETE") {
          return deletePost(id, env);
        }

        if (!tail && method === "PUT") {
          return updatePost(id, request, env);
        }

        if (!tail && method === "GET") {
          return getPost(id, env);
        }
      }

            if (pathname === "/api/ai/caption" && method === "POST") {
                return generateCaption(request, env);
            }

            if (pathname === "/api/ai/image" && method === "POST") {
                return generateImage(request, env);
            }

            if (pathname === "/api/profile/validate" && method === "POST") {
                return validateProfile(request, env);
            }

            if (pathname === "/api/meta/check-profile" && (method === "POST" || method === "GET")) {
                await ensureSchema(env);
                return validateProfile(request, env);
            }

            if (pathname === "/api/meta/connections" && method === "GET") {
                await ensureSchema(env);
                return listFacebookConnections(env);
            }

            if (pathname === "/api/meta/oauth/start" && method === "POST") {
                await ensureSchema(env);
                return startFacebookOAuth(request, env);
            }

            if (pathname === "/api/meta/check-tokens" && method === "POST") {
                await ensureSchema(env);
                const result = await runDueTokenHealthChecks(env, { force: true });
                return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
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
            await runDueTokenHealthChecks(env);
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

async function deletePost(id, env) {
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  }

  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ ok: true, id }), { headers: JSON_HEADERS });
}

// Manually publish a single post NOW (no new DB columns)
async function publishNow(id, env) {
  await ensureSchema(env);

  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();

  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const now = nowUnix();

  const profileKey = existing.profile_key || "calgary";
  const profileConfig = await getProfileConfig(env, profileKey);

  const platforms = (existing.platforms || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let fbInfo = null;
  let igInfo = null;
  let error = null;

  if (platforms.includes("fb")) {
    try {
      fbInfo = await publishToFacebook(existing, env, profileConfig);
      if (!fbInfo.ok) {
        error = `FB: ${fbInfo.error || "unknown"}`;
      }
    } catch (e) {
      console.error("publishNow FB error:", e);
      error = `FB exception: ${String(e)}`;
    }
  }

  if (platforms.includes("ig")) {
    try {
      igInfo = await publishToInstagram(existing, env, profileConfig);
      if (igInfo && !igInfo.ok && !error) {
        error = `IG: ${igInfo.error || "unknown"}`;
      }
    } catch (e) {
      console.error("publishNow IG error:", e);
      if (!error) error = `IG exception: ${String(e)}`;
    }
  }

  const timestamp = new Date(now * 1000).toISOString();
  const parts = [
    `[POST NOW ${timestamp}]`,
    `profile=${profileKey}`,
    `FB=${fbInfo?.ok ? "OK" : fbInfo?.error || "skip"}`,
    `IG=${igInfo?.ok ? "OK" : igInfo?.error || "skip"}`,
  ];
  if (error) parts.push(`error=${error}`);

  const logEntry = parts.join(" | ");
  const newLog = ((existing.log || "") + "\n" + logEntry).trim();

  const status = error ? "failed" : "published";

  await env.DB.prepare(
    `UPDATE posts
     SET status = ?, published_at = ?, updated_at = ?, error = ?, log = ?
     WHERE id = ?`
  )
    .bind(status, now, now, error, newLog, id)
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();

  return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

async function retryPost(id, env) {
  const existing = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const now = nowUnix();
  const newTime = now + 5 * 60;

  await env.DB.prepare(
    "UPDATE posts SET status = ?, scheduled_at = ?, updated_at = ?, error = NULL, log = NULL WHERE id = ?"
  )
    .bind("scheduled", newTime, now, id)
    .run();

  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  return new Response(JSON.stringify(row), { headers: JSON_HEADERS });
}

/**
 * AI caption generation via OpenAI Chat Completions
 * Expects: { prompt: string, tone?: string, platform?: "fb"|"ig"|"both" }
 */

function describeServiceType(serviceType) {
  switch (serviceType) {
    case "drywall":
      return "drywall installation, taping, mudding, and finishing";
    case "painting":
      return "interior painting for walls, ceilings, trim, and doors";
    case "wallpaper":
      return "wallpaper removal and wall preparation";
    case "baseboard":
      return "baseboard and trim installation";
    default:
      return "popcorn ceiling removal and smooth ceiling finishing";
  }
}

function describeCtaMode(ctaMode) {
  if (ctaMode === "brand") {
    return "Focus on building the brand and encouraging people to follow the page or save the post, not only asking for a quote.";
  }
  if (ctaMode === "review") {
    return "Gently encourage past customers to leave a Google review, without sounding pushy and without adding a raw URL.";
  }
  return "Focus on getting new leads: invite people to DM, call, or request a free quote in a natural, human tone.";
}

async function generateCaption(request, env) {
  const apiKey = env.OPENAI_API_KEY || env.OPENAI_KEY || env.OPENAI_TOKEN;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "OPENAI_API_KEY not set (tried OPENAI_API_KEY/OPENAI_KEY/OPENAI_TOKEN)",
      }),
      {
        status: 400,
        headers: JSON_HEADERS,
      }
    );
  }

  const body = await request.json();
  const {
    prompt: rawPrompt = "",
    tone = "friendly",
    platform = "both",
    profile = "calgary",

    // optional extras (front-end can send these later)
    serviceType,
    ctaMode,
    offerText,
    neighbourhood,
  } = body || {};

  const prompt = String(rawPrompt || "").trim().slice(0, 1800);
  const apiBase = cleanBaseUrl(env.OPENAI_API_BASE, "https://api.openai.com");
  const model = env.OPENAI_MODEL || "gpt-5.5";

  let profileRules = "";
  if (profile === "calgary") {
    profileRules = `
Brand name: "Popcorn Ceiling Removal Calgary".
Location focus: Calgary homeowners and nearby areas such as Airdrie, Chestermere and Okotoks.

Brand/domain rules:
- You may mention the brand "Popcorn Ceiling Removal Calgary".
- You may mention "popcornceilingremovalcalgary.com" ONCE, but ONLY if the prompt explicitly asks you to include a website URL.
- NEVER mention "EPF Pro Services" or "epfproservices.com".
- NEVER mention "Wallpaper Removal Pro" or "wallpaperremovalpro.com".
`;
  } else if (profile === "epf") {
    profileRules = `
Brand name: "EPF Pro Services".
Location focus: Mississauga, Oakville, Burlington, Milton, Hamilton and the GTA.

Brand/domain rules:
- You may mention the brand "EPF Pro Services".
- You may mention "epfproservices.com" ONCE, but ONLY if the prompt explicitly asks you to include a website URL.
- NEVER mention "Popcorn Ceiling Removal Calgary" or "popcornceilingremovalcalgary.com".
- NEVER mention "Wallpaper Removal Pro" or "wallpaperremovalpro.com".
`;
  } else if (profile === "wallpaper") {
    profileRules = `
Brand name: "Wallpaper Removal Pro".
Location focus: Toronto / GTA, wallpaper removal and wall preparation.

Brand/domain rules:
- You may mention the brand "Wallpaper Removal Pro".
- You may mention "wallpaperremovalpro.com" ONCE, but ONLY if the prompt explicitly asks you to include a website URL.
- NEVER mention popcorn ceiling removal as a main service.
- NEVER mention "Popcorn Ceiling Removal Calgary" or "popcornceilingremovalcalgary.com".
- NEVER mention "EPF Pro Services" or "epfproservices.com".
`;
  }

  const platformLabel =
    platform === "both"
      ? "both Facebook and Instagram"
      : platform === "fb"
      ? "Facebook"
      : "Instagram";

  const serviceDescription = serviceType ? describeServiceType(serviceType) : null;
  const ctaDescription = ctaMode ? describeCtaMode(ctaMode) : null;

  const systemPrompt =
    "Write natural local-service social captions for home-improvement contractors. " +
    "Use specific homeowner situations, local service intent, and plain contractor language. " +
    "Avoid generic AI marketing phrases, repeated hooks, and keyword stuffing.";

  const userPrompt = `
Write ONE single caption that can be used on ${platformLabel}.

Business / service context (if provided):
${serviceDescription ? `- Service: ${serviceDescription}.` : ""}
${ctaDescription ? `- Call-to-action style: ${ctaDescription}` : ""}
${neighbourhood ? `- Neighbourhood / area mentioned: ${neighbourhood}.` : ""}

Details from the UI / user:
${prompt}

Profile-specific rules:
${profileRules}

Formatting rules:
- Output ONLY the caption text (no markdown, no headings).
- Write 2–4 short sentences unless the UI asks for shorter.
- Make it sound like a local contractor wrote it after seeing a real job or a real homeowner request.
- Include one natural local SEO phrase when it fits, but do not repeat the same service/city wording twice.
- Use practical details when relevant: floor protection, dust control, skim coat, drywall repair, smooth finish, fresh paint, wallpaper backing, move-in timing, listing prep, or cleanup.
- Vary the opening and CTA. Do not always start with a problem and do not always end with the same "DM for a quote" wording.
- Do NOT include website URLs or hashtags unless explicitly requested.
- Keep the tone ${tone}, friendly and human – like a local contractor talking to homeowners.
`;

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: Number(env.OPENAI_CAPTION_MAX_TOKENS || 240),
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
    return new Response(
      JSON.stringify({ error: `OpenAI network error: ${err.message || err}` }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error("OpenAI error", res.status, errorText);
    return new Response(
      JSON.stringify({
        error: `OpenAI API error ${res.status}`,
        detail: errorText,
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";

  return new Response(JSON.stringify({ text }), { headers: JSON_HEADERS });
}
async function generateImage(request, env) {
  const apiKey = env.OPENAI_API_KEY || env.OPENAI_KEY || env.OPENAI_TOKEN;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not set (tried OPENAI_API_KEY/OPENAI_KEY/OPENAI_TOKEN)",
      }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  if (!env.MEDIA_BUCKET) {
    return new Response(
      JSON.stringify({
        error: "MEDIA_BUCKET (R2) not configured for image storage",
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  const body = await request.json();
  const prompt = (body?.prompt || "").trim().slice(0, 1200);
  const requestedCount = Number(body?.count || 1);
  const count = Math.min(6, Math.max(1, Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 1));

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const apiBase = cleanBaseUrl(env.OPENAI_API_BASE, "https://api.openai.com");
  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const size = env.OPENAI_IMAGE_SIZE || "1024x1024";
  const quality = env.OPENAI_IMAGE_QUALITY || "low";

  const generated = [];

  for (let index = 0; index < count; index++) {
    const payload = {
      model,
      prompt,
      n: 1,
      size,
      quality,
    };

    let res;
    try {
      res = await fetch(`${apiBase}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("OpenAI image network error", err);
      return new Response(
        JSON.stringify({
          error: `OpenAI image network error: ${err.message || err}`,
          generated,
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    const rawText = await res.text();
    if (!res.ok) {
      console.error("OpenAI image error", res.status, rawText);
      return new Response(
        JSON.stringify({
          error: `OpenAI image API error ${res.status}`,
          detail: rawText,
          generated,
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse OpenAI image JSON", e, rawText);
      return new Response(
        JSON.stringify({
          error: "Failed to parse OpenAI image response",
          generated,
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    const img = data?.data?.[0];
    if (!img) {
      console.error("OpenAI image response missing data", data);
      return new Response(
        JSON.stringify({
          error: "OpenAI image response missing data[0]",
          detail: data,
          generated,
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    let bytes;
    let contentType = "image/png";

    if (img.b64_json) {
      const binaryStr = atob(img.b64_json);
      const len = binaryStr.length;
      const arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = binaryStr.charCodeAt(i);
      }
      bytes = arr;
    } else if (img.url) {
      const imgRes = await fetch(img.url);
      if (!imgRes.ok) {
        const t = await imgRes.text();
        console.error("Error fetching image URL from OpenAI:", img.url, t);
        return new Response(
          JSON.stringify({
            error: "Failed to download image from OpenAI URL",
            detail: t,
            generated,
          }),
          { status: 500, headers: JSON_HEADERS }
        );
      }
      const buf = await imgRes.arrayBuffer();
      bytes = new Uint8Array(buf);
      const ct = imgRes.headers.get("content-type");
      if (ct) contentType = ct;
    } else {
      console.error("OpenAI image: no b64_json or url found", img);
      return new Response(
        JSON.stringify({
          error: "No b64_json or url in OpenAI image response",
          detail: img,
          generated,
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    const safePrompt = prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)
      .replace(/^-|-$/g, "");
    const createdAt = new Date().toISOString();
    const key = `generated/${crypto.randomUUID()}-${safePrompt || "ai-image"}.png`;

    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        prompt: prompt.slice(0, 500),
        createdAt,
        model,
        size,
        quality,
      },
    });

    const base = new URL(request.url).origin;
    generated.push({
      url: `${base}/media/${encodeURIComponent(key)}`,
      key,
      prompt,
      createdAt,
      model,
      size,
      quality,
      index,
    });
  }

  return new Response(
    JSON.stringify({
      url: generated[0]?.url,
      key: generated[0]?.key,
      prompt,
      images: generated,
    }),
    { status: 200, headers: JSON_HEADERS }
  );
}

async function listGeneratedImages(request, env) {
  if (!env.MEDIA_BUCKET) {
    return new Response(JSON.stringify({ error: "MEDIA_BUCKET not configured" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 60)));
  const listed = await env.MEDIA_BUCKET.list({
    prefix: "generated/",
    limit,
    include: ["customMetadata"],
  });

  const base = url.origin;
  const images = (listed.objects || [])
    .map((object) => ({
      key: object.key,
      url: `${base}/media/${encodeURIComponent(object.key)}`,
      size: object.size,
      uploaded: object.uploaded ? new Date(object.uploaded).toISOString() : null,
      prompt: object.customMetadata?.prompt || "",
      createdAt: object.customMetadata?.createdAt || (object.uploaded ? new Date(object.uploaded).toISOString() : null),
      model: object.customMetadata?.model || "",
      imageSize: object.customMetadata?.size || "",
      quality: object.customMetadata?.quality || "",
    }))
    .sort((a, b) => String(b.createdAt || b.uploaded || "").localeCompare(String(a.createdAt || a.uploaded || "")));

  return new Response(JSON.stringify({ images }), { headers: JSON_HEADERS });
}

async function deleteGeneratedImage(request, env) {
  if (!env.MEDIA_BUCKET) {
    return new Response(JSON.stringify({ error: "MEDIA_BUCKET not configured" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const url = new URL(request.url);
  let key = url.searchParams.get("key") || "";
  if (!key) {
    try {
      const body = await request.json();
      key = body?.key || "";
    } catch {
      // ignore
    }
  }

  key = String(key || "");
  if (!key.startsWith("generated/")) {
    return new Response(
      JSON.stringify({ error: "Only generated images can be deleted from this endpoint" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  await env.MEDIA_BUCKET.delete(key);
  return new Response(JSON.stringify({ ok: true, key }), { headers: JSON_HEADERS });
}

/**
 * Validate a profile's configured FB/IG credentials by hitting the Graph API.
 * Does not modify scheduler or publish behavior.
 */
async function validateProfile(request, env) {
  let profileKey = "calgary";

  if (request.method === "GET") {
    const url = new URL(request.url);
    const keyParam = url.searchParams.get("key") || url.searchParams.get("profileKey");
    if (keyParam) profileKey = keyParam;
  } else {
    try {
      const body = await request.json();
      profileKey = body?.profileKey || profileKey;
    } catch {
      // ignore
    }
  }

  profileKey = profileKey.trim().toLowerCase();
  const cfg = await getProfileConfig(env, profileKey);

  const fbConfigured = !!(cfg.fbPageId && cfg.fbToken);
  const igConfigured = !!(cfg.igUserId && cfg.igToken);

  const fb = {
    configured: fbConfigured,
    source: cfg.fbSource || "env",
    tokenStatus: cfg.fbConnection?.token_status,
    reconnectRequired: !!cfg.fbConnection?.reconnect_required,
    connectedUser: cfg.fbConnection?.user_id
      ? { id: cfg.fbConnection.user_id, name: cfg.fbConnection.user_name || "" }
      : null,
    grantedPermissions: parseJsonArray(cfg.fbConnection?.granted_permissions),
    missingPermissions: parseJsonArray(cfg.fbConnection?.missing_permissions),
    pageName: cfg.fbConnection?.page_name || null,
    lastCheckedAt: cfg.fbConnection?.last_checked_at || null,
    lastError: cfg.fbConnection?.last_error || null,
  };
  const ig = { configured: igConfigured };

  if (fbConfigured) {
    const fbUrl = `https://graph.facebook.com/v19.0/${cfg.fbPageId}?fields=id,name&access_token=${encodeURIComponent(
      cfg.fbToken
    )}`;
    try {
      const res = await fetch(fbUrl);
      const text = await res.text();
      if (!res.ok) {
        fb.ok = false;
        fb.error = "fb_lookup_failed";
        fb.detail = text;
      } else {
        fb.ok = true;
        try {
          fb.data = JSON.parse(text);
        } catch {
          fb.data = { raw: text };
        }
      }
    } catch (err) {
      fb.ok = false;
      fb.error = "fb_network_error";
      fb.detail = String(err);
    }
  }

  if (igConfigured) {
    const igUrl = `https://graph.facebook.com/v19.0/${cfg.igUserId}?fields=id,username&access_token=${encodeURIComponent(
      cfg.igToken
    )}`;
    try {
      const res = await fetch(igUrl);
      const text = await res.text();
      if (!res.ok) {
        ig.ok = false;
        ig.error = "ig_lookup_failed";
        ig.detail = text;
      } else {
        ig.ok = true;
        try {
          ig.data = JSON.parse(text);
        } catch {
          ig.data = { raw: text };
        }
      }
    } catch (err) {
      ig.ok = false;
      ig.error = "ig_network_error";
      ig.detail = String(err);
    }
  }

  const result = {
    profileKey,
    fb,
    ig,
    connection: sanitizeConnection(cfg.fbConnection),
  };

  return new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS });
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
    let publishError = null;

    try {
      const platforms = (post.platforms || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const profileKey = post.profile_key || "calgary";
      const profileConfig = await getProfileConfig(env, profileKey);

      if (platforms.includes("fb")) {
        const fbRes = await publishToFacebook(post, env, profileConfig);
        if (fbRes?.ok) {
          logs.push(
            `FB OK: ${new Date(nowTs * 1000).toISOString()} -> ${fbRes.data?.id || JSON.stringify(fbRes.data)}`
          );
        } else {
          publishError = publishError || `FB: ${fbRes?.detail || fbRes?.error || "unknown"}`;
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
          publishError = publishError || `IG: ${igRes?.detail || igRes?.error || "unknown"}`;
          logs.push(
            `IG ERROR: ${new Date(nowTs * 1000).toISOString()} -> ${igRes?.detail || igRes?.error || ""}`
          );
        }
      }

      const logText = logs.join("\n");

      const nextStatus = publishError ? "failed" : "published";
      await env.DB.prepare(
        "UPDATE posts SET status = ?, published_at = ?, updated_at = ?, error = ?, log = ? WHERE id = ?"
      )
        .bind(nextStatus, publishError ? null : nowTs, nowTs, publishError, logText, post.id)
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

function graphUrl(env, path) {
  const { base, version } = getGraphConfig(env);
  return `${base}/${version}${path}`;
}

const REQUIRED_FACEBOOK_PAGE_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
];

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeConnection(row) {
  if (!row) return null;
  return {
    profileKey: row.profile_key,
    pageId: row.page_id,
    pageName: row.page_name,
    pageTokenExpiresAt: row.page_token_expires_at,
    userId: row.user_id,
    userName: row.user_name,
    userTokenExpiresAt: row.user_token_expires_at,
    grantedPermissions: parseJsonArray(row.granted_permissions),
    missingPermissions: parseJsonArray(row.missing_permissions),
    tokenStatus: row.token_status,
    reconnectRequired: !!row.reconnect_required,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    alertSentAt: row.alert_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFacebookConnection(env, profileKey) {
  return env.DB.prepare("SELECT * FROM facebook_connections WHERE profile_key = ?")
    .bind((profileKey || "calgary").toLowerCase())
    .first();
}

async function getProfileConfig(env, profileKey) {
  const key = (profileKey || "calgary").toLowerCase();
  const connection = await getFacebookConnection(env, key);
  const connectedFb = connection && connection.page_id && connection.page_access_token
    ? {
        fbPageId: connection.page_id,
        fbToken: connection.page_access_token,
        fbSource: "db",
        fbConnection: connection,
      }
    : {};

  // 1) Backward-compatible known profiles
  if (key === "calgary") {
    return {
      fbPageId: connectedFb.fbPageId || env.META_PAGE_ID,
      fbToken: connectedFb.fbToken || env.META_PAGE_ACCESS_TOKEN,
      fbSource: connectedFb.fbSource || "env",
      fbConnection: connection,
      igUserId: env.META_IG_USER_ID,
      igToken: env.META_IG_ACCESS_TOKEN,
    };
  }

  if (key === "epf") {
    return {
      fbPageId: connectedFb.fbPageId || env.META_PAGE_ID_EPF,
      fbToken: connectedFb.fbToken || env.META_PAGE_ACCESS_TOKEN_EPF,
      fbSource: connectedFb.fbSource || "env",
      fbConnection: connection,
      igUserId: env.META_IG_USER_ID_EPF,
      igToken: env.META_IG_ACCESS_TOKEN_EPF,
    };
  }

  if (key === "wallpaper") {
    return {
      fbPageId: connectedFb.fbPageId || env.META_PAGE_ID_WALLPAPER,
      fbToken: connectedFb.fbToken || env.META_PAGE_ACCESS_TOKEN_WALLPAPER,
      fbSource: connectedFb.fbSource || "env",
      fbConnection: connection,
      igUserId: env.META_IG_USER_ID_WALLPAPER,
      igToken: env.META_IG_ACCESS_TOKEN_WALLPAPER,
    };
  }

  // 2) Generic pattern for NEW profiles:
  //    META_PAGE_ID_MYBRAND
  //    META_PAGE_ACCESS_TOKEN_MYBRAND
  //    META_IG_USER_ID_MYBRAND
  //    META_IG_ACCESS_TOKEN_MYBRAND
  const upper = key.toUpperCase();

  const fbPageId = env[`META_PAGE_ID_${upper}`];
  const fbToken = env[`META_PAGE_ACCESS_TOKEN_${upper}`];
  const igUserId = env[`META_IG_USER_ID_${upper}`];
  const igToken = env[`META_IG_ACCESS_TOKEN_${upper}`];

  if (fbPageId || fbToken || igUserId || igToken) {
    // If any of the specific vars exist, build config using them
    return {
      fbPageId: connectedFb.fbPageId || fbPageId || env.META_PAGE_ID,
      fbToken: connectedFb.fbToken || fbToken || env.META_PAGE_ACCESS_TOKEN,
      fbSource: connectedFb.fbSource || "env",
      fbConnection: connection,
      igUserId: igUserId || env.META_IG_USER_ID,
      igToken: igToken || env.META_IG_ACCESS_TOKEN,
    };
  }

  // 3) Fallback to Calgary if unknown key and no profile-specific env
  return {
    fbPageId: connectedFb.fbPageId || env.META_PAGE_ID,
    fbToken: connectedFb.fbToken || env.META_PAGE_ACCESS_TOKEN,
    fbSource: connectedFb.fbSource || "env",
    fbConnection: connection,
    igUserId: env.META_IG_USER_ID,
    igToken: env.META_IG_ACCESS_TOKEN,
  };
}

function getAppAccessToken(env) {
  if (env.META_APP_ACCESS_TOKEN) return env.META_APP_ACCESS_TOKEN;
  if (env.META_APP_ID && env.META_APP_SECRET) return `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  return "";
}

function getOAuthRedirectUri(request, env) {
  return env.META_OAUTH_REDIRECT_URI || `${new URL(request.url).origin}/api/meta/oauth/callback`;
}

async function listFacebookConnections(env) {
  const { results } = await env.DB.prepare("SELECT * FROM facebook_connections ORDER BY profile_key ASC").all();
  return new Response(JSON.stringify((results || []).map(sanitizeConnection)), { headers: JSON_HEADERS });
}

async function startFacebookOAuth(request, env) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    return new Response(JSON.stringify({ error: "meta_app_not_configured" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const body = await request.json().catch(() => ({}));
  const profileKey = String(body.profileKey || "calgary").trim().toLowerCase();
  const cfg = await getProfileConfig(env, profileKey);
  const pageId = String(body.pageId || cfg.fbPageId || "").trim();
  const returnUrl = String(body.returnUrl || "").trim();
  const state = crypto.randomUUID();
  const now = nowUnix();

  await env.DB.prepare(
    `INSERT INTO facebook_oauth_states (state, profile_key, page_id, return_url, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(state, profileKey, pageId || null, returnUrl || null, now, now + 10 * 60)
    .run();

  const redirectUri = getOAuthRedirectUri(request, env);
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    auth_type: "rerequest",
    scope: REQUIRED_FACEBOOK_PAGE_PERMISSIONS.join(","),
  });

  return new Response(
    JSON.stringify({
      loginUrl: `https://www.facebook.com/${env.META_GRAPH_VERSION || "v24.0"}/dialog/oauth?${params.toString()}`,
      profileKey,
      pageId: pageId || null,
      requiredPermissions: REQUIRED_FACEBOOK_PAGE_PERMISSIONS,
    }),
    { headers: JSON_HEADERS }
  );
}

async function handleFacebookOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error") || url.searchParams.get("error_message");

  const redirectWithStatus = (returnUrl, params) => {
    const target = returnUrl ? new URL(returnUrl) : new URL("/", url.origin);
    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, value);
    }
    return Response.redirect(target.toString(), 302);
  };

  if (!state) {
    return new Response("Missing OAuth state", { status: 400, headers: CORS_HEADERS });
  }

  const stateRow = await env.DB.prepare("SELECT * FROM facebook_oauth_states WHERE state = ?")
    .bind(state)
    .first();

  if (!stateRow || stateRow.expires_at < nowUnix()) {
    return new Response("Facebook OAuth state expired. Start reconnect again.", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  await env.DB.prepare("DELETE FROM facebook_oauth_states WHERE state = ?").bind(state).run();

  if (error || !code) {
    return redirectWithStatus(stateRow.return_url, {
      fb_oauth: "error",
      profile: stateRow.profile_key,
      reason: error || "missing_code",
    });
  }

  try {
    const redirectUri = getOAuthRedirectUri(request, env);
    const shortTokenData = await graphJson(
      `${env.META_GRAPH_BASE || "https://graph.facebook.com"}/${env.META_GRAPH_VERSION || "v24.0"}/oauth/access_token`,
      {
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      }
    );

    const longTokenData = await graphJson(
      `${env.META_GRAPH_BASE || "https://graph.facebook.com"}/${env.META_GRAPH_VERSION || "v24.0"}/oauth/access_token`,
      {
        grant_type: "fb_exchange_token",
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        fb_exchange_token: shortTokenData.access_token,
      }
    );

    await saveFacebookConnectionFromUserToken(env, {
      profileKey: stateRow.profile_key,
      requestedPageId: stateRow.page_id,
      userAccessToken: longTokenData.access_token,
      userTokenExpiresAt: longTokenData.expires_in ? nowUnix() + Number(longTokenData.expires_in) : null,
    });

    return redirectWithStatus(stateRow.return_url, {
      fb_oauth: "connected",
      profile: stateRow.profile_key,
    });
  } catch (err) {
    console.error("Facebook OAuth callback failed:", err);
    return redirectWithStatus(stateRow.return_url, {
      fb_oauth: "error",
      profile: stateRow.profile_key,
      reason: String(err?.message || err).slice(0, 160),
    });
  }
}

async function graphJson(urlOrString, params = {}, init = {}) {
  const url = new URL(urlOrString);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data.error) {
    const classified = classifyMetaError(data);
    const err = new Error(classified.message || text || `Graph API failed (${res.status})`);
    err.meta = data;
    err.classification = classified;
    throw err;
  }

  return data;
}

async function saveFacebookConnectionFromUserToken(env, { profileKey, requestedPageId, userAccessToken, userTokenExpiresAt }) {
  const now = nowUnix();
  const user = await graphJson(graphUrl(env, "/me"), {
    fields: "id,name",
    access_token: userAccessToken,
  });
  const permissionData = await graphJson(graphUrl(env, "/me/permissions"), {
    access_token: userAccessToken,
  });
  const grantedPermissions = (permissionData.data || [])
    .filter((perm) => perm.status === "granted")
    .map((perm) => perm.permission);
  const missingPermissions = REQUIRED_FACEBOOK_PAGE_PERMISSIONS.filter((perm) => !grantedPermissions.includes(perm));

  if (missingPermissions.length) {
    throw new Error(`Missing Facebook permission: ${missingPermissions.join(", ")}`);
  }

  const accounts = await graphJson(graphUrl(env, "/me/accounts"), {
    fields: "id,name,access_token,tasks",
    access_token: userAccessToken,
  });
  const pages = accounts.data || [];
  const selectedPage = requestedPageId
    ? pages.find((page) => String(page.id) === String(requestedPageId))
    : pages[0];

  if (!selectedPage) {
    throw new Error(
      requestedPageId
        ? "User no longer has admin access to the selected Facebook Page."
        : "No Facebook Pages were returned for this user."
    );
  }

  if (!selectedPage.access_token) {
    throw new Error("Selected Facebook Page did not return a Page access token.");
  }

  const pageTest = await testFacebookPageToken(env, selectedPage.id, selectedPage.access_token);
  if (!pageTest.ok) {
    throw new Error(pageTest.error || "New Facebook Page token failed validation.");
  }

  await env.DB.prepare(
    `INSERT INTO facebook_connections (
      profile_key, page_id, page_name, page_access_token, page_token_expires_at,
      user_id, user_name, user_access_token, user_token_expires_at,
      granted_permissions, missing_permissions, token_status, reconnect_required,
      last_checked_at, last_error, debug_payload, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_key) DO UPDATE SET
      page_id = excluded.page_id,
      page_name = excluded.page_name,
      page_access_token = excluded.page_access_token,
      page_token_expires_at = excluded.page_token_expires_at,
      user_id = excluded.user_id,
      user_name = excluded.user_name,
      user_access_token = excluded.user_access_token,
      user_token_expires_at = excluded.user_token_expires_at,
      granted_permissions = excluded.granted_permissions,
      missing_permissions = excluded.missing_permissions,
      token_status = excluded.token_status,
      reconnect_required = excluded.reconnect_required,
      last_checked_at = excluded.last_checked_at,
      last_error = excluded.last_error,
      alert_sent_at = NULL,
      debug_payload = excluded.debug_payload,
      updated_at = excluded.updated_at`
  )
    .bind(
      profileKey,
      selectedPage.id,
      selectedPage.name || null,
      selectedPage.access_token,
      pageTest.expiresAt,
      user.id || null,
      user.name || null,
      userAccessToken,
      userTokenExpiresAt,
      JSON.stringify(grantedPermissions),
      JSON.stringify(missingPermissions),
      pageTest.status,
      0,
      now,
      null,
      JSON.stringify(pageTest.debug || {}),
      now,
      now
    )
    .run();
}

async function testFacebookPageToken(env, pageId, pageToken) {
  try {
    const page = await graphJson(graphUrl(env, `/${pageId}`), {
      fields: "id,name",
      access_token: pageToken,
    });
    const debug = await debugMetaToken(env, pageToken);
    return {
      ok: true,
      page,
      debug,
      status: tokenStatusFromDebug(debug),
      expiresAt: debug?.data?.expires_at || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.classification?.message || err?.message || String(err),
      debug: err?.meta || null,
    };
  }
}

async function debugMetaToken(env, inputToken) {
  const appAccessToken = getAppAccessToken(env);
  if (!appAccessToken) {
    throw new Error("META_APP_ID and META_APP_SECRET are required for token debug.");
  }
  return graphJson(graphUrl(env, "/debug_token"), {
    input_token: inputToken,
    access_token: appAccessToken,
  });
}

function tokenStatusFromDebug(debug) {
  const data = debug?.data || {};
  if (!data.is_valid) return "invalid";
  if (!data.expires_at || data.expires_at === 0) return "valid";
  const secondsRemaining = data.expires_at - nowUnix();
  if (secondsRemaining <= 0) return "expired";
  if (secondsRemaining <= 14 * 24 * 60 * 60) return "expiring";
  return "valid";
}

function classifyMetaError(payload) {
  const error = payload?.error || payload || {};
  const code = Number(error.code || 0);
  const subcode = Number(error.error_subcode || error.subcode || 0);
  const message = String(error.message || error.error_user_msg || "Meta Graph API error");
  const lower = message.toLowerCase();

  if (code === 190 && (subcode === 463 || lower.includes("expired"))) {
    return { type: "expired_token", reconnectRequired: true, message: "Facebook token expired. Reconnect Facebook." };
  }
  if (code === 190 && (subcode === 458 || lower.includes("not authorized") || lower.includes("has not authorized"))) {
    return { type: "user_removed_app", reconnectRequired: true, message: "The connected Facebook user removed or deauthorized the app." };
  }
  if (code === 190) {
    return { type: "invalid_token", reconnectRequired: true, message: "Facebook token is invalid. Reconnect Facebook." };
  }
  if ((code === 10 || code === 200) && lower.includes("pages_manage_posts")) {
    return { type: "missing_pages_manage_posts", reconnectRequired: true, message: "Missing pages_manage_posts permission." };
  }
  if ((code === 10 || code === 200) && (lower.includes("permission") || lower.includes("permissions"))) {
    return { type: "missing_permission", reconnectRequired: true, message };
  }
  if (lower.includes("business manager") || lower.includes("business") || lower.includes("asset")) {
    return { type: "page_disconnected_business_manager", reconnectRequired: true, message: "Facebook Page may be disconnected from Business Manager." };
  }
  if (lower.includes("admin") || lower.includes("task") || lower.includes("page access")) {
    return { type: "lost_page_admin_access", reconnectRequired: true, message: "Connected user lost Facebook Page admin access." };
  }
  return { type: "meta_error", reconnectRequired: false, message };
}

async function markConnectionError(env, connection, classification, rawError) {
  if (!connection?.profile_key) return;
  const now = nowUnix();
  await env.DB.prepare(
    `UPDATE facebook_connections
     SET token_status = ?, reconnect_required = ?, last_checked_at = ?, last_error = ?, updated_at = ?
     WHERE profile_key = ?`
  )
    .bind(
      classification.type || "error",
      classification.reconnectRequired ? 1 : 0,
      now,
      classification.message || String(rawError || ""),
      now,
      connection.profile_key
    )
    .run();

  if (classification.reconnectRequired) {
    await sendTokenAlert(env, connection, classification.message || "Facebook reconnect required.");
  }
}

async function refreshFacebookConnection(env, connection) {
  if (!connection?.user_access_token) {
    return { ok: false, error: "No stored user token to refresh Page token from." };
  }

  try {
    const refreshedUser = await graphJson(graphUrl(env, "/oauth/access_token"), {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: connection.user_access_token,
    });

    await saveFacebookConnectionFromUserToken(env, {
      profileKey: connection.profile_key,
      requestedPageId: connection.page_id,
      userAccessToken: refreshedUser.access_token || connection.user_access_token,
      userTokenExpiresAt: refreshedUser.expires_in ? nowUnix() + Number(refreshedUser.expires_in) : connection.user_token_expires_at,
    });
    return { ok: true };
  } catch (err) {
    const classification = err.classification || classifyMetaError(err.meta || { message: err.message });
    await markConnectionError(env, connection, classification, err);
    return { ok: false, error: classification.message || err.message };
  }
}

async function runDueTokenHealthChecks(env, options = {}) {
  const now = nowUnix();
  const force = !!options.force;
  const state = await env.DB.prepare("SELECT * FROM meta_maintenance WHERE key = ?").bind("facebook_token_health").first();
  const lastRun = state?.value ? Number(state.value) : 0;

  if (!force && lastRun && now - lastRun < 23 * 60 * 60) {
    return { ok: true, skipped: true, lastRun };
  }

  const { results } = await env.DB.prepare("SELECT * FROM facebook_connections ORDER BY profile_key ASC").all();
  const checks = [];

  for (const connection of results || []) {
    const check = await checkFacebookConnection(env, connection);
    checks.push({ profileKey: connection.profile_key, ...check });
  }

  await env.DB.prepare(
    `INSERT INTO meta_maintenance (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind("facebook_token_health", String(now), now)
    .run();

  return { ok: true, checked: checks.length, checks };
}

async function checkFacebookConnection(env, connection) {
  const now = nowUnix();
  try {
    const debug = await debugMetaToken(env, connection.page_access_token);
    let status = tokenStatusFromDebug(debug);
    let reconnectRequired = status === "invalid" || status === "expired";
    let lastError = reconnectRequired ? "Facebook Page token is invalid or expired." : null;

    const grantedScopes = debug?.data?.scopes || [];
    const storedGranted = parseJsonArray(connection.granted_permissions);
    const grantedPermissions = Array.from(new Set([...storedGranted, ...grantedScopes]));
    const missingPermissions = REQUIRED_FACEBOOK_PAGE_PERMISSIONS.filter((perm) => !grantedPermissions.includes(perm));

    if (missingPermissions.includes("pages_manage_posts")) {
      status = "missing_permission";
      reconnectRequired = true;
      lastError = "Missing pages_manage_posts permission.";
    }

    if (status === "expiring" || reconnectRequired) {
      const refresh = await refreshFacebookConnection(env, connection);
      if (refresh.ok) return { ok: true, status: "refreshed" };
      lastError = refresh.error || lastError;
    }

    await env.DB.prepare(
      `UPDATE facebook_connections
       SET token_status = ?, reconnect_required = ?, last_checked_at = ?, last_error = ?, debug_payload = ?,
           granted_permissions = ?, missing_permissions = ?, updated_at = ?
       WHERE profile_key = ?`
    )
      .bind(
        status,
        reconnectRequired ? 1 : 0,
        now,
        lastError,
        JSON.stringify(debug),
        JSON.stringify(grantedPermissions),
        JSON.stringify(missingPermissions),
        now,
        connection.profile_key
      )
      .run();

    if (reconnectRequired || status === "expiring") {
      await sendTokenAlert(env, connection, lastError || "Facebook Page token needs attention.");
    }

    return { ok: !reconnectRequired, status, missingPermissions };
  } catch (err) {
    const classification = err.classification || classifyMetaError(err.meta || { message: err.message });
    await markConnectionError(env, connection, classification, err);
    return { ok: false, status: classification.type, error: classification.message };
  }
}

async function sendTokenAlert(env, connection, message) {
  const now = nowUnix();
  if (connection.alert_sent_at && now - connection.alert_sent_at < 24 * 60 * 60) return;

  const payload = {
    type: "facebook_token_alert",
    profileKey: connection.profile_key,
    pageId: connection.page_id,
    pageName: connection.page_name,
    message,
    reconnectRequired: true,
    time: new Date(now * 1000).toISOString(),
  };

  if (env.TOKEN_ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.TOKEN_ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn("Token alert webhook failed:", err);
    }
  } else {
    console.warn("TOKEN ALERT:", JSON.stringify(payload));
  }

  await env.DB.prepare("UPDATE facebook_connections SET alert_sent_at = ?, updated_at = ? WHERE profile_key = ?")
    .bind(now, now, connection.profile_key)
    .run();
}

async function publishToFacebook(post, env, profileConfig) {
  const pageId = profileConfig.fbPageId;
  const token = profileConfig.fbToken;

  console.log("FB publish using PAGE_ID", pageId, "token prefix", token?.slice(0, 10));

  if (!pageId || !token) {
    console.warn("META_PAGE_ID or META_PAGE_ACCESS_TOKEN missing for this profile, skipping FB publish");
    return { ok: false, error: "fb_config_missing" };
  }

  if (profileConfig.fbConnection?.reconnect_required) {
    await sendTokenAlert(
      env,
      profileConfig.fbConnection,
      profileConfig.fbConnection.last_error || "Reconnect Facebook before publishing fails."
    );
    return {
      ok: false,
      error: "fb_reconnect_required",
      detail: profileConfig.fbConnection.last_error || "Reconnect Facebook",
    };
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
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
    const classification = classifyMetaError(payload);
    if (profileConfig.fbConnection) {
      await markConnectionError(env, profileConfig.fbConnection, classification, payload);
    }
    return { ok: false, error: classification.type || "fb_error", detail: classification.message || text };
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
  const maxStatusAttempts = 5;
  const statusDelayMs = 2000;

  for (let attempt = 1; attempt <= maxStatusAttempts; attempt++) {
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

    if (attempt < maxStatusAttempts) {
      await new Promise((resolve) => setTimeout(resolve, statusDelayMs));
    }
  }

  if (statusCode !== "FINISHED") {
    console.warn("IG media not finished after polling, will try again later:", {
      creationId,
      statusCode,
    });
    return { ok: false, error: "ig_not_ready", creationId, statusCode };
  }

  // Small extra wait – even when status says FINISHED, IG sometimes needs a bit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 3) Publish the media with retries for "media not ready" (code 9007 / subcode 2207027)
  const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;

  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const maxPublishAttempts = 3;
  const publishDelayMs = 2000;

  for (let attempt = 1; attempt <= maxPublishAttempts; attempt++) {
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      body: publishParams,
    });

    const publishText = await publishRes.text();

    if (publishRes.ok) {
      console.log("IG publish OK:", publishText);
      let publishData;
      try {
        publishData = JSON.parse(publishText);
      } catch {
        publishData = { raw: publishText };
      }
      return { ok: true, data: publishData };
    }

    // Try to detect the "media not ready yet" error and retry
    let errJson;
    try {
      errJson = JSON.parse(publishText);
    } catch {
      errJson = null;
    }

    const errCode = errJson?.error?.code;
    const errSubcode = errJson?.error?.error_subcode;

    if (errCode === 9007 || errSubcode === 2207027) {
      console.warn(
        `IG publish not ready (code=${errCode}, subcode=${errSubcode}), attempt ${attempt} of ${maxPublishAttempts}`
      );
      if (attempt < maxPublishAttempts) {
        await new Promise((resolve) => setTimeout(resolve, publishDelayMs));
        continue;
      }
    }

    console.error("IG publish error:", publishRes.status, publishText);
    return { ok: false, error: "ig_publish_error", detail: publishText };
  }

  // Fallback (should not hit)
  return { ok: false, error: "ig_publish_error", detail: "Unknown IG publish failure" };
}
