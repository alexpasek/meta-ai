// frontend/src/ImageGenerator.jsx
import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function ImageGenerator({ onImageGenerated, makeHeaders }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");

    try {
      const headers =
        typeof makeHeaders === "function"
          ? makeHeaders({ "Content-Type": "application/json" })
          : { "Content-Type": "application/json" };
      const res = await fetch(`${API_BASE}/api/ai/image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Image API failed (${res.status})`);
      }

      onImageGenerated?.(data.url, prompt);
      setPrompt("");
    } catch (e) {
      console.error("AI image error", e);
      setError(e.message || "AI image failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>AI image generator</h2>
      <p>Create on-brand images you can schedule like normal posts.</p>
      <label className="field">
        <span>Prompt</span>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Clean modern living room after popcorn ceiling removal in Calgary..."
        />
      </label>
      <button type="button" className="primary" onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate image"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
