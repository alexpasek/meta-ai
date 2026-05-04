Meta AI Scheduler — User Instructions (UI)
=========================================

1) Access
- Open the frontend in your browser (run the dev server or open deployed URL).
- Enter your Access Key in the "Access" card and click Enter.
- The key is stored in localStorage. To remove it, clear the input and refresh or clear localStorage.

2) Workflow overview
- Section 1: Create content — generate or upload images, create/edit drafts, run AI captions, set schedule.
- Section 2: Queue / calendar — shows scheduled posts stored in D1 DB (Cloudflare Worker Cron posts them).
- Section 3: Token helper — inspect token health and run profile checks.

3) Quick plan (bulk drafts)
- Choose Profile, Number of posts (15/30), and Frequency (days between posts).
- Select which services to rotate.
- Click "Generate plan drafts" to create scheduled placeholder drafts. Drafts are added to the drafts grid.

4) Generate AI images
- Use "Generate AI images" component to create images. Each generated image becomes a draft (status "draft-ai") with a preview URL and prompt metadata.

5) Upload your photos
- Use the file input (accepts multiple images). Uploaded files become drafts with a preview URL and defaults:
  - platforms: fb & ig
  - default profile: Calgary
  - default service: popcorn
  - status: draft

6) Draft fields & editing
- Caption: editable text area. Can be empty; used by AI caption generator.
- Caption length/style: quick / normal / story — affects AI output length.
- Campaign: optional (moving, sell, holiday, refresh).
- Service type: selects wording, website CTA and hashtags.
- Neighbourhood: optional; click Random to pick from rotation.
- CTA mode: lead / brand / review.
- Offer / promo: optional short promo text (used in banner).
- Image layout: photo or banner. Banner enables banner style and overlay options.
- Post type: feed or banner (keeps layout in sync).
- Hashtags: auto-filled, editable.
- Platforms: toggle Facebook and/or Instagram.
- Profile: choose brand (calgary / epf / wallpaper) — changes CTA and token used.
- Schedule time: set with the datetime-local input.

7) Post preview
- The PostPreview shows image + caption + hashtags.
- For banner layout a baked banner overlay is previewed (or brand PNG overlay when selected).

8) AI Captioning
- Per-draft: click "AI caption" — the frontend calls /api/ai/caption to generate caption body.
  - The UI appends a single service CTA line (Details at https://…).
  - Caption uniqueness is checked against local history; two attempts are made to avoid repeats.
- Bulk: "AI captions for all drafts" runs captions sequentially for every draft.

9) Full Auto (one-press)
- "Full auto 🚀 (caption + schedule + send)" performs:
  1. Generate missing captions,
  2. Auto-schedule drafts per profile (pairs FB/IG on same day, 3 hours apart),
  3. Upload images and POST posts to /api/posts (scheduler).
- Use for hands-off processing of many drafts.

10) Auto scheduling / Auto spread
- Set Start date & time and Frequency (days between posts).
- "Apply auto schedule to drafts" computes scheduledLocal times grouped by profile:
  - Drafts for the same profile are spaced by the interval.
  - Drafts alternate platforms so index 0 = FB, index 1 = IG (3 hours later), next pair next day, etc.
  - If profile already has scheduled posts, new ones start after the latest scheduled time.

11) Banner images
- Select imageLayout = banner to create image with headline+footer baked into the photo.
- Choose a banner style (gentle, promo, bold, darkglass, split, clean, accent, brandpng).
- Baking occurs client-side (canvas). If brandpng selected, a PNG overlay may be used.
- If baking fails, original image is uploaded.

12) Image processing
- Images are converted to Instagram-safe JPEGs client-side:
  - Max file size ~8MB
  - Max width ~1440px
  - Aspect ratio constrained between 4:5 and 1.91:1
  - Cropping & scaling are automatic to meet IG constraints

13) Save & send to scheduler
- Click "Save & send to scheduler":
  - Images are uploaded to backend /api/upload (uploads return URL).
  - Captions are normalized to remove other brand mentions and ensure the profile CTA line.
  - Posts are POSTed to /api/posts with metadata (scheduledAt unix seconds).
- Cron worker will publish posts at scheduled times.

14) Queue / calendar tools
- Section 2 shows scheduled posts from D1.
- Filter by status and hide published posts.
- Actions per post:
  - Cancel scheduled post: POST /api/posts/{id}/cancel
  - Post now: POST /api/posts/{id}/publish-now
  - Retry failed: POST /api/posts/{id}/retry
  - Remove: DELETE /api/posts/{id}
  - View log: expand to see post.log or error details.

15) Token helper (Section 3)
- "Check tokens" per profile calls /api/meta/check-profile to validate Page/IG tokens and show config state.
- Token health summary is computed from recent post logs.
- Use Facebook Graph Explorer and Access Token Debugger to create and validate tokens.

16) CLI / Worker secrets
- After obtaining tokens, set Worker secrets from backend/ folder:
  - npx wrangler secret put META_PAGE_ACCESS_TOKEN
  - npx wrangler secret put META_IG_ACCESS_TOKEN
  - npx wrangler secret put META_PAGE_ACCESS_TOKEN_EPF
  - npx wrangler secret put META_IG_ACCESS_TOKEN_EPF
  - npx wrangler secret put META_PAGE_ACCESS_TOKEN_WALLPAPER
  - npx wrangler secret put META_IG_ACCESS_TOKEN_WALLPAPER
- If IDs changed, set META_PAGE_ID / META_IG_USER_ID and variants, then:
  - npx wrangler deploy

17) Troubleshooting
- 401 from backend: Access key invalid — re-enter key.
- AI caption errors: check backend /api/ai/caption logs and API_BASE in the frontend env.
- Upload failures: check file size, backend /api/upload logs and network.
- Publish failures: check token health, re-generate Page/IG tokens and update Worker secrets.
- Banner bake issues: fallback is original file upload; check console for bake errors.

18) Helpful notes
- Caption history is stored in localStorage to avoid repeats (key: captionHistory_v1_{profile}_{service}).
- Neighbourhood rotation remembers last index in localStorage.
- Service, profile, and neighbourhood selections affect hashtags, CTA lines, and SEO URLs.

If you want this file saved under a different path or converted to markdown (README_UI.md), tell me the desired filename.

20205