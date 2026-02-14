(function () {
  const PEPPER = "secmod-2026-k0";
  const SESSION_TAG = "session-v1";
  const CONFIG = {
    // marker: path segments that identify the section root in window.location.pathname (file:// or http(s)://)
    // indexFile: entry point that contains the lock UI (authLock + sectionContent)
    LOMONOSOV: { salt: "s_lomonosov_v1", hash: "92c835751bb5dc627549cf652317674668387413527a060c38db251aede1bd5a", marker: ["LOMONOSOV"], indexFile: "index.html" },
    ARKHIMED: { salt: "s_arkhimed_v1", hash: "233ef44a72cb86590641b602d226908b9427a948de68bac9a628c8b4eb28908b", marker: ["ARKHIMED"], indexFile: "index.html" },
    LOVELACE: { salt: "s_lovelace_v1", hash: "6375620c7aa743a0f9e78b0beecfc64f40c0ba424e673e0fbdb1a90fdffb8b28", marker: ["LOVELACE"], indexFile: "index.html" },
    MORSE: { salt: "s_morse_v1", hash: "8bef6414e62bf04e84ab628cd2cc232830107b02369ba2c74df9c7eb963321b1", marker: ["MORSE"], indexFile: "index.html" },
    VIGENERE: { salt: "s_vigenere_v1", hash: "4814a0dbd4c3dfb0fef13f1bda8f432f42e7391b5d685834ea3d76c1a3c8da74", marker: ["VIGENERE"], indexFile: "index.html" },
    DA_VINCI: { salt: "s_da_vinci_v1", hash: "c087c747e9dede340e6f924f013187417fb912fee8597ad1c154f491ef3978e6", marker: ["DA_VINCI"], indexFile: "index.html" },
    DEV: { salt: "s_dev_v1", hash: "754acf06e56211f0798e7536ccbbc08f31fe8ddd6749bf23a73b909e7e4b6971", marker: ["dev", "morse"], indexFile: "editor.html" }
  };

  function storageKey(sectionId) {
    return `section.auth.${sectionId}`;
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

  async function buildSessionToken(sectionId) {
    const cfg = getConfig(sectionId);
    return sha256Hex(`${sectionId}|${cfg.salt}|${cfg.hash}|${SESSION_TAG}`);
  }

  function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let x = 0;
    for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return x === 0;
  }

  async function isUnlocked(sectionId) {
    const expected = await buildSessionToken(sectionId);
    const actual = sessionStorage.getItem(storageKey(sectionId));
    return safeEqual(actual || "", expected);
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
      const unlocked = await isUnlocked(sectionId);
      if (unlocked) return true;
      const auto = computeAutoRedirect(sectionId);
      const cfg = getConfig(sectionId);
      const overrideIndex = normalizeIndexPath(options.indexPath, auto.indexPath || cfg.indexFile || "index.html");
      const indexPath = overrideIndex || auto.indexPath;
      const next = auto.next;
      const target = next ? `${indexPath}?next=${encodeURIComponent(next)}` : indexPath;
      window.location.replace(target);
      return false;
    } catch (_) {
      window.location.replace("index.html");
      return false;
    }
  }

  async function initIndex(sectionId) {
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
      showContent();
      return;
    }

    lockEl.hidden = false;
    contentEl.hidden = true;
    inputEl.focus();

    const tryUnlock = async () => {
      const entered = inputEl.value || "";
      const inputHash = await buildInputHash(sectionId, entered);
      const targetHash = getConfig(sectionId).hash;
      if (!safeEqual(inputHash, targetHash)) {
        errorEl.textContent = "Неверный пароль.";
        inputEl.select();
        return;
      }

      const token = await buildSessionToken(sectionId);
      sessionStorage.setItem(storageKey(sectionId), token);
      errorEl.textContent = "";
      inputEl.value = "";

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

  window.SectionAuth = { guardPage, initIndex };
})();
