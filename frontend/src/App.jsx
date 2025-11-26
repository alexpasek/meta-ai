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

// Domains + brands per profile
const PROFILE_DOMAINS = {
  calgary: "popcornceilingremovalcalgary.com",
  epf: "epfproservices.com",
  wallpaper: "wallpaperremovalpro.com", // change to real wallpaper domain if different
};

const PROFILE_BRANDS = {
  calgary: "Popcorn Ceiling Removal Calgary",
  epf: "EPF Pro Services",
  wallpaper: "Wallpaper Removal Pro",
};

// URL pools to rotate
const PROFILE_LINK_POOLS = {
  calgary: [
    "https://popcornceilingremovalcalgary.com",
    "https://popcornceilingremovalcalgary.com/popcorn-ceiling-removal-calgary",
  ],
  epf: [
    "https://epfproservices.com",
    "https://epfproservices.com/locations/popcorn-ceiling-removal-mississauga",
    "https://epfproservices.com/locations/popcorn-ceiling-removal-oakville",
    "https://epfproservices.com/locations/popcorn-ceiling-removal-burlington",
  ],
  wallpaper: [
    "https://wallpaperremovalpro.com",
    "https://wallpaperremovalpro.com/service-areas/toronto",
    "https://wallpaperremovalpro.com/service-areas/mississauga",
  ],
};

function pickProfileUrl(profileKey) {
  const pool = PROFILE_LINK_POOLS[profileKey] || [];
  if (!pool.length) return "";
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Clean caption so it matches the selected profile:
 * - Remove other brands & domains
 * - Ensure correct domain is present at most once as a CTA line.
 */
function normalizeCaptionForProfile(caption, profileKey) {
  if (!caption) return caption;

  const domain = PROFILE_DOMAINS[profileKey];
  const brand = PROFILE_BRANDS[profileKey];

  let text = caption;

  // Remove other domains
  Object.entries(PROFILE_DOMAINS).forEach(([key, d]) => {
    if (!d || key === profileKey) return;
    const variations = [`https://${d}`, `http://${d}`, `www.${d}`, d];
    variations.forEach((v) => {
      const re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      text = text.replace(re, "");
    });
  });

  // Remove other brands
  Object.entries(PROFILE_BRANDS).forEach(([key, b]) => {
    if (!b || key === profileKey) return;
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    text = text.replace(re, "");
  });

  text = text.replace(/\s{2,}/g, " ");

  if (domain) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const domainRegex = new RegExp(escaped, "i");
    const hasDomain = domainRegex.test(text);

    if (!hasDomain) {
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const firstHashtagIndex = lines.findIndex((l) => l.startsWith("#"));
      const cta = `Details at https://${domain}`;

      let newLines;
      if (firstHashtagIndex === -1) {
        newLines = [...lines, "", cta];
      } else {
        const before = lines.slice(0, firstHashtagIndex);
        const hashtags = lines.slice(firstHashtagIndex);
        newLines = [...before, "", cta, "", ...hashtags];
      }

      text = newLines.join("\n");
    }
  }

  return text.trim();
}

const SERVICE_TYPES = [
  { value: "popcorn", label: "Popcorn ceiling removal" },
  { value: "drywall", label: "Drywall installation / finishing" },
  { value: "painting", label: "Interior painting" },
  { value: "wallpaper", label: "Wallpaper removal" },
  { value: "baseboard", label: "Baseboard & trim" },
];

const CTA_MODES = [
  { value: "lead", label: "Lead – get a quote / DM" },
  { value: "brand", label: "Brand – follow / save" },
  { value: "review", label: "Review – ask for Google review" },
];

const IMAGE_LAYOUTS = [
  { value: "photo", label: "Photo only" },
  { value: "banner", label: "Banner graphic (headline + phone + website)" },
];

const BRAND_OVERLAY_OPTIONS = {
  epf: [
    "/overlays/epf/epf.PNG",
    "/overlays/epf/epf115CA6BE9-E6C2-4806-ACA1-DEB13513CE16.PNG",
    "/overlays/epf/epf1DBD203F6-11D3-4E5C-B0D0-32AE9817D575.PNG",
  ],
  calgary: [
    "/overlays/calgary/calgary.PNG",
    "/overlays/calgary/ChatGPT Image Nov 26, 2025, 12_26_05 AM.png",
  ],
};

const BANNER_STYLE_OPTIONS = [
  { value: "gentle", label: "Soft gradient (recommended)" },
  { value: "promo", label: "Promo bar (bold red)" },
  { value: "bold", label: "Bold red CTA" },
  { value: "darkglass", label: "Dark glass strip" },
  { value: "split", label: "Split bars (light top, dark footer)" },
  { value: "clean", label: "Clean white footer" },
  { value: "accent", label: "Teal accent bar" },
  { value: "brandpng", label: "Brand PNG overlay (auto)" },
];

// Neighbourhood pools for rotation (you can extend anytime)
const NEIGHBOURHOOD_POOLS = {
  calgary: [
    "Mahogany",
    "Auburn Bay",
    "McKenzie Towne",
    "Coventry Hills",
    "Panorama Hills",
    "Seton",
    "Chaparral",
    "Airdrie – Bayside",
    "Airdrie – Kings Heights",
    "Chestermere – Westmere",
  ],
  epf: [
    "Lorne Park (Mississauga)",
    "Port Credit (Mississauga)",
    "Clarkson (Mississauga)",
    "Mineola (Mississauga)",
    "River Oaks (Oakville)",
    "Bronte (Oakville)",
    "Glen Abbey (Oakville)",
    "Aldershot (Burlington)",
    "Downtown Burlington",
    "Ancaster (Hamilton)",
    "Stoney Creek (Hamilton)",
    "Old Milton",
  ],
  wallpaper: [
    "Etobicoke",
    "North York",
    "The Beaches",
    "Liberty Village",
    "Leslieville",
    "Danforth",
    "High Park",
  ],
};

// Service → slug for building SEO URLs
const SERVICE_SLUGS = {
  popcorn: "popcorn-ceiling-removal",
  drywall: "drywall-installation",
  painting: "interior-painting",
  wallpaper: "wallpaper-removal",
  baseboard: "baseboard-installation",
};

// Hashtag sets per profile (EPF = GTA version you sent)
const HASHTAG_SETS = {
  epf: {
    base: [
      "#popcornceilingremoval",
      "#ceilingsmoothing",
      "#ceilingrefinishing",
      "#mississauga",
      "#oakville",
      "#burlington",
      "#milton",
      "#hamilton",
      "#gta",
      "#mississaugahomes",
      "#oakvillehomes",
      "#burlingtonhomes",
      "#homerenovation",
      "#renovationservices",
      "#beforeandafterhome",
      "#drywallrepair",
      "#interiorpainting",
      "#ceilingmakeover",
      "#smoothceilings",
      "#contractorsofontario",
      "#gtacontractor",
      "#epfproservices",
      "#homemakeover",
      "#localcontractor",
    ],
    boosters: [
      "#mississaugarenovation",
      "#oakvillerenovation",
      "#burlingtonrenovation",
      "#hamiltonrenovation",
      "#ceilingrepair",
      "#skimcoat",
      "#level5finish",
      "#popcornremovalservice",
      "#drywallfinishing",
      "#homeimprovementcanada",
      "#renovationideas",
      "#homerenovationproject",
      "#houseupdate",
    ],
  },
  calgary: {
    base: [
      "#popcornceilingremoval",
      "#ceilingsmoothing",
      "#ceilingrefinishing",
      "#calgary",
      "#yyc",
      "#airdrie",
      "#chestermere",
      "#okotoks",
      "#yychomes",
      "#calgaryhomes",
      "#homerenovation",
      "#beforeandafterhome",
      "#interiorpainting",
      "#drywallrepair",
      "#smoothceilings",
      "#localcontractor",
    ],
    boosters: [
      "#calgaryrenovation",
      "#yycrenovation",
      "#yyccontractor",
      "#yycinteriors",
      "#yycpainting",
      "#yycdrywall",
      "#moveinready",
      "#prelisting",
      "#ceilingrepair",
      "#skimcoat",
      "#level5finish",
      "#popcornremovalservice",
      "#homeimprovementcanada",
    ],
  },
  wallpaper: {
    base: [
      "#wallpaperremoval",
      "#wallpaperremovalpro",
      "#gtahomes",
      "#toronto",
      "#etobicoke",
      "#northyork",
      "#mississauga",
      "#interiorpainting",
      "#homerenovation",
      "#beforeandafterhome",
    ],
    boosters: [
      "#wallpaperrepair",
      "#featurewall",
      "#accentwall",
      "#torontorenovation",
      "#gtarenovation",
      "#peelregion",
      "#renovationideas",
    ],
  },
};
const SERVICE_OPTIONS = [
  { id: "popcorn", label: "Popcorn ceiling removal" },
  { id: "drywall", label: "Drywall installation & finishing" },
  { id: "painting", label: "Interior painting" },
  { id: "wallpaper", label: "Wallpaper removal" },
  { id: "baseboard", label: "Baseboard / trim installation" },
];

const SERVICE_LABELS = {
  popcorn: "popcorn ceiling removal",
  drywall: "drywall installation and finishing",
  painting: "interior painting (walls, trim, doors)",
  wallpaper: "wallpaper removal and wall repair",
  baseboard: "baseboard and trim installation",
};

const SERVICE_BANNER_LABELS = {
  popcorn: "Popcorn ceiling removal",
  drywall: "Drywall & taping",
  painting: "Interior painting",
  wallpaper: "Wallpaper removal",
  baseboard: "Baseboard & trim",
};

const MODE_OPTIONS = [
  { id: "quick", label: "Quick (1–2 sentences)" },
  { id: "normal", label: "Normal (2–3 sentences)" },
  { id: "story", label: "Story (2–4 sentences)" },
];

const CAMPAIGN_OPTIONS = [
  { id: "", label: "None / regular" },
  { id: "moving", label: "New home / moving in" },
  { id: "sell", label: "Getting ready to sell" },
  { id: "holiday", label: "Holidays / guests coming" },
  { id: "refresh", label: "Refresh / update" },
];

/**
 * Base service URLs (canonical targets).
 * You can refine these as you build out SEO pages.
 */
const SERVICE_URLS = {
  calgary: {
    popcorn: "https://popcornceilingremovalcalgary.com",
    drywall: "https://popcornceilingremovalcalgary.com",
    painting: "https://popcornceilingremovalcalgary.com",
    wallpaper: "https://popcornceilingremovalcalgary.com",
    baseboard: "https://popcornceilingremovalcalgary.com",
  },
  epf: {
    popcorn: "https://epfproservices.com/services/popcorn-ceiling-removal/", // TODO: adjust to real page
    drywall: "https://epfproservices.com/services/drywall-installation/", // TODO
    painting: "https://epfproservices.com/services/interior-painting/", // TODO
    wallpaper: "https://epfproservices.com/services/wallpaper-removal/", // TODO
    baseboard: "https://epfproservices.com/services/baseboard-installation/", // TODO
  },
  wallpaper: {
    popcorn: "https://wallpaperremovalpro.com",
    drywall: "https://wallpaperremovalpro.com",
    painting: "https://wallpaperremovalpro.com",
    wallpaper: "https://wallpaperremovalpro.com",
    baseboard: "https://wallpaperremovalpro.com",
  },
};

/**
 * Pools of URLs per profile + service.
 * One is picked randomly per caption.
 */
const LINK_POOLS = {
  calgary: {
    popcorn: [
      "https://popcornceilingremovalcalgary.com",
      // add neighbourhood pages here later:
      // "https://popcornceilingremovalcalgary.com/locations/popcorn-ceiling-removal-calgary",
      // "https://popcornceilingremovalcalgary.com/locations/popcorn-ceiling-removal-airdrie",
    ],
    drywall: ["https://popcornceilingremovalcalgary.com"],
    painting: ["https://popcornceilingremovalcalgary.com"],
    wallpaper: ["https://popcornceilingremovalcalgary.com"],
    baseboard: ["https://popcornceilingremovalcalgary.com"],
    default: ["https://popcornceilingremovalcalgary.com"],
  },
  epf: {
    popcorn: [
      "https://epfproservices.com/popcorn-ceiling-removal",
      // later:
      // "https://epfproservices.com/locations/popcorn-ceiling-removal-mississauga",
      // "https://epfproservices.com/locations/popcorn-ceiling-removal-oakville",
    ],
    drywall: ["https://epfproservices.com/drywall-installation"],
    painting: ["https://epfproservices.com/interior-painting"],
    wallpaper: ["https://epfproservices.com/wallpaper-removal"],
    baseboard: ["https://epfproservices.com/baseboard-installation"],
    default: ["https://epfproservices.com"],
  },
  wallpaper: {
    wallpaper: [
      "https://wallpaperremovalpro.com",
      // future city pages here
    ],
    popcorn: ["https://wallpaperremovalpro.com"],
    drywall: ["https://wallpaperremovalpro.com"],
    painting: ["https://wallpaperremovalpro.com"],
    baseboard: ["https://wallpaperremovalpro.com"],
    default: ["https://wallpaperremovalpro.com"],
  },
};

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

/**
 * Caption history helpers (for uniqueness).
 */
function getCaptionHistoryKey(profileKey, serviceType) {
  return `captionHistory_v1_${profileKey || "default"}_${serviceType || "general"}`;
}

function loadCaptionHistory(profileKey, serviceType) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getCaptionHistoryKey(profileKey, serviceType));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveCaptionToHistory(profileKey, serviceType, normalizedBody) {
  if (typeof window === "undefined") return;
  const key = getCaptionHistoryKey(profileKey, serviceType);
  const existing = loadCaptionHistory(profileKey, serviceType);
  const next = [normalizedBody, ...existing.filter((v) => v !== normalizedBody)].slice(0, 30);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

function normalizeCaptionBody(body) {
  return (body || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getRandomServiceUrl(profileKey, serviceType) {
  const profilePools = LINK_POOLS[profileKey] || {};
  const servicePools = SERVICE_URLS[profileKey] || {};
  const profileCfg = PROFILE_CONFIG[profileKey];

  const servicePool = profilePools[serviceType];
  const defaultPool = profilePools.default;

  const chosenPool =
    (Array.isArray(servicePool) && servicePool.length && servicePool) ||
    (Array.isArray(defaultPool) && defaultPool.length && defaultPool) ||
    null;

  if (chosenPool) {
    const picked = pickRandom(chosenPool);
    if (picked) return picked;
  }

  return servicePools[serviceType] || (profileCfg && profileCfg.website) || "";
}

function extractSingleCaptionBody(text) {
  if (!text) return "";
  let t = String(text).trim();

  const lower = t.toLowerCase();
  const fbIdx = lower.indexOf("facebook caption");
  const igIdx = lower.indexOf("instagram caption");
  if (fbIdx !== -1 && igIdx !== -1 && igIdx > fbIdx) {
    t = t.slice(fbIdx, igIdx).trim();
  }

  t = t.replace(/^\s*\**facebook caption\**:?\s*/i, "");
  t = t.replace(/^\s*\**instagram caption\**:?\s*/i, "");

  const sepIdx = t.indexOf("---");
  if (sepIdx !== -1) {
    t = t.slice(0, sepIdx).trim();
  }

  return t.trim();
}

const PROFILE_OPTIONS = Object.entries(PROFILE_CONFIG).map(([key, value]) => ({ key, ...value }));
const DEFAULT_PROFILE_KEY = PROFILE_OPTIONS[0]?.key || "calgary";

// --- IG-SAFE IMAGE HELPERS ---

const IG_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const IG_MAX_WIDTH = 1440; // safe upper bound
const IG_MIN_ASPECT = 4 / 5; // 0.8
const IG_MAX_ASPECT = 1.91; // 1.91:1

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = URL.createObjectURL(file);
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function getOverlayOptionsForProfile(profileKey) {
  const key = (profileKey || "").toLowerCase();
  const staticList = BRAND_OVERLAY_OPTIONS[key] || [];
  return staticList.map((url) => {
    const name = url.split("/").pop() || url;
    const encodedUrl = encodeURI(url);
    return { id: url, url: encodedUrl, label: name };
  });
}

function getBrandOverlayUrl(profileKey, overlayId) {
  const opts = getOverlayOptionsForProfile(profileKey);
  if (!opts.length) return null;
  if (overlayId) {
    const found = opts.find((o) => o.id === overlayId);
    if (found) return found.url;
  }
  return opts[0].url;
}

/**
 * Make sure image is safe for Instagram Graph API:
 * - JPEG
 * - <= 8MB
 * - aspect ratio between 4:5 and 1.91:1
 * - width <= 1440px (scaled down if needed)
 */
async function prepareInstagramSafeImage(file) {
  // If it's already a small JPEG, just use it
  if (file && file.type === "image/jpeg" && file.size <= IG_MAX_BYTES) {
    return file;
  }

  if (!file || !file.type.startsWith("image/")) {
    return file;
  }

  const img = await loadImageFromFile(file);
  let { width, height } = img;

  let sx = 0;
  let sy = 0;
  let sWidth = width;
  let sHeight = height;

  const aspect = width / height;

  // Crop to valid aspect ratio range if needed
  if (aspect < IG_MIN_ASPECT) {
    // too tall – crop height
    const targetHeight = width / IG_MIN_ASPECT;
    sHeight = targetHeight;
    sy = (height - targetHeight) / 2;
  } else if (aspect > IG_MAX_ASPECT) {
    // too wide – crop width
    const targetWidth = height * IG_MAX_ASPECT;
    sWidth = targetWidth;
    sx = (width - targetWidth) / 2;
  }

  // Scale down if width too large
  let targetW = sWidth;
  let targetH = sHeight;

  if (targetW > IG_MAX_WIDTH) {
    const scale = IG_MAX_WIDTH / targetW;
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("Failed to encode image"));
        resolve(b);
      },
      "image/jpeg",
      0.8 // quality
    );
  });

  // If still somehow > 8MB, lower quality again
  let finalBlob = blob;
  if (finalBlob.size > IG_MAX_BYTES) {
    finalBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) return reject(new Error("Failed to encode image (2)"));
          resolve(b);
        },
        "image/jpeg",
        0.7
      );
    });
  }

  const newName = (file.name || "upload").replace(/\.[^.]+$/, "") + "-ig.jpg";

  return new File([finalBlob], newName, { type: "image/jpeg" });
}

function getProfileLabel(key) {
  if (!key) return "Default";
  return PROFILE_CONFIG[key]?.label || key;
}

function getProfileClass(key) {
  const safe = (key || "default").toLowerCase();
  return PROFILE_CONFIG[key] ? `profile-${safe}` : "profile-default";
}

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Pick a neighbourhood, try not to repeat the last one
function pickNeighbourhood(profileKey) {
  const pool = NEIGHBOURHOOD_POOLS[profileKey];
  if (!pool || pool.length === 0) return "";

  let lastIndex = -1;
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(`neighbourhoodIndex-${profileKey}`);
    if (stored) lastIndex = Number(stored);
  }

  let index = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && index === lastIndex) {
    index = (index + 1) % pool.length;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`neighbourhoodIndex-${profileKey}`, String(index));
  }
  return pool[index];
}

// Build SEO URL to a neighbourhood page (you can adjust exact patterns)
function buildNeighbourhoodUrl(profileKey, serviceType, neighbourhood) {
  const profile = PROFILE_CONFIG[profileKey];
  if (!profile) return "";
  const base = profile.website.replace(/\/+$/, "");
  const serviceSlug = SERVICE_SLUGS[serviceType] || SERVICE_SLUGS.popcorn;

  if (!neighbourhood) {
    if (profileKey === "epf") {
      return `${base}/locations/${serviceSlug}-mississauga`;
    }
    if (profileKey === "calgary") {
      return `${base}/locations/${serviceSlug}/calgary`;
    }
    if (profileKey === "wallpaper") {
      return `${base}/service-areas/toronto`;
    }
    return base;
  }

  if (profileKey === "calgary") {
    return `${base}/locations/${serviceSlug}/${slugify(neighbourhood)}`;
  }

  if (profileKey === "epf") {
    let citySlug = "mississauga";
    const match = neighbourhood.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      citySlug = slugify(match[1]);
    }
    return `${base}/locations/${serviceSlug}-${citySlug}/${slugify(neighbourhood)}`;
  }

  if (profileKey === "wallpaper") {
    return `${base}/service-areas/${slugify(neighbourhood)}`;
  }

  return base;
}

function buildHashtags(profileKey, serviceType) {
  const config = HASHTAG_SETS[profileKey];
  if (!config) return "";
  const base = config.base || [];
  const boosters = config.boosters || [];

  const serviceTagsMap = {
    popcorn: ["#popcornceilingremoval", "#smoothceilings", "#ceilingsmoothing"],
    drywall: ["#drywallinstallation", "#drywallfinishing", "#ceilingrepair"],
    painting: ["#interiorpainting", "#homepainting", "#painters"],
    wallpaper: ["#wallpaperremoval", "#wallpaperremovalpro"],
    baseboard: ["#baseboardinstallation", "#trimwork"],
  };

  const serviceTags = serviceTagsMap[serviceType] || [];
  const shuffledBoosters = [...boosters].sort(() => Math.random() - 0.5);
  const chosenBoosters = shuffledBoosters.slice(0, Math.min(8, boosters.length));

  const combined = [...base, ...serviceTags, ...chosenBoosters];

  const seen = new Set();
  const final = [];

  for (const tag of combined) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    final.push(tag);
    if (final.length >= 24) break;
  }

  return final.join(" ");
}

function computeTokenHealth(posts) {
  const summary = {};
  const now = Math.floor(Date.now() / 1000);
  const RECENT_WINDOW = 7 * 24 * 60 * 60;

  for (const post of posts || []) {
    const key = post.profile_key || "calgary";
    if (!summary[key]) {
      summary[key] = { lastOk: 0, lastError: 0 };
    }
    const s = summary[key];

    if (post.log && /FB OK|IG OK/.test(post.log)) {
      if (post.published_at && post.published_at > s.lastOk) {
        s.lastOk = post.published_at;
      }
    }

    const hasError =
      post.status === "failed" ||
      !!post.error ||
      (post.log && /fb_error|ig_.*error|OAuthException|invalid token|config_missing/i.test(post.log));

    if (hasError) {
      const t = post.updated_at || post.published_at || now;
      if (t > s.lastError) s.lastError = t;
    }
  }

  const result = {};
  for (const [key, { lastOk, lastError }] of Object.entries(summary)) {
    if (!lastError) {
      result[key] = "ok";
    } else if (!lastOk || lastError > lastOk) {
      const age = now - lastError;
      result[key] = age < RECENT_WINDOW ? "error" : "warning";
    } else {
      result[key] = "ok";
    }
  }
  return result;
}

function buildBannerOverlay(draft, profile) {
  const serviceKey = draft.serviceType || "popcorn";
  const serviceLabel =
    SERVICE_BANNER_LABELS[serviceKey] || "Home improvement services";

  const area = (draft.neighbourhood || profile.city || "").trim();
  const headline = area ? `${serviceLabel} in ${area}` : serviceLabel;

  let subline = (draft.offerText || "").trim();
  if (!subline) {
    if (serviceKey === "popcorn") {
      subline = "Smooth ceilings, dust-controlled removal, ready for paint.";
    } else if (serviceKey === "drywall") {
      subline = "Clean drywall, sharp corners, Level 5 finish available.";
    } else if (serviceKey === "painting") {
      subline = "Bright walls and ceilings, move-in ready finish.";
    } else if (serviceKey === "wallpaper") {
      subline = "Wallpaper off, walls repaired, prepped for paint.";
    } else if (serviceKey === "baseboard") {
      subline = "Crisp baseboards and trim to finish the room.";
    } else {
      subline = "Quality work, done on time and on budget.";
    }
  }

  const websiteRaw = profile.website || "";
  const domainFromMap = PROFILE_DOMAINS?.[draft.profileKey] || "";
  const websiteClean = (domainFromMap || websiteRaw)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const footerLeft = profile.brand || "Your company";
  const footerRight = websiteClean || profile.city || "";

  return { headline, subline, footerLeft, footerRight };
}

function PostPreview({ draft, profile }) {
  const image = draft.previewUrl || draft.imageUrl;
  const textParts = [draft.caption?.trim() || "", draft.hashtags?.trim() || ""].filter(Boolean);
  const combinedText = textParts.join("\n\n");
  if (!image && !combinedText) return null;

  const bannerOverlay =
    draft.imageLayout === "banner" ? buildBannerOverlay(draft, profile) : null;
  const bannerStyle = draft.bannerStyle || "bold";
  const brandInitial = (profile.brand || "E").charAt(0);
  const brandOverlayUrl =
    draft.bannerStyle === "brandpng"
      ? getBrandOverlayUrl(draft.profileKey, draft.overlayId)
      : null;

  return (
    <div className="post-preview">
      <div className="post-preview-header">
        <div className="avatar-circle">{profile.brand?.charAt(0) || "E"}</div>
        <div>
          <div className="post-preview-name">{profile.brand}</div>
          <div className="post-preview-sub">{profile.city}</div>
        </div>
      </div>
      {image && (
        <div className="post-preview-image-wrapper">
          <img
            src={image}
            alt={draft.file?.name || "Preview"}
            className="post-preview-image"
          />
                      {bannerOverlay && (
            bannerStyle === "brandpng" && brandOverlayUrl ? (
              <div
                className="brandpng-overlay"
                style={{ backgroundImage: `url(${brandOverlayUrl})` }}
              />
            ) : bannerStyle === "promo" ? (
              <div className={`banner-overlay banner-style-${bannerStyle}`}>
                <div className="promo-bar">
                  <div className="promo-logo-circle">{brandInitial}</div>
                  <div className="promo-text">
                    <div className="promo-title">{bannerOverlay.headline}</div>
                    <div className="promo-subtitle">{bannerOverlay.subline}</div>
                  </div>
                  <div className="promo-contact">
                    <div className="promo-contact-line">{bannerOverlay.footerLeft}</div>
                    <div className="promo-contact-line">{bannerOverlay.footerRight}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`banner-overlay banner-style-${bannerStyle}`}>
                <div className="banner-logo">
                  <div className="banner-logo-circle">{brandInitial}</div>
                </div>
                <div className="banner-top">
                  <div className="banner-headline">{bannerOverlay.headline}</div>
                  <div className="banner-subline">{bannerOverlay.subline}</div>
                </div>
                <div className="banner-bottom">
                  <div className="banner-brand">{bannerOverlay.footerLeft}</div>
                  <div className="banner-cta">{bannerOverlay.footerRight}</div>
                </div>
              </div>
            )
          )}
        </div>
      )}
      <div className="post-preview-body">
        {combinedText
          .split("\n")
          .filter((line) => line.trim().length)
          .map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
      </div>
    </div>
  );
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
  const [profileCheckKey, setProfileCheckKey] = useState(DEFAULT_PROFILE_KEY);
  const [profileCheckResult, setProfileCheckResult] = useState(null);
  const [profileCheckError, setProfileCheckError] = useState("");
  const [profileCheckLoading, setProfileCheckLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState({});
  const [profileCheckingKey, setProfileCheckingKey] = useState(null);
  const [fullAutoLoading, setFullAutoLoading] = useState(false);
  const [planProfileKey, setPlanProfileKey] = useState("calgary");
  const [planDays, setPlanDays] = useState("30");
  const [planServices, setPlanServices] = useState({
    popcorn: true,
    drywall: true,
    painting: false,
    wallpaper: false,
    baseboard: false,
  });

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

  const tokenHealth = React.useMemo(() => computeTokenHealth(scheduledPosts), [scheduledPosts]);

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
    const defaultProfileKey = "calgary";
    const defaultService = "popcorn";

    const mapped = list.map((file) => {
      const hashtags = buildHashtags(defaultProfileKey, defaultService);
      const serviceUrl = getRandomServiceUrl(defaultProfileKey, defaultService);

      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        hashtags,
        platforms: ["fb", "ig"],
        scheduledLocal: "",
        profileKey: defaultProfileKey,
        status: "draft",
        aiLoading: false,
        serviceType: defaultService,
        ctaMode: "lead",
        offerText: "",
        neighbourhood: "",
        serviceUrl,
        imageLayout: "photo",
        postType: "feed",
        bannerStyle: "gentle",
        overlayId: "",
      };
    });
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

  function computeAutoScheduleForDrafts(drafts, autoStartValue, autoIntervalValue, profileLatestMap) {
    const intervalDays = Number(autoIntervalValue) || 1;
    const msPerDay = 24 * 60 * 60 * 1000;

    const grouped = {};
    for (const draft of drafts) {
      const key = draft.profileKey || "default";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(draft);
    }

    const updatedById = {};

    for (const [profileKey, draftsForProfile] of Object.entries(grouped)) {
      let baseDate;

      if (autoStartValue) {
        baseDate = new Date(autoStartValue);
      } else {
        const last = profileLatestMap[profileKey];
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

    return drafts.map((d) => updatedById[d.id] || d);
  }

  async function generateCaptionForDraft(draft) {
    const profileCfg = PROFILE_CONFIG[draft.profileKey] || PROFILE_CONFIG.calgary;
    const serviceLabel = SERVICE_LABELS[draft.serviceType] || "home renovation";

    const serviceUrl = getRandomServiceUrl(draft.profileKey, draft.serviceType);
    const hashtags = buildHashtags(draft.profileKey, draft.serviceType);

    const history = loadCaptionHistory(draft.profileKey, draft.serviceType);

    let campaignDescription = "Campaign: regular everyday job (no special season).";
    if (draft.campaign === "moving") {
      campaignDescription =
        "Campaign: moving into a new home. If natural, mention that the owners just bought or got the keys and want ceilings/walls done before furniture arrives.";
    } else if (draft.campaign === "sell") {
      campaignDescription =
        "Campaign: getting the home ready to sell. If natural, mention listing photos, open houses, and first impressions.";
    } else if (draft.campaign === "holiday") {
      campaignDescription =
        "Campaign: holidays / guests. If natural, mention family visiting, hosting, or holiday gatherings.";
    } else if (draft.campaign === "refresh") {
      campaignDescription =
        "Campaign: refresh / update. If natural, mention updating an older home, making it brighter and cleaner.";
    }

    const lengthInstruction =
      draft.mode === "quick"
        ? "Keep it short: 1–2 short sentences."
        : draft.mode === "story"
        ? "Tell a mini-story in 2–4 short sentences (still concise)."
        : "Write 2–3 short sentences.";

    let finalCaption = "";
    let lastBody = "";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const extraDifferent =
        attempt === 2 && lastBody
          ? `
IMPORTANT: The previous attempt was too similar to older posts. Write a completely different version with a different first line and different sentence structure. Here is the previous text, DO NOT COPY IT:

"${lastBody}"
`
          : "";

      const bodyPrompt = `
Service: ${serviceLabel}.
Brand: ${profileCfg.brand}.
Area: ${profileCfg.city} (${profileCfg.seoLocation}).
${campaignDescription}

${lengthInstruction}

Write ONLY the caption body text for a Facebook/Instagram post:
- Sound like a real local contractor speaking in a simple, human way (not a big marketing agency).
- Mention the city/area naturally in the text.
- Focus on the homeowner's problem and the result (clean ceilings, smooth walls, fresh paint, better look before selling or moving in).
- Vary your hook style so the first line doesn't sound like a template.
- Do NOT include any website URL.
- Do NOT include hashtags.
${extraDifferent}
`;

      const res = await fetch(`${API_BASE}/api/ai/caption`, {
        method: "POST",
        headers: makeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          prompt: bodyPrompt,
          platform: "both",
          profile: draft.profileKey,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error || !data.text) {
        const message = data?.error || `AI caption failed (${res.status})`;
        throw new Error(message);
      }

      const rawBody = (data.text || "").trim();
      const cleanedBody = extractSingleCaptionBody(rawBody);
      const body = cleanedBody || rawBody;

      lastBody = body;

      const normalized = normalizeCaptionBody(body);
      const seen = history.includes(normalized);

      const composed = body + (serviceUrl ? `\n\n${serviceUrl}` : "");

      if (!seen || attempt === 2) {
        finalCaption = composed;
        saveCaptionToHistory(draft.profileKey, draft.serviceType, normalized);
        break;
      }
    }

    if (!finalCaption && lastBody) {
      const fallbackUrl = serviceUrl || getRandomServiceUrl(draft.profileKey, draft.serviceType);
      finalCaption = lastBody + (fallbackUrl ? `\n\n${fallbackUrl}` : "");
    }

    return {
      caption: finalCaption,
      hashtags,
      serviceUrl,
    };
  }

  async function handleGenerateCaption(draft) {
    try {
      updateDraft(draft.id, { aiLoading: true, aiError: "" });

      const { caption, hashtags, serviceUrl } = await generateCaptionForDraft(draft);

      updateDraft(draft.id, {
        caption,
        hashtags,
        serviceUrl,
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

  async function saveSchedulesForDrafts(drafts) {
    for (const draft of drafts) {
      const scheduledUnix = toUnixSeconds(draft.scheduledLocal);
      if (!scheduledUnix) continue;

      let imageUrl = draft.imageUrl;

      if (!imageUrl && draft.file) {
        try {
          imageUrl = await uploadFile(draft);
          updateDraft(draft.id, { imageUrl });
        } catch (err) {
          console.error("Upload error for draft", draft.id, err);
          continue;
        }
      }

      if (!imageUrl) continue;

      const normalizedCaption = normalizeCaptionForProfile(draft.caption, draft.profileKey);
      const hashtags =
        draft.hashtags && draft.hashtags.trim().length
          ? draft.hashtags
          : buildHashtags(draft.profileKey, draft.serviceType);
      const serviceUrl = draft.serviceUrl || getRandomServiceUrl(draft.profileKey, draft.serviceType);

      const body = {
        title: draft.file?.name || draft.title || "AI image",
        imageUrl,
        caption: normalizedCaption,
        hashtags,
        platforms: draft.platforms,
        scheduledAt: scheduledUnix,
        status: "scheduled",
        profileKey: draft.profileKey,
        postType: draft.postType || "feed",
        imageLayout: draft.imageLayout || "photo",
        ctaMode: draft.ctaMode || "lead",
        offerText: draft.offerText || "",
        neighbourhood: draft.neighbourhood || "",
        serviceType: draft.serviceType || "popcorn",
        serviceUrl,
      };

      await fetch(`${API_BASE}/api/posts`, {
        method: "POST",
        headers: makeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    }
  }

  async function handleFullAuto() {
    if (!files.length) {
      alert("No drafts to process.");
      return;
    }

    setFullAutoLoading(true);
    setLoading(true);
    try {
      let drafts = files.map((d) => ({ ...d }));

      // 1) Generate captions where missing/short
      for (const draft of drafts) {
        if (!draft.caption || draft.caption.trim().length < 10) {
          const { caption, hashtags, serviceUrl } = await generateCaptionForDraft(draft);
          draft.caption = caption;
          draft.hashtags = hashtags;
          draft.serviceUrl = serviceUrl;
        }
      }

      // 2) Auto schedule by profile
      drafts = computeAutoScheduleForDrafts(drafts, autoStart, autoInterval, profileLatest);

      // 3) Save to scheduler
      await saveSchedulesForDrafts(drafts);

      // 4) Update UI + reload queue
      setFiles(drafts);
      await loadScheduled();

      alert("Full auto complete: captions + schedule + send ✅");
    } catch (err) {
      console.error("Full auto error", err);
      alert(err?.message || "Full auto failed. Check console.");
    } finally {
      setFullAutoLoading(false);
      setLoading(false);
    }
  }

  async function handleAutoCaptionAll() {
    if (!files.length) {
      alert("No drafts to caption.");
      return;
    }
    setBulkCaptionLoading(true);
    try {
      const updated = [];
      for (const draft of files) {
        const { caption, hashtags, serviceUrl } = await generateCaptionForDraft(draft);
        updated.push({
          ...draft,
          caption,
          hashtags,
          serviceUrl,
          status: draft.status === "draft" || draft.status === "plan" ? "ready" : draft.status,
        });
      }
      setFiles(updated);
    } finally {
      setBulkCaptionLoading(false);
    }
  }

  function addAiDraft(url, prompt) {
    const defaultProfileKey = "calgary";
    const defaultService = "popcorn";
    const hashtags = buildHashtags(defaultProfileKey, defaultService);
    const serviceUrl = getRandomServiceUrl(defaultProfileKey, defaultService);

    setFiles((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        file: null,
        imageUrl: url,
        previewUrl: url,
        caption: "",
        hashtags,
        platforms: ["fb", "ig"],
        scheduledLocal: "",
        profileKey: defaultProfileKey,
        status: "draft-ai",
        sourcePrompt: prompt,
        aiLoading: false,
        serviceType: defaultService,
        ctaMode: "lead",
        offerText: "",
        neighbourhood: "",
        serviceUrl,
        imageLayout: "photo",
        postType: "feed",
        bannerStyle: "gentle",
        overlayId: "",
      },
    ]);
  }

  const BANNER_DRAW_STYLES = {
    gentle: {
      top: { type: "gradient", from: "rgba(15,23,42,0.55)", to: "rgba(15,23,42,0)" },
      bottom: { color: "rgba(0,0,0,0.6)" },
      textColor: "#f8fafc",
      footerColor: "#e5e7eb",
    },
    promo: {
      top: {
        type: "gradient",
        from: "rgba(0,0,0,0)",
        to: "rgba(0,0,0,0.55)",
      },
      bottom: { color: "rgba(214,0,0,0.95)" },
      textColor: "#ffffff",
      footerColor: "#ffffff",
    },
    bold: {
      top: { color: "rgba(220,38,38,0.9)" },
      bottom: { color: "rgba(17,24,39,0.82)" },
      textColor: "#fff",
      footerColor: "#f8fafc",
    },
    darkglass: {
      top: { color: "rgba(15,23,42,0.58)" },
      bottom: { color: "rgba(0,0,0,0.55)" },
      textColor: "#f8fafc",
      footerColor: "#e5e7eb",
    },
    split: {
      top: { color: "rgba(248,250,252,0.9)" },
      bottom: { color: "rgba(15,23,42,0.88)" },
      textColor: "#0f172a",
      footerColor: "#e2e8f0",
      subColor: "#334155",
    },
    clean: {
      top: { type: "gradient", from: "rgba(15,23,42,0.35)", to: "rgba(15,23,42,0.05)" },
      bottom: { color: "rgba(255,255,255,0.92)" },
      textColor: "#0f172a",
      footerColor: "#0f172a",
      subColor: "#475569",
    },
    accent: {
      top: { type: "gradient", from: "rgba(13,148,136,0.6)", to: "rgba(13,148,136,0.05)" },
      bottom: { color: "rgba(13,148,136,0.9)" },
      textColor: "#ecfeff",
      footerColor: "#e0f2f1",
      subColor: "#c7f7f2",
    },
    brandpng: {
      overlayByProfile: {
        epf: "/overlays/epf.PNG",
        calgary: "/overlays/calgary.PNG",
      },
    },
  };

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), x, y);
  }

  async function bakeBannerImage(draft) {
    const profile = PROFILE_CONFIG[draft.profileKey] || PROFILE_CONFIG.calgary;
    const style = BANNER_DRAW_STYLES[draft.bannerStyle || "gentle"] || BANNER_DRAW_STYLES.gentle;

    const img = await loadImageFromFile(draft.file);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0);

    // Optional PNG overlay (profile-specific)
    let overlayImg = null;
    const overlayUrl = draft.bannerStyle === "brandpng"
      ? getBrandOverlayUrl(draft.profileKey, draft.overlayId)
      : null;
    if (overlayUrl) {
      try {
        overlayImg = await loadImageFromUrl(overlayUrl);
      } catch (err) {
        console.warn("Failed to load overlay PNG", overlayUrl, err);
      }
    }

    if (overlayImg) {
      // Draw photo already placed; scale overlay to fully fit (no cropping)
      const scale = Math.min(canvas.width / overlayImg.width, canvas.height / overlayImg.height);
      const ow = overlayImg.width * scale;
      const oh = overlayImg.height * scale;
      const ox = (canvas.width - ow) / 2;
      const oy = (canvas.height - oh) / 2;
      ctx.drawImage(overlayImg, ox, oy, ow, oh);
    } else {
      const overlay = buildBannerOverlay(draft, profile);
      const topHeight = Math.round(canvas.height * 0.18);
      const bottomHeight = Math.round(canvas.height * 0.12);

      // Top bar
      if (style.top?.type === "gradient") {
        const grad = ctx.createLinearGradient(0, 0, 0, topHeight);
        grad.addColorStop(0, style.top.from);
        grad.addColorStop(1, style.top.to);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = style.top?.color || "rgba(0,0,0,0.6)";
      }
      ctx.fillRect(0, 0, canvas.width, topHeight);

      // Bottom bar
      ctx.fillStyle = style.bottom?.color || "rgba(0,0,0,0.7)";
      ctx.fillRect(0, canvas.height - bottomHeight, canvas.width, bottomHeight);

      // Logo bubble
      const logoSize = Math.max(26, Math.round(canvas.width * 0.04));
      const logoX = canvas.width - logoSize - 12;
      const logoY = 12;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(logoSize * 0.55)}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText((profile.brand || "E").charAt(0), logoX + logoSize / 2, logoY + logoSize / 2 + 1);

      // Text setup
      ctx.fillStyle = style.textColor || "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const padding = Math.round(canvas.width * 0.04);
      const maxWidth = canvas.width - padding * 2 - logoSize;

      ctx.font = `bold ${Math.round(canvas.width * 0.045)}px sans-serif`;
      wrapText(ctx, overlay.headline, padding, padding, maxWidth, Math.round(canvas.width * 0.05));

      ctx.fillStyle = style.subColor || style.textColor || "#fff";
      ctx.font = `600 ${Math.round(canvas.width * 0.03)}px sans-serif`;
      wrapText(
        ctx,
        overlay.subline,
        padding,
        padding + Math.round(canvas.width * 0.07),
        maxWidth,
        Math.round(canvas.width * 0.04)
      );

      // Footer
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = style.footerColor || "#f8fafc";
      ctx.font = `700 ${Math.round(canvas.width * 0.032)}px sans-serif`;
      const footerY = canvas.height - bottomHeight / 2;
      ctx.fillText(overlay.footerLeft, padding, footerY);

      ctx.textAlign = "right";
      ctx.font = `600 ${Math.round(canvas.width * 0.03)}px sans-serif`;
      ctx.fillText(overlay.footerRight, canvas.width - padding, footerY);
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) return reject(new Error("Failed to render banner"));
          resolve(b);
        },
        "image/jpeg",
        0.9
      );
    });

    const name =
      (draft.file.name || "banner")
        .replace(/\.[^.]+$/, "") + "-banner.jpg";

    return new File([blob], name, { type: "image/jpeg" });
  }

  async function uploadFile(draft) {
    if (!draft.file) return null;

    let fileToSend = draft.file;

    if (draft.imageLayout === "banner") {
      try {
        const baked = await bakeBannerImage(draft);
        if (baked) {
          fileToSend = baked;
        }
      } catch (err) {
        console.warn("Banner bake failed, sending original file", err);
      }
    }

    // Make image IG-safe before sending to backend
    const processedFile = await prepareInstagramSafeImage(fileToSend);

    const formData = new FormData();
    formData.append("file", processedFile);

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
    return data.url;
  }

  async function handleSaveSchedules() {
    setLoading(true);
    try {
      await saveSchedulesForDrafts(files);
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

    setFiles((prev) => computeAutoScheduleForDrafts(prev, autoStart, autoInterval, profileLatest));
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

  async function handleCheckProfileStatus(profileKey) {
    try {
      setProfileCheckingKey(profileKey);
      const res = await fetch(`${API_BASE}/api/meta/check-profile?key=${encodeURIComponent(profileKey)}`, {
        headers: makeHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Status check failed (${res.status})`);
      }
      setProfileStatus((prev) => ({ ...prev, [profileKey]: data }));
    } catch (err) {
      console.error("Profile status error", err);
      alert(err?.message || "Failed to check profile status");
    } finally {
      setProfileCheckingKey(null);
    }
  }

  async function handleProfileCheck() {
    setProfileCheckLoading(true);
    setProfileCheckError("");
    setProfileCheckResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/meta/check-profile`, {
        method: "POST",
        headers: makeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ profileKey: profileCheckKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Profile check failed (${res.status})`);
      }
      setProfileCheckResult(data);
    } catch (err) {
      console.error("Profile check error", err);
      setProfileCheckError(err?.message || "Profile check failed");
    } finally {
      setProfileCheckLoading(false);
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

          <div className="plan-panel">
            <h3>Quick plan (15–30 posts)</h3>
            <p className="muted">
              Generate empty drafts with schedule + services for one profile. Then drop photos, run AI captions, and save to scheduler.
            </p>
            <div className="plan-grid">
              <label className="field">
                <span>Profile</span>
                <select
                  value={planProfileKey}
                  onChange={(e) => setPlanProfileKey(e.target.value)}
                >
                  <option value="calgary">Calgary – Popcorn Ceiling Removal</option>
                  <option value="epf">EPF Pro Services (GTA)</option>
                  <option value="wallpaper">Wallpaper Removal Pro</option>
                </select>
              </label>
              <label className="field">
                <span>Number of posts</span>
                <select
                  value={planDays}
                  onChange={(e) => setPlanDays(e.target.value)}
                >
                  <option value="15">15</option>
                  <option value="30">30</option>
                </select>
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
            <div className="plan-services">
              <span className="field-label">Services to rotate</span>
              <div className="plan-service-checkboxes">
                {SERVICE_TYPES.map((svc) => (
                  <label key={svc.value}>
                    <input
                      type="checkbox"
                      checked={!!planServices[svc.value]}
                      onChange={(e) =>
                        setPlanServices((prev) => ({
                          ...prev,
                          [svc.value]: e.target.checked,
                        }))
                      }
                    />
                    {svc.label}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const total = Number(planDays) || 30;
                const enabled = SERVICE_TYPES.filter((s) => planServices[s.value]);
                if (!enabled.length) {
                  alert("Select at least one service for the plan.");
                  return;
                }

                const intervalDays = Number(autoInterval) || 1;
                const msPerDay = 24 * 60 * 60 * 1000;
                const start = autoStart ? new Date(autoStart) : new Date();

                const newDrafts = [];
                for (let i = 0; i < total; i++) {
                  const svc = enabled[i % enabled.length];
                  const dt = new Date(start.getTime() + i * intervalDays * msPerDay);
                  const scheduledLocal = formatDateTimeLocal(dt);
                  const neighbourhood = pickNeighbourhood(planProfileKey) || "";
                  const hashtags = buildHashtags(planProfileKey, svc.value);
                  const serviceUrl = getRandomServiceUrl(planProfileKey, svc.value);

                  newDrafts.push({
                    id: crypto.randomUUID(),
                    file: null,
                    imageUrl: "",
                    previewUrl: "",
                    caption: "",
                    hashtags,
                    platforms: ["fb", "ig"],
                    scheduledLocal,
                    profileKey: planProfileKey,
                    status: "plan",
                    aiLoading: false,
                    serviceType: svc.value,
                    ctaMode: "lead",
                    offerText: "",
                    neighbourhood,
                    serviceUrl,
                    imageLayout: "photo",
                    postType: "feed",
                    bannerStyle: "gentle",
                    overlayId: "",
                  });
                }

                setFiles((prev) => [...prev, ...newDrafts]);
              }}
            >
              Generate plan drafts
            </button>
          </div>

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
              {files.map((draft) => {
                const profileCfg = PROFILE_CONFIG[draft.profileKey] || PROFILE_CONFIG.calgary;
                const enabledPlatforms = draft.platforms || [];
                let platformLabel = "Facebook & Instagram";
                if (enabledPlatforms.length === 1) {
                  platformLabel = enabledPlatforms[0] === "ig" ? "Instagram" : "Facebook";
                } else if (enabledPlatforms.length === 0) {
                  platformLabel = "No platform selected";
                }

                return (
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

                      {/* Mode */}
                      <label className="field">
                        <span>Caption length / style</span>
                        <select
                          value={draft.mode}
                          onChange={(e) => updateDraft(draft.id, { mode: e.target.value })}
                        >
                          {MODE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* Campaign */}
                      <label className="field">
                        <span>Campaign (optional)</span>
                        <select
                          value={draft.campaign}
                          onChange={(e) => updateDraft(draft.id, { campaign: e.target.value })}
                        >
                          {CAMPAIGN_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Caption</span>
                        <textarea
                          value={draft.caption}
                          onChange={(e) => updateDraft(draft.id, { caption: e.target.value })}
                          rows={4}
                        />
                      </label>

                      <label className="field">
                        <span>Service type</span>
                        <details className="help-tip">
                          <summary aria-label="Service help">?</summary>
                          <div className="help-text">
                            Tells AI which service this photo is for. It changes the wording, website line and hashtags
                            (popcorn, drywall, interior painting, wallpaper, baseboards).
                          </div>
                        </details>

                        <select
                          value={draft.serviceType}
                          onChange={(e) => {
                            const serviceType = e.target.value;
                            const hashtags = buildHashtags(draft.profileKey, serviceType);
                            const serviceUrl = getRandomServiceUrl(draft.profileKey, serviceType);
                            updateDraft(draft.id, { serviceType, hashtags, serviceUrl });
                          }}
                        >
                          <option value="popcorn">Popcorn ceiling removal</option>
                          <option value="drywall">Drywall / taping / repair</option>
                          <option value="painting">Interior painting</option>
                          <option value="wallpaper">Wallpaper removal</option>
                          <option value="baseboard">Baseboards & trim</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Neighbourhood (optional)</span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            type="text"
                            value={draft.neighbourhood || ""}
                            onChange={(e) => updateDraft(draft.id, { neighbourhood: e.target.value })}
                            placeholder="e.g. Lorne Park, Mahogany…"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft(draft.id, {
                                neighbourhood: pickNeighbourhood(draft.profileKey),
                              })
                            }
                          >
                            Random
                          </button>
                        </div>
                      </label>

                      <label className="field">
                        <span>CTA mode</span>
                        <select
                          value={draft.ctaMode || "lead"}
                          onChange={(e) => updateDraft(draft.id, { ctaMode: e.target.value })}
                        >
                          {CTA_MODES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Offer / promo (optional)</span>
                        <input
                          type="text"
                          value={draft.offerText || ""}
                          onChange={(e) => updateDraft(draft.id, { offerText: e.target.value })}
                          placeholder='e.g. "Book before Jan 31 and get free ceiling primer"'
                        />
                      </label>

                      <label className="field">
                        <span>Image layout</span>
                        <select
                          value={draft.imageLayout || "photo"}
                          onChange={(e) => {
                            const imageLayout = e.target.value;
                            updateDraft(draft.id, {
                              imageLayout,
                              postType: imageLayout === "banner" ? "banner" : "feed",
                            });
                          }}
                        >
                          {IMAGE_LAYOUTS.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                        {draft.imageLayout === "banner" && (
                          <>
                            <p className="muted">
                              Design this photo as a banner like the HVAC / pigeon examples – bold headline with city + service, plus phone &amp; website on the image.
                            </p>
                            <label className="field">
                              <span>Banner style</span>
                              <select
                                value={draft.bannerStyle || "bold"}
                                onChange={(e) => updateDraft(draft.id, { bannerStyle: e.target.value })}
                              >
                                {BANNER_STYLE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {draft.bannerStyle === "brandpng" && (
                              <label className="field">
                                <span>Overlay image (auto-detected)</span>
                                <select
                                  value={draft.overlayId || getOverlayOptionsForProfile(draft.profileKey)[0]?.id || ""}
                                  onChange={(e) => updateDraft(draft.id, { overlayId: e.target.value })}
                                >
                                  {getOverlayOptionsForProfile(draft.profileKey).map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </>
                        )}
                      </label>

                      <label className="field">
                        <span>Post type</span>
                        <details className="help-tip">
                          <summary aria-label="Post type help">?</summary>
                          <div className="help-text">
                            • <strong>Regular feed</strong> – normal photo post for FB/IG.
                            <br />
                            • <strong>Banner / promo</strong> – Canva-style image with text bar (good for Google Maps posts or ads).
                            <br />
                            Scheduler posts both the same way; this guides captions and keeps things organised.
                          </div>
                        </details>

                        <select
                          value={draft.postType || "feed"}
                          onChange={(e) => {
                            const postType = e.target.value;
                            const next = { postType };
                            // Sync layout with post type for clearer behavior
                            if (postType === "banner") {
                              next.imageLayout = "banner";
                            } else {
                              next.imageLayout = "photo";
                            }
                            updateDraft(draft.id, next);
                          }}
                        >
                          <option value="feed">Regular feed photo</option>
                          <option value="banner">Banner / promo graphic</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Hashtags (auto-filled, editable)</span>
                        <textarea
                          value={draft.hashtags || ""}
                          onChange={(e) => updateDraft(draft.id, { hashtags: e.target.value })}
                          rows={2}
                        />
                      </label>

                      <PostPreview
                        draft={draft}
                        profile={PROFILE_CONFIG[draft.profileKey] || PROFILE_CONFIG.calgary}
                      />
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
                        onChange={(e) => {
                          const profileKey = e.target.value;
                          const hashtags = buildHashtags(profileKey, draft.serviceType);
                          const serviceUrl = getRandomServiceUrl(profileKey, draft.serviceType);
                          updateDraft(draft.id, { profileKey, hashtags, serviceUrl });
                        }}
                      >
                        {Object.entries(PROFILE_CONFIG).map(([key, cfg]) => (
                          <option key={key} value={key}>
                            {cfg.label}
                            </option>
                          ))}
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
                );
              })}
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
                type="button"
                className="secondary"
                onClick={handleFullAuto}
                disabled={fullAutoLoading || loading}
              >
                {fullAutoLoading ? "Running full auto 🚀" : "Full auto 🚀 (caption + schedule + send)"}
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
                {Object.entries(profileLatest).map(([key, ts]) => (
                  <li key={key}>
                    {getProfileLabel(key)}:&nbsp;
                    {fromUnixSeconds(ts)}
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
                          className={`profile-pill ${getProfileClass(post.profile_key)}`}
                        >
                          {getProfileLabel(post.profile_key)}
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
          <div className="profile-status-list">
            <h3>Account status</h3>
            <p className="muted">
              Check if each profile has valid Page and Instagram tokens configured.
            </p>
            {Object.entries(PROFILE_CONFIG).map(([key, cfg]) => {
              const status = profileStatus[key];
              return (
                <div key={key} className="profile-status-row">
                  <div className="profile-status-main">
                    <div className="profile-status-title">
                      <strong>{cfg.label}</strong>
                      <span className="profile-status-key">({key})</span>
                    </div>
                    {status && (
                      <div className="profile-status-detail">
                        <div>
                          <strong>Facebook:</strong>{" "}
                          {!status.fb?.configured
                            ? "Not configured"
                            : status.fb.ok
                            ? `OK (id: ${status.fb.data?.id || "?"})`
                            : "Error"}
                        </div>
                        <div>
                          <strong>Instagram:</strong>{" "}
                          {!status.ig?.configured
                            ? "Not configured"
                            : status.ig.ok
                            ? `OK (id: ${status.ig.data?.id || "?"})`
                            : "Error"}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="profile-status-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleCheckProfileStatus(key)}
                      disabled={profileCheckingKey === key}
                    >
                      {profileCheckingKey === key ? "Checking..." : "Check tokens"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="token-health">
            <h3>Token status (based on recent posts)</h3>
            <ul>
              {["calgary", "epf", "wallpaper"].map((key) => {
                const status = tokenHealth[key] || "unknown";
                const label = PROFILE_CONFIG[key]?.label || key;
                return (
                  <li key={key} className={`token-pill token-${status}`}>
                    <span>{label}</span>
                    <span className="token-status-label">
                      {status === "ok" && "✅ Looks good – recent posts succeeded"}
                      {status === "warning" && "⚠️ Older errors, but later posts succeeded"}
                      {status === "error" && "❌ Recent failures – check tokens & logs"}
                      {status === "unknown" && "— No recent posts to check"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="token-checker">
            <h3>Check tokens</h3>
            <div className="token-check-row">
              <label className="field">
                <span>Profile</span>
                <select value={profileCheckKey} onChange={(e) => setProfileCheckKey(e.target.value)}>
                  {PROFILE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={handleProfileCheck}
                disabled={profileCheckLoading}
              >
                {profileCheckLoading ? "Checking..." : "Check tokens"}
              </button>
            </div>
            {profileCheckError && <p className="error-text">{profileCheckError}</p>}
            {profileCheckResult && (
              <div className="token-check-result">
                <pre>{JSON.stringify(profileCheckResult, null, 2)}</pre>
              </div>
            )}
          </div>
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
