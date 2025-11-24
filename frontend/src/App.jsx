// frontend/src/App.jsx
import React, { useState, useEffect } from "react";
import ImageGenerator from "./ImageGenerator";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const PROFILE_CONFIG = {
  calgary: {
    key: "calgary",
    label: "Calgary – Popcorn Ceiling Removal",
    city: "Calgary",
    seoLocation: "Calgary and nearby areas",
    website: "https://popcornceilingremovalcalgary.com",
    brand: "Popcorn Ceiling Removal Calgary",
  },
  epf: {
    key: "epf",
    label: "EPF Pro Services (GTA)",
    city: "Mississauga / GTA",
    seoLocation: "Mississauga, Oakville, Burlington, Hamilton and the GTA",
    website: "https://epfproservices.com",
    brand: "EPF Pro Services",
  },
  wallpaper: {
    key: "wallpaper",
    label: "Wallpaper Removal Pro",
    city: "Toronto / GTA",
    seoLocation: "Toronto and the GTA",
    // TODO: change this to your real wallpaper site if different
    website: "https://wallpaperremovalpro.com",
    brand: "Wallpaper Removal Pro",
  },
};

function toUnixSeconds(value) {
  if (!value) return null;
  return Math.floor(new Date(value).getTime() / 1000);
}

function fromUnixSeconds(value) {
  if (!value) return "";
  const d = new Date(value * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatDateTimeLocal(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function App() {
  const [accessKey, setAccessKey] = useState(
    () => (typeof window !== "undefined" && window.localStorage.getItem("accessKey")) || ""
  );
  const [keyInput, setKeyInput] = useState("");
  const [files, setFiles] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);
  const [postingId, setPostingId] = useState(null);
  const [postingNowId, setPostingNowId] = useState(null);
  const [autoStart, setAutoStart] = useState("");
  const [autoInterval, setAutoInterval] = useState("1"); // days between posts
  const [bulkCaptionLoading, setBulkCaptionLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [hidePosted, setHidePosted] = useState(false);
  const [openLogId, setOpenLogId] = useState(null);

  const profileLatest = React.useMemo(() => {
    const latest = {};
    for (const post of scheduledPosts) {
      // Only consider scheduled (future) posts for the “queue”
      if (post.status !== "scheduled") continue;
      const key = post.profile_key || "default";
      if (!latest[key] || post.scheduled_at > latest[key]) {
        latest[key] = post.scheduled_at;
      }
    }
    return latest;
  }, [scheduledPosts]);

  useEffect(() => {
    if (accessKey) {
      loadScheduled();
    }
  }, [accessKey]);

  async function loadScheduled() {
    try {
      const res = await fetch(`${API_BASE}/api/posts`, {
        headers: makeHeaders(),
      });
      if (res.status === 401) {
        alert("Access key is invalid. Please enter again.");
        setAccessKey("");
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("accessKey");
        }
        return;
      }
      const data = await res.json();
      setScheduledPosts(data);
    } catch (err) {
      console.error("Failed to load posts", err);
    }
  }

  function handleFilesSelected(e) {
    const list = Array.from(e.target.files || []);
    const mapped = list.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      caption: "",
      hashtags: "",
      platforms: ["fb", "ig"],
      scheduledLocal: "",
      profileKey: "calgary",
      status: "draft",
      aiLoading: false,
    }));
    setFiles((prev) => [...prev, ...mapped]);
  }

  function makeHeaders(extra = {}) {
    const headers = { ...extra };
    if (accessKey) {
      headers["Authorization"] = `Bearer ${accessKey}`;
    }
    return headers;
  }

  function updateDraft(id, patch) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function handleRemoveDraft(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleGenerateCaption(draft) {
    try {
      updateDraft(draft.id, { aiLoading: true, aiError: "" });

      const profileCfg = PROFILE_CONFIG[draft.profileKey] || PROFILE_CONFIG.calgary;

      const prompt = `
Photo description: ${draft.file?.name || "project image"}.
Brand: ${profileCfg.brand}.
Website: ${profileCfg.website}.
Local SEO focus: ${profileCfg.seoLocation}.
City/area to target in the copy: ${profileCfg.city}.
This post is for the "${profileCfg.label}" profile.

Write a unique, human caption that is optimized for local homeowners searching for popcorn ceiling removal, drywall and painting in this area.
Mention the city/area naturally and invite people to get a quote or visit the website.
`;

      const res = await fetch(`${API_BASE}/api/ai/caption`, {
        method: "POST",
        headers: makeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          prompt,
          platform: "both",
          profile: draft.profileKey, // calgary / epf / wallpaper
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error || !data.text) {
        const message = data?.error || `AI caption failed (${res.status})`;
        throw new Error(message);
      }

      updateDraft(draft.id, {
        caption: data.text,
        status: "ready",
      });
    } catch (err) {
      console.error("AI caption error", err);
      alert(err?.message || "AI caption failed. Check server logs.");
      updateDraft(draft.id, { aiError: err?.message || "AI caption failed" });
    } finally {
      updateDraft(draft.id, { aiLoading: false });
    }
  }

  async function handleAutoCaptionAll() {
    if (!files.length) {
      alert("No drafts to caption.");
      return;
    }
    setBulkCaptionLoading(true);
    try {
      for (const draft of files) {
        await handleGenerateCaption(draft);
      }
    } finally {
      setBulkCaptionLoading(false);
    }
  }

  function addAiDraft(url, prompt) {
    setFiles((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        file: null,
        imageUrl: url,
        previewUrl: url,
        caption: "",
        hashtags: "",
        platforms: ["fb", "ig"],
        scheduledLocal: "",
        profileKey: "calgary",
        status: "draft-ai",
        sourcePrompt: prompt,
        aiLoading: false,
      },
    ]);
  }

  async function uploadFile(draft) {
    if (!draft.file) return null;

    const formData = new FormData();
    formData.append("file", draft.file);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: makeHeaders(),
      body: formData,
    });

    if (!res.ok) {
      console.error("Upload failed", await res.text());
      throw new Error("Upload failed");
    }

    const data = await res.json();
    // data.url is served by the same Worker at /media/:key
    return data.url;
  }

  async function handleSaveSchedules() {
    setLoading(true);
    try {
      for (const draft of files) {
        const scheduledUnix = toUnixSeconds(draft.scheduledLocal);
        if (!scheduledUnix) continue;

        let imageUrl = draft.imageUrl;

        // If we don't have a URL yet, upload the file to /api/upload
        if (!imageUrl && draft.file) {
          try {
            imageUrl = await uploadFile(draft);
            updateDraft(draft.id, { imageUrl });
          } catch (err) {
            console.error("Upload error for draft", draft.id, err);
            continue; // skip this one
          }
        }

        if (!imageUrl) continue;

        const body = {
          title: draft.file?.name || draft.title || "AI image",
          imageUrl,
          caption: draft.caption,
          hashtags: draft.hashtags,
          platforms: draft.platforms,
          scheduledAt: scheduledUnix,
          status: "scheduled",
          profileKey: draft.profileKey,
        };

        await fetch(`${API_BASE}/api/posts`, {
          method: "POST",
          headers: makeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
      }

      await loadScheduled();
      alert("Drafts sent to scheduler (stored in D1). Cron will publish when time comes.");
    } catch (err) {
      console.error("Save schedules error", err);
      alert("Error saving schedules. Check console.");
    } finally {
      setLoading(false);
    }
  }

  function togglePlatform(draftId, platform) {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== draftId) return f;
        const has = f.platforms.includes(platform);
        return {
          ...f,
          platforms: has
            ? f.platforms.filter((p) => p !== platform)
            : [...f.platforms, platform],
        };
      })
    );
  }

  function handleAutoSpread() {
    if (!files.length) {
      alert("No drafts to schedule yet.");
      return;
    }

    const intervalDays = Number(autoInterval) || 1;
    const msPerDay = 24 * 60 * 60 * 1000;

    setFiles((prev) => {
      // Group drafts by profile
      const grouped = {};
      for (const draft of prev) {
        const key = draft.profileKey || "default";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(draft);
      }

      const updatedById = {};

      for (const [profileKey, draftsForProfile] of Object.entries(grouped)) {
        let baseDate;

        if (autoStart) {
          baseDate = new Date(autoStart);
        } else {
          const last = profileLatest[profileKey];
          if (last) {
            baseDate = new Date(last * 1000 + intervalDays * msPerDay);
          } else {
            baseDate = new Date();
          }
        }

        draftsForProfile.forEach((draft, index) => {
          const pairIndex = Math.floor(index / 2);
          const isFb = index % 2 === 0;

          const dt = new Date(baseDate.getTime() + pairIndex * intervalDays * msPerDay);
          if (!isFb) {
            dt.setHours(dt.getHours() + 3);
          }

          updatedById[draft.id] = {
            ...draft,
            scheduledLocal: formatDateTimeLocal(dt),
            platforms: isFb ? ["fb"] : ["ig"],
          };
        });
      }

      return prev.map((d) => updatedById[d.id] || d);
    });
  }

  async function handleCancel(id) {
    setCancelingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}/cancel`, {
        method: "POST",
        headers: makeHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Cancel failed (${res.status})`);
      }
      await loadScheduled();
    } catch (err) {
      console.error("Cancel error", err);
      alert(err?.message || "Failed to cancel post");
    } finally {
      setCancelingId(null);
    }
  }

  async function handlePostNow(id) {
    setPostingNowId(id);
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}/publish-now`, {
        method: "POST",
        headers: makeHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Post now failed (${res.status})`);
      }
      await loadScheduled();
    } catch (err) {
      console.error("Post now error", err);
      alert(err?.message || "Failed to publish now");
    } finally {
      setPostingNowId(null);
    }
  }

  async function handleRemove(id) {
    setRemovingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}`, {
        method: "DELETE",
        headers: makeHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Remove failed (${res.status})`);
      }
      await loadScheduled();
    } catch (err) {
      console.error("Remove error", err);
      alert(err?.message || "Failed to remove post");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRetry(id) {
    setRetryingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}/retry`, {
        method: "POST",
        headers: makeHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Retry failed (${res.status})`);
      }
      await loadScheduled();
    } catch (err) {
      console.error("Retry error", err);
      alert(err?.message || "Failed to retry post");
    } finally {
      setRetryingId(null);
    }
  }

  if (!accessKey) {
    return (
      <div className="app auth-wrapper">
        <div className="card auth-card">
          <h1>Meta AI Scheduler – Access</h1>
          <p>Enter your access key to use this tool.</p>
          <input
            type="password"
            placeholder="Access key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button
            type="button"
            className="primary"
            onClick={() => {
              const v = keyInput.trim();
              if (!v) return;
              setAccessKey(v);
              if (typeof window !== "undefined") {
                window.localStorage.setItem("accessKey", v);
              }
            }}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Meta AI Scheduler</h1>
        <p>Drop photos, let AI write captions, and auto-post via Cloudflare Worker + Meta APIs.</p>
      </header>

      <main className="app-main">
        <section className="card">
          <h2>1. Create content</h2>
          <p>Generate AI images or upload your own photos, then let AI write captions and schedule everything.</p>

          <ImageGenerator onImageGenerated={addAiDraft} makeHeaders={makeHeaders} />

          <hr className="section-divider" />

          <h3>Or upload your own photos</h3>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
          />
          <div className="auto-spread">
            <h3>Auto schedule</h3>
            <p className="muted">
              Auto-fill times for all drafts. 1 photo = 1 content day, even if it goes to both Facebook and Instagram.
            </p>
            <div className="auto-spread-row">
              <label className="field">
                <span>Start date &amp; time</span>
                <input
                  type="datetime-local"
                  value={autoStart}
                  onChange={(e) => setAutoStart(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Frequency</span>
                <select
                  value={autoInterval}
                  onChange={(e) => setAutoInterval(e.target.value)}
                >
                  <option value="1">Every day</option>
                  <option value="2">Every 2 days</option>
                  <option value="3">Every 3 days</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={handleAutoSpread}
            >
              Apply auto schedule to drafts
            </button>
          </div>
          {files.length > 0 && (
            <div className="draft-grid">
              {files.map((draft) => (
                <div key={draft.id} className="draft-card">
                  <img
                    src={draft.previewUrl || draft.imageUrl}
                    alt={draft.file?.name || draft.title || "AI image"}
                    className="draft-image"
                  />
                    <div className="draft-body">
                      <div className="draft-row">
                        <span className="draft-title">{draft.file?.name || draft.title || "AI image"}</span>
                        <span className="draft-status">{draft.status}</span>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleRemoveDraft(draft.id)}
                        >
                          Remove
                        </button>
                      </div>
                    <label className="field">
                      <span>Caption + hashtags</span>
                      <textarea
                        value={draft.caption}
                        onChange={(e) => updateDraft(draft.id, { caption: e.target.value })}
                        rows={4}
                      />
                    </label>
                    <div className="field">
                      <span>Platforms</span>
                      <div className="platform-toggle">
                        <label>
                          <input
                            type="checkbox"
                            checked={draft.platforms.includes("fb")}
                            onChange={() => togglePlatform(draft.id, "fb")}
                          />
                          Facebook
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={draft.platforms.includes("ig")}
                            onChange={() => togglePlatform(draft.id, "ig")}
                          />
                          Instagram
                        </label>
                      </div>
                    </div>
                    <label className="field">
                      <span>Profile</span>
                      <details className="help-tip">
                        <summary aria-label="Profile help">?</summary>
                        <div className="help-text">
                          Select which brand account to use. Calgary uses the default page/IG token, while EPF and Wallpaper use their
                          own tokens.
                        </div>
                      </details>
                      <select
                        value={draft.profileKey}
                        onChange={(e) => updateDraft(draft.id, { profileKey: e.target.value })}
                      >
                        <option value="calgary">Calgary – Popcorn Ceiling Removal</option>
                        <option value="epf">EPF Pro Services</option>
                        <option value="wallpaper">Wallpaper Removal Pro</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Schedule time</span>
                      <input
                        type="datetime-local"
                        value={draft.scheduledLocal}
                        onChange={(e) => updateDraft(draft.id, { scheduledLocal: e.target.value })}
                      />
                    </label>
                    <div className="draft-actions">
                      <button
                        type="button"
                        onClick={() => handleGenerateCaption(draft)}
                        disabled={draft.aiLoading}
                      >
                        {draft.aiLoading ? "Generating..." : "AI caption"}
                      </button>
                    </div>
                    {draft.aiError && <p className="error-text">{draft.aiError}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="bulk-actions">
              <button
                type="button"
                className="secondary"
                onClick={handleAutoCaptionAll}
                disabled={bulkCaptionLoading}
              >
                {bulkCaptionLoading ? "Captioning..." : "AI captions for all drafts"}
              </button>
              <button
                className="primary"
                type="button"
                onClick={handleSaveSchedules}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save & send to scheduler"}
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>2. Queue / calendar (from D1)</h2>
          <p>These posts are stored in your D1 DB and picked up by the Worker Cron when time comes.</p>
          {Object.keys(profileLatest).length > 0 && (
            <div className="profile-summary">
              <strong>Scheduled until:</strong>
              <ul>
                {"calgary" in profileLatest && (
                  <li>
                    Calgary – Popcorn Ceiling Removal:&nbsp;
                    {fromUnixSeconds(profileLatest["calgary"])}
                  </li>
                )}
                {"epf" in profileLatest && (
                  <li>
                    EPF Pro Services:&nbsp;
                    {fromUnixSeconds(profileLatest["epf"])}
                  </li>
                )}
                {"wallpaper" in profileLatest && (
                  <li>
                    Wallpaper Removal Pro:&nbsp;
                    {fromUnixSeconds(profileLatest["wallpaper"])}
                  </li>
                )}
                {Object.keys(profileLatest)
                  .filter((k) => !["calgary", "epf", "wallpaper"].includes(k))
                  .map((k) => (
                    <li key={k}>
                      {k}: {fromUnixSeconds(profileLatest[k])}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <div className="queue-controls">
            <div className="filter-group">
              <label>
                Status:
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={hidePosted}
                  onChange={(e) => setHidePosted(e.target.checked)}
                />
                Hide published
              </label>
            </div>
          </div>
            {scheduledPosts.length === 0 ? (
              <p className="muted">No posts in queue yet.</p>
            ) : (
              <div className="scheduled-list">
                {scheduledPosts
                .filter((post) => {
                  if (hidePosted && post.status === "published") return false;
                  if (statusFilter === "all") return post.status !== "archived";
                  return post.status === statusFilter;
                })
                .map((post) => (
                  <div key={post.id} className="scheduled-row">
                    <div className="scheduled-main">
                      <div className="scheduled-title">{post.title || "Untitled"}</div>
                      <div className="scheduled-meta">
                        <span>{(post.platforms || "").toUpperCase()}</span>
                        <span>at {fromUnixSeconds(post.scheduled_at)}</span>
                        <span
                          className={
                            "profile-pill " +
                            (post.profile_key === "calgary"
                              ? "profile-calgary"
                              : post.profile_key === "epf"
                              ? "profile-epf"
                              : post.profile_key === "wallpaper"
                              ? "profile-wallpaper"
                              : "profile-default")
                          }
                        >
                          {post.profile_key === "calgary"
                            ? "Calgary"
                            : post.profile_key === "epf"
                            ? "EPF"
                            : post.profile_key === "wallpaper"
                            ? "Wallpaper"
                            : post.profile_key || "Default"}
                        </span>
                      </div>

                      {(post.error || post.log) && (
                        <div className="scheduled-log">
                          <details>
                            <summary>View log</summary>
                            <pre>{post.log || post.error}</pre>
                          </details>
                        </div>
                      )}
                    </div>

                    <div className="scheduled-actions">
                      <span className={`badge ${post.status}`}>{post.status}</span>

                      {post.status === "scheduled" && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleCancel(post.id)}
                            disabled={cancelingId === post.id}
                          >
                            {cancelingId === post.id ? "Cancelling..." : "Cancel"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handlePostNow(post.id)}
                            disabled={postingNowId === post.id}
                          >
                            {postingNowId === post.id ? "Posting..." : "Post now"}
                          </button>
                        </>
                      )}

                      {post.status === "failed" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleRetry(post.id)}
                          disabled={retryingId === post.id}
                        >
                          {retryingId === post.id ? "Retrying..." : "Retry"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleRemove(post.id)}
                        disabled={removingId === post.id}
                      >
                        {removingId === post.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        <section className="card">
          <h2>3. Token helper (manual)</h2>
          <p className="muted">
            When Facebook or Instagram tokens expire, use these tools to generate new tokens
            and then update your Worker secrets via the terminal.
          </p>
          <details className="help-tip">
            <summary aria-label="Token help">?</summary>
            <div className="help-text">
              Use Graph Explorer to generate tokens, then validate them in Access Token Debugger and update your Worker secrets.
            </div>
          </details>
          <div className="token-instructions">
            <ol>
              <li>Open Graph Explorer, pick your app, and click Get User Access Token with required scopes.</li>
              <li>Extend to a long-lived user token (info icon → Access Token Debugger → Extend).</li>
              <li>In Graph Explorer, call /me/accounts with the long-lived token; copy the Page token for each profile.</li>
              <li>Validate each Page/IG token in Access Token Debugger (check validity and scopes).</li>
              <li>In a terminal, from backend/, run:
                <pre>
npx wrangler secret put META_PAGE_ACCESS_TOKEN
npx wrangler secret put META_IG_ACCESS_TOKEN
npx wrangler secret put META_PAGE_ACCESS_TOKEN_EPF
npx wrangler secret put META_IG_ACCESS_TOKEN_EPF
npx wrangler secret put META_PAGE_ACCESS_TOKEN_WALLPAPER
npx wrangler secret put META_IG_ACCESS_TOKEN_WALLPAPER
                </pre>
              </li>
              <li>If IDs changed, also set META_PAGE_ID / META_IG_USER_ID and the EPF/WALLPAPER variants, then deploy:
                <pre>npx wrangler deploy</pre>
              </li>
            </ol>
          </div>
          <div className="token-buttons">
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
              className="secondary"
            >
              Open Graph Explorer
            </a>
            <a
              href="https://developers.facebook.com/tools/debug/accesstoken/"
              target="_blank"
              rel="noreferrer"
              className="secondary"
            >
              Access Token Debugger
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
