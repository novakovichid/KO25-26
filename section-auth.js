(function () {
  const PEPPER = "secmod-2026-k0";
  const SESSION_TAG = "session-v1";
  const CONFIG = {
    // marker: path segments that identify the section root in window.location.pathname (file:// or http(s)://)
    // indexFile: entry point that contains the lock UI (authLock + sectionContent)
    LOMONOSOV: { salt: "s_lomonosov_v1", hash: "41f609863324376ab6903709b8d34c7a2545c8e1ecfdb7f6f027a0395b9f190f", marker: ["LOMONOSOV"], indexFile: "index.html" },
    ARKHIMED: { salt: "s_arkhimed_v1", hash: "249873d862a29184b673a82fe5de54d5e83f191b2d633ec5e88dfcb6a71e80f3", marker: ["ARKHIMED"], indexFile: "index.html" },
    LOVELACE: {
      salt: "s_lovelace_v1",
      hash: "b8b38f933c4865894a20c8604360582f0c2c0f9443252b2c11a18a2e3e53129d",
      hashes: [
        "b8b38f933c4865894a20c8604360582f0c2c0f9443252b2c11a18a2e3e53129d", // CLASSIC
        "290933324e4f2eaa40870e3a38d2cecc2f287aa2e97f4979e732a690c33b3485"  // ROBOT
      ],
      profileByHash: {
        "b8b38f933c4865894a20c8604360582f0c2c0f9443252b2c11a18a2e3e53129d": "CLASSIC",
        "290933324e4f2eaa40870e3a38d2cecc2f287aa2e97f4979e732a690c33b3485": "ROBOT"
      },
      defaultProfile: "CLASSIC",
      marker: ["LOVELACE"],
      indexFile: "index.html"
    },
    MORSE: { salt: "s_morse_v1", hash: "501b82131479165ce6d6b688cccf9daf9ccb7316dda002ab036405390778ef09", marker: ["MORSE"], indexFile: "index.html" },
    VIGENERE: {
      salt: "s_vigenere_v1",
      hash: "56d0c5cd83703859ed05c79543136917494c5ba44c347c3a9d20fdecf8fd4d56",
      hashes: [
        "56d0c5cd83703859ed05c79543136917494c5ba44c347c3a9d20fdecf8fd4d56", // AB password
        "122fcd11013ec158645764b92150a5b4b73944354f30935f9aa34211b5d99a76"  // M password
      ],
      profileByHash: {
        "56d0c5cd83703859ed05c79543136917494c5ba44c347c3a9d20fdecf8fd4d56": "AB",
        "122fcd11013ec158645764b92150a5b4b73944354f30935f9aa34211b5d99a76": "M"
      },
      defaultProfile: "AB",
      marker: ["VIGENERE"],
      indexFile: "index.html"
    },
    DA_VINCI: { salt: "s_da_vinci_v1", hash: "1e03b7eb7a3fa616d53595bd24a40dd4a6afd27879025d78f5ca8a25461d2d6f", marker: ["DA_VINCI"], indexFile: "index.html" },
    DEV: { salt: "s_dev_v1", hash: "fb7c16cd406fd6339ae022a82ad6001aa112fd1ed4a28d9063c27438f808e65a", marker: ["dev", "morse"], indexFile: "editor.html" }
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
