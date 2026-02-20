(function () {
  const PEPPER = "secmod-2026-k0";
  const SESSION_TAG = "session-v1";
  const CONFIG = {
    // marker: path segments that identify the section root in window.location.pathname (file:// or http(s)://)
    // indexFile: entry point that contains the lock UI (authLock + sectionContent)
    LOMONOSOV: { salt: "s_lomonosov_v1", hash: "76876a82c1a2193bbb514e439a5c6acc4edd270a0ea3a708c58dae44d6cc0a0a", marker: ["LOMONOSOV"], indexFile: "index.html" },
    ARKHIMED: { salt: "s_arkhimed_v1", hash: "9e68bcf260f75d7be26cad204c5af765fa293139fa1d4f63aba3a3689e4b2a83", marker: ["ARKHIMED"], indexFile: "index.html" },
    LOVELACE: {
      salt: "s_lovelace_v1",
      hash: "3ef559236925c7dd31680ef8069454457c7b93d67aa5b299141d1167009521ee",
      hashes: [
        "3ef559236925c7dd31680ef8069454457c7b93d67aa5b299141d1167009521ee", // CLASSIC
        "a979532a9907bd50efe3889af617237cf2e09a4d82f9f5ab735f191fbb9bd4d1"  // ROBOT
      ],
      profileByHash: {
        "3ef559236925c7dd31680ef8069454457c7b93d67aa5b299141d1167009521ee": "CLASSIC",
        "a979532a9907bd50efe3889af617237cf2e09a4d82f9f5ab735f191fbb9bd4d1": "ROBOT"
      },
      defaultProfile: "CLASSIC",
      marker: ["LOVELACE"],
      indexFile: "index.html"
    },
    MORSE: { salt: "s_morse_v1", hash: "aaa6d1d79cfd0899326ff54752a2896b93c08f80770654ff570d48be04c2b280", marker: ["MORSE"], indexFile: "index.html" },
    VIGENERE: {
      salt: "s_vigenere_v1",
      hash: "993ebbd35915333f33acf92556e5dbf8a8e98f48472468772dbcdcdec86df5b0",
      hashes: [
        "993ebbd35915333f33acf92556e5dbf8a8e98f48472468772dbcdcdec86df5b0", // AB password
        "da1254614341001b0de039b977a7a13a70072b0dddd8a53de27ee10135822bce"  // M password
      ],
      profileByHash: {
        "993ebbd35915333f33acf92556e5dbf8a8e98f48472468772dbcdcdec86df5b0": "AB",
        "da1254614341001b0de039b977a7a13a70072b0dddd8a53de27ee10135822bce": "M"
      },
      defaultProfile: "AB",
      marker: ["VIGENERE"],
      indexFile: "index.html"
    },
    DA_VINCI: { salt: "s_da_vinci_v1", hash: "d23bc498afd2261ad2d685cd450b5046b16ae95e0ba2bd1897715255665a2440", marker: ["DA_VINCI"], indexFile: "index.html" },
    DEV: { salt: "s_dev_v1", hash: "d57653dca1fb1c9b4f3121f357a198dfea6a67430c6012b92a2e699da47af8a9", marker: ["dev", "morse"], indexFile: "editor.html" }
  };

  function storageKey(sectionId) {
    return `section.auth.${sectionId}`;
  }

  function profileStorageKey(sectionId) {
    return `section.auth.profile.${sectionId}`;
  }

  function getConfig(sectionId) {
    const cfg = CONFIG[sectionId];
    if (!cfg) throw new Error(`Unknown section: ${sectionId}`);
    return cfg;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  async function buildInputHash(sectionId, password) {
    const cfg = getConfig(sectionId);
    return sha256Hex(`${sectionId}|${cfg.salt}|${password}|${PEPPER}`);
  }

  function getAllowedHashes(sectionId) {
    const cfg = getConfig(sectionId);
    if (Array.isArray(cfg.hashes) && cfg.hashes.length) return cfg.hashes.slice();
    if (typeof cfg.hash === "string" && cfg.hash) return [cfg.hash];
    return [];
  }

  function getProfileFromHash(sectionId, hash) {
    const cfg = getConfig(sectionId);
    if (!cfg.profileByHash || typeof cfg.profileByHash !== "object") return "";
    const profile = cfg.profileByHash[hash];
    return typeof profile === "string" ? profile : "";
  }

  function getDefaultProfile(sectionId) {
    const cfg = getConfig(sectionId);
    if (typeof cfg.defaultProfile === "string" && cfg.defaultProfile) return cfg.defaultProfile;
    if (cfg.profileByHash && typeof cfg.profileByHash === "object") {
      const vals = Object.values(cfg.profileByHash).filter((v) => typeof v === "string" && v);
      if (vals.length) return vals[0];
    }
    return "";
  }

  function getProfile(sectionId) {
    const stored = sessionStorage.getItem(profileStorageKey(sectionId));
    if (stored) return stored;
    return getDefaultProfile(sectionId);
  }

  async function buildSessionToken(sectionId, hashOverride = "") {
    const cfg = getConfig(sectionId);
    const hash = hashOverride || getAllowedHashes(sectionId)[0] || "";
    return sha256Hex(`${sectionId}|${cfg.salt}|${hash}|${SESSION_TAG}`);
  }

  function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let x = 0;
    for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return x === 0;
  }

  async function isUnlocked(sectionId) {
    const actual = sessionStorage.getItem(storageKey(sectionId));
    if (!actual) return false;
    const allowed = getAllowedHashes(sectionId);
    for (let i = 0; i < allowed.length; i++) {
      const expected = await buildSessionToken(sectionId, allowed[i]);
      if (safeEqual(actual, expected)) return true;
    }
    return false;
  }

  function normalizeNext(raw) {
    const text = String(raw || "");
    if (!text) return "";
    if (text.includes(":") || text.startsWith("/") || text.startsWith("\\") || text.includes("..")) return "";
    return text;
  }

  function normalizeIndexPath(raw, fallback) {
    const text = String(raw || "").trim();
    const fb = String(fallback || "index.html");
    if (!text) return fb;
    // Only allow paths made of "../" and a fixed html filename (keeps redirect surface tight).
    // Examples: "index.html", "../index.html", "../../editor.html"
    if (!/^(\.\.\/)*[a-zA-Z0-9._-]+\.html$/.test(text)) return fb;
    if (text.includes("..") && !text.startsWith("../")) return fb;
    return text.replace(/^\.\/+/, "");
  }

  function getRequiredProfiles(options) {
    const required = [];
    if (options && typeof options.requiredProfile === "string" && options.requiredProfile.trim()) {
      required.push(options.requiredProfile.trim());
    }
    if (options && Array.isArray(options.requiredProfiles)) {
      for (const item of options.requiredProfiles) {
        if (typeof item === "string" && item.trim()) required.push(item.trim());
      }
    }
    return Array.from(new Set(required));
  }

  function isProfileAllowed(profile, requiredProfiles) {
    if (!Array.isArray(requiredProfiles) || !requiredProfiles.length) return true;
    if (typeof profile !== "string" || !profile) return false;
    return requiredProfiles.includes(profile);
  }

  function findLastSubarrayIndex(haystack, needle) {
    if (!Array.isArray(haystack) || !Array.isArray(needle) || needle.length === 0) return -1;
    for (let i = haystack.length - needle.length; i >= 0; i--) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  function computeAutoRedirect(sectionId) {
    const cfg = getConfig(sectionId);
    const marker = Array.isArray(cfg.marker) ? cfg.marker : [String(sectionId)];
    const indexFile = String(cfg.indexFile || "index.html");

    const parts = String(window.location.pathname || "").split("/").filter(Boolean);
    const start = findLastSubarrayIndex(parts, marker);
    if (start < 0) {
      // Fallback: same-dir index file.
      return {
        indexPath: indexFile,
        next: normalizeNext(indexFile === (parts[parts.length - 1] || "") ? "" : (parts[parts.length - 1] || "") + window.location.search + window.location.hash)
      };
    }

    const rootEnd = start + marker.length;
    const afterRoot = parts.slice(rootEnd); // may be ["index.html"] or ["sub","page.html"]
    const currentRel = afterRoot.join("/");

    // Directly opening the index of the section shouldn't create a redirect loop.
    const isIndexHere = currentRel === indexFile && afterRoot.length === 1;
    const next = isIndexHere ? "" : normalizeNext(currentRel + window.location.search + window.location.hash);

    const depthDirs = Math.max(0, afterRoot.length - 1);
    const up = depthDirs === 0 ? "" : "../".repeat(depthDirs);
    const indexPath = normalizeIndexPath(up + indexFile, indexFile);
    return { indexPath, next };
  }

  async function guardPage(sectionId, options = {}) {
    try {
      const auto = computeAutoRedirect(sectionId);
      const cfg = getConfig(sectionId);
      const overrideIndex = normalizeIndexPath(options.indexPath, auto.indexPath || cfg.indexFile || "index.html");
      const indexPath = overrideIndex || auto.indexPath;
      const requiredProfiles = getRequiredProfiles(options);
      const unlocked = await isUnlocked(sectionId);
      if (unlocked) {
        const profile = getProfile(sectionId);
        if (isProfileAllowed(profile, requiredProfiles)) return true;
        window.location.replace(indexPath);
        return false;
      }
      const next = auto.next;
      const target = next ? `${indexPath}?next=${encodeURIComponent(next)}` : indexPath;
      window.location.replace(target);
      return false;
    } catch (_) {
      window.location.replace("index.html");
      return false;
    }
  }

  async function initIndex(sectionId, options = {}) {
    const lockEl = document.getElementById("authLock");
    const contentEl = document.getElementById("sectionContent");
    const inputEl = document.getElementById("sectionPassword");
    const unlockBtn = document.getElementById("unlockSection");
    const errorEl = document.getElementById("sectionError");

    if (!lockEl || !contentEl || !inputEl || !unlockBtn || !errorEl) return;

    const showContent = () => {
      lockEl.hidden = true;
      contentEl.hidden = false;
    };

    if (await isUnlocked(sectionId)) {
      const currentProfile = getProfile(sectionId);
      if (typeof options.onAlreadyUnlocked === "function") {
        try { options.onAlreadyUnlocked({ sectionId, profile: currentProfile }); } catch (_) {}
      }
      showContent();
      return;
    }

    lockEl.hidden = false;
    contentEl.hidden = true;
    inputEl.focus();

    const tryUnlock = async () => {
      const entered = inputEl.value || "";
      const inputHash = await buildInputHash(sectionId, entered);
      const allowedHashes = getAllowedHashes(sectionId);
      let matchedHash = "";
      for (let i = 0; i < allowedHashes.length; i++) {
        if (safeEqual(inputHash, allowedHashes[i])) {
          matchedHash = allowedHashes[i];
          break;
        }
      }
      if (!matchedHash) {
        errorEl.textContent = "Неверный пароль.";
        inputEl.select();
        return;
      }

      const token = await buildSessionToken(sectionId, matchedHash);
      sessionStorage.setItem(storageKey(sectionId), token);
      const profile = getProfileFromHash(sectionId, matchedHash) || getDefaultProfile(sectionId);
      if (profile) sessionStorage.setItem(profileStorageKey(sectionId), profile);
      errorEl.textContent = "";
      inputEl.value = "";

      if (typeof options.onUnlockSuccess === "function") {
        try { options.onUnlockSuccess({ sectionId, profile, matchedHash }); } catch (_) {}
      }

      const next = normalizeNext(new URLSearchParams(window.location.search).get("next") || "");
      if (next) {
        window.location.replace(next);
        return;
      }
      showContent();
    };

    unlockBtn.addEventListener("click", tryUnlock);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryUnlock();
    });
  }

  window.SectionAuth = { guardPage, initIndex, getProfile };
})();
