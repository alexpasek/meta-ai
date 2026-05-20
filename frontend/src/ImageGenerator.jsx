// frontend/src/ImageGenerator.jsx
import React, { useState } from "react";

const ENV_API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const PROMPT_OPTIONS = [
  {
    value: "mississauga-city-centre",
    label: "Mississauga - City Centre",
    prompt:
      'Realistic professional image for popcorn ceiling removal service in Mississauga City Centre. Bright modern condo living room near Square One style area, old popcorn ceiling being transformed into smooth flat white ceiling, clean floor protection, professional dustless sanding machine, trustworthy contractor look, eye-catching local home renovation advertising image. Add subtle readable text: "Popcorn Ceiling Removal Mississauga".',
  },
  {
    value: "mississauga-applewood",
    label: "Mississauga - Applewood",
    prompt:
      'High-quality realistic renovation image for popcorn ceiling removal in Applewood Mississauga. Show a clean protected room with contractor using dustless ceiling sander, outdated popcorn texture partly removed, smooth ceiling visible, bright natural light, neat professional workspace, premium local contractor service. Add subtle text area: "Smooth Ceilings in Applewood".',
  },
  {
    value: "mississauga-port-credit",
    label: "Mississauga - Port Credit",
    prompt:
      'Eye-catching home improvement image for popcorn ceiling removal in Port Credit Mississauga. Modern home interior with lake-area bright natural light, before-and-after ceiling transformation, left side old popcorn ceiling, right side smooth white ceiling, clean professional finish, premium contractor advertising style. Add text: "Popcorn Ceiling Removal Port Credit".',
  },
  {
    value: "oakville-bronte",
    label: "Oakville - Bronte",
    prompt:
      'Realistic premium renovation image for popcorn ceiling removal in Bronte Oakville. Beautiful living room with protected floors, professional contractor sanding ceiling with vacuum system, clean smooth ceiling finish, upscale home style, bright windows, luxury local service look. Add subtle readable text: "Popcorn Ceiling Removal Oakville".',
  },
  {
    value: "oakville-glen-abbey",
    label: "Oakville - Glen Abbey",
    prompt:
      'Professional marketing image for smooth ceiling refinishing in Glen Abbey Oakville. Show outdated popcorn ceiling changing into a smooth modern ceiling, clean room protection, drywall tools, premium home renovation feel, bright realistic photography, trustworthy contractor service. Add text: "Smooth Ceilings Glen Abbey".',
  },
  {
    value: "burlington-aldershot",
    label: "Burlington - Aldershot",
    prompt:
      'Realistic contractor service image for popcorn ceiling removal in Aldershot Burlington. Clean home interior, floor protection installed, professional dustless sanding machine on ceiling, smooth white ceiling transformation, no mess, bright natural light, eye-catching renovation advertising image. Add text: "Popcorn Ceiling Removal Burlington".',
  },
  {
    value: "burlington-millcroft",
    label: "Burlington - Millcroft",
    prompt:
      'High-end realistic image for popcorn ceiling removal in Millcroft Burlington. Modern family home living room, old textured ceiling partly removed, smooth ceiling finish shown, professional worker with sanding equipment, clean and organized workspace, premium local contractor advertising. Add subtle text: "Smooth Ceiling Experts Millcroft".',
  },
  {
    value: "grimsby-lakefront",
    label: "Grimsby - Lakefront",
    prompt:
      'Professional local SEO image for popcorn ceiling removal in Grimsby lakefront area. Bright home interior with outdated popcorn ceiling being removed, smooth white ceiling result, clean floor covering, dustless sanding equipment, fresh modern renovation look, trustworthy contractor ad style. Add text: "Popcorn Ceiling Removal Grimsby".',
  },
  {
    value: "grimsby-downtown",
    label: "Grimsby - Downtown",
    prompt:
      'Eye-catching before-and-after image for popcorn ceiling removal in Downtown Grimsby. Left side shows old popcorn texture, right side shows smooth flat ceiling, clean modern home, professional renovation setup, bright lighting, premium local service feel. Add readable text: "Smooth Ceilings Downtown Grimsby".',
  },
  {
    value: "ancaster-meadowlands",
    label: "Ancaster - Meadowlands",
    prompt:
      'Realistic premium renovation image for popcorn ceiling removal in Meadowlands Ancaster. Upscale home interior, contractor using dustless ceiling sander, protected floors and clean walls, smooth white ceiling transformation, bright natural light, professional trustworthy service image. Add text: "Popcorn Ceiling Removal Ancaster".',
  },
  {
    value: "ancaster-old-ancaster",
    label: "Ancaster - Old Ancaster",
    prompt:
      'Beautiful realistic home renovation image for popcorn ceiling removal in Old Ancaster. Classic home interior with popcorn ceiling being transformed into smooth ceiling, clean professional setup, ladder, sanding machine with vacuum hose, bright elegant finish, premium contractor advertising style. Add subtle text: "Smooth Ceilings Old Ancaster".',
  },
  {
    value: "random-city-auto",
    label: "Random City Auto Prompt",
    prompt:
      'Create a realistic professional popcorn ceiling removal service image for [CITY] in [NEIGHBOURHOOD]. Show a clean protected room, outdated popcorn ceiling being removed, smooth white ceiling transformation, professional dustless sanding machine, bright natural light, premium contractor service look, no messy dust, eye-catching local advertising image. Add subtle readable text: "Popcorn Ceiling Removal [CITY]".',
  },
  {
    value: "with-phone-number",
    label: "With Phone Number Version",
    prompt:
      'Create a realistic local contractor advertisement for popcorn ceiling removal in [CITY], [NEIGHBOURHOOD]. Show a professional worker using a dustless ceiling sander in a clean protected room, old popcorn texture transforming into smooth flat white ceiling, bright modern home interior, premium trustworthy service look. Add bold readable text: "Popcorn Ceiling Removal" and "Call [PHONE NUMBER]".',
  },
  {
    value: "no-phone-number",
    label: "No Phone Number Version",
    prompt:
      'Create a clean realistic marketing image for popcorn ceiling removal service in [CITY], [NEIGHBOURHOOD]. Show smooth ceiling transformation, protected floors, professional tools, bright home interior, fresh modern finish, premium local contractor feel, no phone number, no logo, no clutter. Add subtle text only: "Smooth Ceilings in [CITY]".',
  },
  {
    value: "random-local-seo",
    label: "Random Local SEO Prompt",
    prompt:
      "Generate a realistic popcorn ceiling removal image targeting one random local service area from this list: Mississauga City Centre, Applewood Mississauga, Port Credit Mississauga, Bronte Oakville, Glen Abbey Oakville, Aldershot Burlington, Millcroft Burlington, Downtown Grimsby, Grimsby Lakefront, Meadowlands Ancaster, Old Ancaster. Show a clean professional ceiling transformation with dustless sanding equipment, protected floors, smooth ceiling finish, bright home interior, premium contractor advertising style. Add readable local text with the selected city/neighbourhood.",
  },
];

function defaultApiUrl(path) {
  if (!ENV_API_BASE) return path;
  const normalized = ENV_API_BASE.replace(/\/+$/, "");
  return `${normalized}${path}`;
}

export default function ImageGenerator({
  onImageGenerated,
  makeHeaders,
  buildApiUrl,
}) {
  const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_OPTIONS[0].value);
  const [prompt, setPrompt] = useState(PROMPT_OPTIONS[0].prompt);
  const [count, setCount] = useState("3");
  const [savedImages, setSavedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [error, setError] = useState("");
  const apiUrl = buildApiUrl || defaultApiUrl;

  function getHeaders(extra = {}) {
    return typeof makeHeaders === "function" ? makeHeaders(extra) : extra;
  }

  async function loadSavedImages() {
    setLibraryLoading(true);
    try {
      const res = await fetch(apiUrl("/api/images"), {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Image library failed (${res.status})`);
      }
      setSavedImages(Array.isArray(data.images) ? data.images : []);
    } catch (e) {
      console.error("Image library error", e);
      setError(e.message || "Image library failed");
    } finally {
      setLibraryLoading(false);
    }
  }

  React.useEffect(() => {
    loadSavedImages();
  }, []);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(apiUrl("/api/ai/image"), {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prompt, count: Number(count) || 1 }),
      });
      const data = await res.json();
      const images = Array.isArray(data.images)
        ? data.images
        : data.url
          ? [{ url: data.url, key: data.key, prompt }]
          : [];
      if (!res.ok || !images.length) {
        throw new Error(data.error || `Image API failed (${res.status})`);
      }

      setSavedImages((prev) => {
        const next = [...images, ...prev];
        const seen = new Set();
        return next.filter((image) => {
          if (!image?.key || seen.has(image.key)) return false;
          seen.add(image.key);
          return true;
        });
      });
      setPrompt("");
    } catch (e) {
      console.error("AI image error", e);
      setError(e.message || "AI image failed");
    } finally {
      setLoading(false);
    }
  }

  function handlePromptChange(value) {
    setSelectedPrompt(value);
    const option = PROMPT_OPTIONS.find((item) => item.value === value);
    setPrompt(option?.prompt || "");
  }

  async function handleDelete(image) {
    if (!image?.key) return;
    setDeletingKey(image.key);
    setError("");
    try {
      const res = await fetch(
        apiUrl(`/api/images?key=${encodeURIComponent(image.key)}`),
        {
          method: "DELETE",
          headers: getHeaders(),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      setSavedImages((prev) => prev.filter((item) => item.key !== image.key));
    } catch (e) {
      console.error("Delete image error", e);
      setError(e.message || "Delete failed");
    } finally {
      setDeletingKey("");
    }
  }

  return (
    <section className="card image-generator-card">
      <div className="section-heading-row">
        <div>
          <h2>AI image generator</h2>
          <p>Create and save reusable image options for future posts.</p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={loadSavedImages}
          disabled={libraryLoading}
        >
          {libraryLoading ? "Refreshing..." : "Refresh library"}
        </button>
      </div>
      <label className="field">
        <span>Prompt</span>
        <select
          value={selectedPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
        >
          {PROMPT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <textarea rows={7} value={prompt} readOnly />
      </label>
      <div className="image-generator-actions">
        <label className="field compact-field">
          <span>How many</span>
          <select value={count} onChange={(e) => setCount(e.target.value)}>
            <option value="1">1 image</option>
            <option value="2">2 images</option>
            <option value="3">3 images</option>
            <option value="4">4 images</option>
            <option value="5">5 images</option>
            <option value="6">6 images</option>
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate and save"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="image-library">
        <div className="image-library-header">
          <h3>Saved AI images</h3>
          <span>{savedImages.length} saved</span>
        </div>
        {savedImages.length === 0 ? (
          <p className="muted small">No saved AI images yet.</p>
        ) : (
          <div className="image-library-grid">
            {savedImages.map((image) => (
              <div key={image.key || image.url} className="image-library-item">
                <img
                  src={image.url}
                  alt={image.prompt || "Generated image"}
                  loading="lazy"
                />
                <div className="image-library-meta">
                  <p title={image.prompt}>
                    {image.prompt || "Generated image"}
                  </p>
                  <span>
                    {image.quality ? `${image.quality} quality` : "saved image"}
                  </span>
                </div>
                <div className="image-library-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onImageGenerated?.(image.url, image.prompt || "", image)
                    }
                  >
                    Use as draft
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => handleDelete(image)}
                    disabled={deletingKey === image.key}
                  >
                    {deletingKey === image.key ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
