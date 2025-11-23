// frontend/src/App.jsx
import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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

function App() {
  const [files, setFiles] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);

  useEffect(() => {
    loadScheduled();
  }, []);

  async function loadScheduled() {
    try {
      const res = await fetch(`${API_BASE}/api/posts`);
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

  function updateDraft(id, patch) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function handleGenerateCaption(draft) {
    try {
      updateDraft(draft.id, { aiLoading: true, aiError: "" });
      const prompt = `Photo description: ${draft.file.name}. Service: popcorn ceiling removal / drywall / painting in Calgary or GTA.`;
      const res = await fetch(`${API_BASE}/api/ai/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, platform: "both" }),
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

  async function uploadFile(draft) {
    if (!draft.file) return null;

    const formData = new FormData();
    formData.append("file", draft.file);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
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
        title: draft.file.name,
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
          headers: { "Content-Type": "application/json" },
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

  async function handleCancel(id) {
    setCancelingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}/cancel`, { method: "POST" });
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Meta AI Scheduler</h1>
        <p>Drop photos, let AI write captions, and auto-post via Cloudflare Worker + Meta APIs.</p>
      </header>

      <main className="app-main">
        <section className="card">
          <h2>1. Upload photos</h2>
          <p>These stay in your browser. For posting, you will provide public URLs (R2, S3, etc.).</p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
          />
          {files.length > 0 && (
            <div className="draft-grid">
              {files.map((draft) => (
                <div key={draft.id} className="draft-card">
                  <img src={draft.previewUrl} alt={draft.file.name} className="draft-image" />
                  <div className="draft-body">
                    <div className="draft-row">
                      <span className="draft-title">{draft.file.name}</span>
                      <span className="draft-status">{draft.status}</span>
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
            <button
              className="primary"
              type="button"
              onClick={handleSaveSchedules}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save & send to scheduler"}
            </button>
          )}
        </section>

        <section className="card">
          <h2>2. Queue / calendar (from D1)</h2>
          <p>These posts are stored in your D1 DB and picked up by the Worker Cron when time comes.</p>
          {scheduledPosts.length === 0 ? (
            <p className="muted">No posts in queue yet.</p>
          ) : (
            <div className="scheduled-list">
              {scheduledPosts.map((post) => (
                <div key={post.id} className="scheduled-row">
                  <div>
                    <div className="scheduled-title">{post.title || "Untitled"}</div>
                    <div className="scheduled-meta">
                      <span>{(post.platforms || "").toUpperCase()}</span>
                      <span>at {fromUnixSeconds(post.scheduled_at)}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100">
                        {post.profile_key === "calgary"
                          ? "Calgary"
                          : post.profile_key === "epf"
                          ? "EPF"
                          : post.profile_key === "wallpaper"
                          ? "Wallpaper"
                          : post.profile_key || "Default"}
                      </span>
                    </div>
                  </div>
                  <div className={`badge ${post.status}`}>{post.status}</div>
                  {post.status === "scheduled" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleCancel(post.id)}
                      disabled={cancelingId === post.id}
                    >
                      {cancelingId === post.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
