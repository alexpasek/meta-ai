// frontend/src/ImageGenerator.jsx
import React, { useState } from "react";

const ENV_API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const CUSTOM_PROMPT_VALUE = "custom";

const TEMPLATE_VALUES = {
  cities: ["Mississauga", "Oakville", "Burlington", "Grimsby", "Hamilton"],
  neighbourhoods: [
    "City Centre",
    "Applewood",
    "Port Credit",
    "Bronte",
    "Glen Abbey",
    "Aldershot",
    "Millcroft",
    "Downtown",
    "Lakefront",
    "Meadowlands",
  ],
  phones: ["(905) 555-0123", "(416) 555-0456", "(647) 555-0789"],
};

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplates(text) {
  return text
    .replace(/\[CITY\]/g, randomItem(TEMPLATE_VALUES.cities))
    .replace(/\[NEIGHBOURHOOD\]/g, randomItem(TEMPLATE_VALUES.neighbourhoods))
    .replace(/\[PHONE_NUMBER\]/g, randomItem(TEMPLATE_VALUES.phones));
}

const PROMPT_OPTIONS = [
  {
    value: "mississauga-city-centre",
    label: "Mississauga - City Centre",
    variations: [
      'Realistic professional image for popcorn ceiling removal service in Mississauga City Centre. Bright modern condo living room near Square One style area, old popcorn ceiling being transformed into smooth flat white ceiling, clean floor protection, professional dustless sanding machine, trustworthy contractor look, eye-catching local home renovation advertising image. Add subtle readable text: "Popcorn Ceiling Removal Mississauga".',
      'High-quality before-and-after image showcasing popcorn ceiling removal in Mississauga City Centre. Modern urban condo interior with contractor using dustless sanding equipment, visible texture transformation from outdated to smooth ceiling, professional appearance, clean workspace protection, premium service advertising. Include text overlay: "Transform Your Ceiling Mississauga".',
      "Professional renovation marketing image for Mississauga City Centre popcorn ceiling removal. Show modern home interior, protected floors, sanding machinery with vacuum system, smooth white ceiling result, bright lighting emphasizing the transformation, trustworthy contractor aesthetic.",
    ],
  },
  {
    value: "mississauga-applewood",
    label: "Mississauga - Applewood",
    variations: [
      'High-quality realistic renovation image for popcorn ceiling removal in Applewood Mississauga. Show a clean protected room with contractor using dustless ceiling sander, outdated popcorn texture partly removed, smooth ceiling visible, bright natural light, neat professional workspace, premium local contractor service. Add subtle text area: "Smooth Ceilings in Applewood".',
      "Eye-catching popcorn removal image for Applewood Mississauga showcasing modern home transformation. Before-and-after visual with half old textured ceiling transitioning to smooth white finish, professional equipment, clean floor protection, bright ambiance, local contractor branding.",
      "Premium renovation photograph for Applewood ceiling services. Beautiful home interior, contractor with professional dustless sanding system, smooth ceiling transformation clearly visible, protected furniture and floors, fresh modern aesthetic, trustworthy local service presentation.",
    ],
  },
  {
    value: "mississauga-port-credit",
    label: "Mississauga - Port Credit",
    variations: [
      'Eye-catching home improvement image for popcorn ceiling removal in Port Credit Mississauga. Modern home interior with lake-area bright natural light, before-and-after ceiling transformation, left side old popcorn ceiling, right side smooth white ceiling, clean professional finish, premium contractor advertising style. Add text: "Popcorn Ceiling Removal Port Credit".',
      "Upscale home renovation image for Port Credit ceiling services. Show lakeside home interior with modern design, contractor using professional dustless equipment, visible texture removal process, smooth ceiling result, bright natural light from windows, premium local service aesthetic.",
      "Professional marketing image showcasing Port Credit home transformation. Split-screen before-and-after effect with textured ceiling converting to smooth modern finish, luxury home style, clean workspace, professional contractor appearance.",
    ],
  },
  {
    value: "random-template",
    label: "Random Auto Template",
    variations: [
      'Create a realistic professional popcorn ceiling removal service image for [CITY] in [NEIGHBOURHOOD]. Show a clean protected room, outdated popcorn ceiling being removed, smooth white ceiling transformation, professional dustless sanding machine, bright natural light, premium contractor service look, no messy dust, eye-catching local advertising image. Add subtle readable text: "Popcorn Ceiling Removal [CITY]".',
      "High-quality home renovation image for popcorn ceiling removal in [NEIGHBOURHOOD], [CITY]. Display contractor using modern dustless sanding equipment, before-and-after ceiling texture transformation, protected floors and furniture, bright professional workspace, premium local service presentation.",
      "Professional marketing photograph for [CITY] ceiling refinishing services in [NEIGHBOURHOOD]. Show modern home interior transformation from textured to smooth ceiling, clean equipment setup, bright natural lighting, trustworthy contractor aesthetic.",
    ],
  },
  {
    value: "with-phone",
    label: "With Contact Number",
    variations: [
      'Create a realistic local contractor advertisement for popcorn ceiling removal in [CITY], [NEIGHBOURHOOD]. Show a professional worker using a dustless ceiling sander in a clean protected room, old popcorn texture transforming into smooth flat white ceiling, bright modern home interior, premium trustworthy service look. Add bold readable text: "Popcorn Ceiling Removal" and "Call [PHONE_NUMBER]".',
      'Professional contractor marketing image for [CITY] ceiling services. Display [NEIGHBOURHOOD] home with popcorn removal in progress, dustless sanding equipment, smooth ceiling transformation visible, protected workspace, trustworthy professional appearance. Include prominent text: "[PHONE_NUMBER]" for local service contact.',
    ],
  },
  {
    value: "clean-minimal",
    label: "Clean Minimal Design",
    variations: [
      'Create a clean realistic marketing image for popcorn ceiling removal service in [CITY], [NEIGHBOURHOOD]. Show smooth ceiling transformation, protected floors, professional tools, bright home interior, fresh modern finish, premium local contractor feel, no phone number, no logo, no clutter. Add subtle text only: "Smooth Ceilings in [CITY]".',
      "Minimalist professional renovation photograph for [NEIGHBOURHOOD], [CITY]. Modern home with smooth ceiling finish, bright workspace, professional dustless equipment, clean aesthetic, premium contractor service appearance. Subtle branding only.",
    ],
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
  const [selectedPrompt, setSelectedPrompt] = useState(CUSTOM_PROMPT_VALUE);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState("3");
  const [savedImages, setSavedImages] = useState([]);
  const [selectedSavedKey, setSelectedSavedKey] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [error, setError] = useState("");
  const apiUrl = buildApiUrl || defaultApiUrl;

  const selectedSavedImage =
    savedImages.find((image) => image.key === selectedSavedKey) ||
    savedImages[0] ||
    null;

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
      const nextImages = Array.isArray(data.images) ? data.images : [];
      setSavedImages(nextImages);
      setSelectedSavedKey((currentKey) => {
        if (nextImages.some((image) => image.key === currentKey)) {
          return currentKey;
        }
        return nextImages[0]?.key || "";
      });
      setPreviewImage((currentPreview) => {
        if (nextImages.some((image) => image.key === currentPreview?.key)) {
          return currentPreview;
        }
        return nextImages[0] || null;
      });
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
        const filtered = next.filter((image) => {
          if (!image?.key || seen.has(image.key)) return false;
          seen.add(image.key);
          return true;
        });
        setSelectedSavedKey(filtered[0]?.key || "");
        setPreviewImage(filtered[0] || null);
        return filtered;
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
    if (value === CUSTOM_PROMPT_VALUE) {
      setPrompt("");
      return;
    }

    const option = PROMPT_OPTIONS.find((item) => item.value === value);
    if (option && option.variations) {
      const randomVariation = randomItem(option.variations);
      const filledPrompt = fillTemplates(randomVariation);
      setPrompt(filledPrompt);
    }
  }

  function handleGenerateVariation() {
    if (selectedPrompt === CUSTOM_PROMPT_VALUE) return;

    const option = PROMPT_OPTIONS.find((item) => item.value === selectedPrompt);
    if (option && option.variations) {
      const randomVariation = randomItem(option.variations);
      const filledPrompt = fillTemplates(randomVariation);
      setPrompt(filledPrompt);
    }
  }

  function handlePromptTextChange(value) {
    setPrompt(value);
    setSelectedPrompt(CUSTOM_PROMPT_VALUE);
  }

  function handleClearPrompt() {
    setSelectedPrompt(CUSTOM_PROMPT_VALUE);
    setPrompt("");
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
      setSavedImages((prev) => {
        const filtered = prev.filter((item) => item.key !== image.key);
        setSelectedSavedKey((currentKey) => {
          if (currentKey !== image.key) {
            return currentKey;
          }
          return filtered[0]?.key || "";
        });
        setPreviewImage((currentPreview) => {
          if (currentPreview?.key !== image.key) {
            return currentPreview;
          }
          return filtered[0] || null;
        });
        return filtered;
      });
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
          <option value={CUSTOM_PROMPT_VALUE}>Custom prompt</option>
          {PROMPT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            type="button"
            className="secondary"
            onClick={handleGenerateVariation}
            disabled={selectedPrompt === CUSTOM_PROMPT_VALUE}
          >
            Generate variation
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleClearPrompt}
          >
            Clear
          </button>
        </div>
        <textarea
          rows={7}
          value={prompt}
          onChange={(e) => handlePromptTextChange(e.target.value)}
          placeholder="Choose a preset or type your own prompt..."
        />
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
          <div className="saved-image-browser">
            <details className="saved-image-dropdown" open>
              <summary>Choose saved image</summary>
              <div className="saved-image-list">
                {savedImages.map((image) => {
                  const isSelected =
                    (selectedSavedImage?.key || "") === (image.key || "");
                  return (
                    <button
                      key={image.key || image.url}
                      type="button"
                      className={`saved-image-option ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedSavedKey(image.key || "");
                        setPreviewImage(image);
                      }}
                    >
                      <img
                        src={image.url}
                        alt={image.prompt || "Generated image"}
                        loading="lazy"
                      />
                      <div className="saved-image-option-text">
                        <p title={image.prompt}>
                          {image.prompt || "Generated image"}
                        </p>
                        <span>
                          {image.quality
                            ? `${image.quality} quality`
                            : "saved image"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </details>
            {selectedSavedImage ? (
              <div className="saved-image-preview-card">
                <button
                  type="button"
                  className="saved-image-preview-button"
                  onClick={() => setPreviewImage(selectedSavedImage)}
                  aria-label="Preview saved image"
                >
                  <img
                    src={selectedSavedImage.url}
                    alt={selectedSavedImage.prompt || "Generated image"}
                    loading="lazy"
                  />
                </button>
                <div className="image-library-meta compact-meta">
                  <p title={selectedSavedImage.prompt}>
                    {selectedSavedImage.prompt || "Generated image"}
                  </p>
                  <span>
                    {selectedSavedImage.quality
                      ? `${selectedSavedImage.quality} quality`
                      : "saved image"}
                  </span>
                </div>
                <div className="image-library-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onImageGenerated?.(
                        selectedSavedImage.url,
                        selectedSavedImage.prompt || "",
                        selectedSavedImage,
                      )
                    }
                  >
                    Use as draft
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => handleDelete(selectedSavedImage)}
                    disabled={deletingKey === selectedSavedImage.key}
                  >
                    {deletingKey === selectedSavedImage.key
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {previewImage ? (
        <div
          className="saved-image-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Saved image preview"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="saved-image-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="saved-image-modal-close"
              onClick={() => setPreviewImage(null)}
            >
              Close
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.prompt || "Generated image"}
            />
            <p>{previewImage.prompt || "Generated image"}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
