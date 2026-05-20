# Meta AI Scheduler (Starter)

This is a **starter app** for your mini-Hootsuite:

- Frontend: React (Vite) – upload photos, generate AI captions, pick schedule times.
- Backend: Cloudflare Worker + D1 – store posts, run Cron scheduler, call Meta Graph API and OpenAI.

> ⚠️ This is a template. You still need to:
> - Register a Meta app + get tokens.
> - Configure Cloudflare D1, environment variables, and Cron.
> - Integrate real media hosting (R2, S3, etc.) so your images have public URLs.

---

## 1. Backend (Cloudflare Worker)

### Install & configure

```bash
cd backend
npm install
```

Create a D1 DB:

```bash
npx wrangler d1 create meta_ai_scheduler
```

Copy the snippet Wrangler prints into `wrangler.toml` (replace the placeholder in `[[d1_databases]]`).

Apply the schema:

```bash
npm run d1:migrate
```

> You can also run:
>
> ```bash
> npx wrangler d1 migrations apply meta_ai_scheduler --remote
> ```

### Environment variables (Cloudflare dashboard or wrangler)

You need:

- `OPENAI_API_KEY` – your OpenAI API key.
- `OPENAI_MODEL` – optional caption/text model override. Defaults to `gpt-5.5`.
- `OPENAI_IMAGE_MODEL` – optional image generation model override. Defaults to `gpt-image-2`.
- `OPENAI_CAPTION_MAX_TOKENS` – optional caption output cap. Defaults to `180`.
- `OPENAI_IMAGE_SIZE` – optional image size. Defaults to `1024x1024`, the smallest standard GPT image size.
- `OPENAI_IMAGE_QUALITY` – optional image quality. Defaults to `low` to reduce image generation cost.
- `META_GRAPH_VERSION` – optional (defaults to `v24.0`).
- `META_APP_ID` – Meta app ID, stored as a Worker secret.
- `META_APP_SECRET` – Meta app secret, stored as a Worker secret.
- `META_OAUTH_REDIRECT_URI` – Worker callback URL, usually `https://your-worker.workers.dev/api/meta/oauth/callback`.
- `META_PAGE_ID` – Facebook Page ID used to select the Page during OAuth. Existing `META_PAGE_ACCESS_TOKEN` secrets still work as fallback until a D1 OAuth connection exists.
- `META_IG_USER_ID` – Instagram Business user ID.
- `META_IG_ACCESS_TOKEN` – IG token (or reuse Page token if allowed).
- `TOKEN_ALERT_WEBHOOK_URL` – optional webhook for token alerts. Without it, alerts are written to Worker logs and shown in the admin panel.

### Run locally

```bash
npm run dev
# Worker will run on http://localhost:8787
```

Cron is configured in `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"] # every 5 minutes
```

When deployed, Cloudflare will call the `scheduled` handler and the Worker will:

1. Run the Facebook token health check once per day using Meta's token debug endpoint.
2. Read posts from D1 where `status = "scheduled"` and `scheduled_at <= now`.
3. For each:
   - POST to `/{PAGE_ID}/photos` for Facebook.
   - POST to `/{IG_USER_ID}/media` + `/media_publish` for Instagram.
4. Mark the row as `published` or `failed`.

---

## 2. Frontend (React + Vite)

```bash
cd ../frontend
npm install
npm run dev
# Vite dev server at http://localhost:5173
```

Vite is configured to proxy `/api` to the Worker on port 8787 during development.

### UI flow

1. **Upload photos**

   - Drag/drop or select multiple files.
   - Previews stay in the browser only.

2. **AI caption**

   - Click **“AI caption”** on a draft.
   - Frontend calls `POST /api/ai/caption` with a simple prompt.
   - Worker calls OpenAI Chat Completions and returns a caption + hashtags.

3. **AI image library**

   - Choose how many images to generate.
   - Worker saves generated images under the R2 `generated/` folder.
   - Reuse saved images as drafts or delete them from the library.

4. **Schedule**

   - Choose time with `datetime-local` input.
   - Choose platforms (Facebook / Instagram / both).
   - Click **“Save & send to scheduler”**.
   - Frontend calls `POST /api/posts` for each draft.

5. **Queue**

   - `GET /api/posts` shows everything in D1 with status + time.
   - The Worker Cron does the actual publishing.

> For production, set `VITE_API_BASE_URL` to your Worker URL (e.g. `https://api.yourdomain.com`).

---

## 3. Next steps / extensions

- Add **real media upload** endpoint (`/api/upload`) that saves files to R2 or Cloudflare Images and returns a public URL.
- Improve AI prompts + allow multiple caption variants.
- Add analytics (reach, likes, comments) using Insights endpoints and display charts on the dashboard.
- Prepare Meta App Review and Business Verification if your production app requires approval for `pages_show_list`, `pages_read_engagement`, or `pages_manage_posts`.

This skeleton gives you:

- A working React dashboard.
- A Cloudflare Worker with:
  - D1-backed post storage.
  - AI integration via OpenAI.
  - Cron-based publishing to Facebook and Instagram.

From here, we can iteratively layer in more automation and polish.
