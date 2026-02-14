(function () {
  const PEPPER = "secmod-2026-k0";
  const SESSION_TAG = "session-v1";
  const CONFIG = {
    LOMONOSOV: { salt: "s_lomonosov_v1", hash: "92c835751bb5dc627549cf652317674668387413527a060c38db251aede1bd5a" },
    ARKHIMED: { salt: "s_arkhimed_v1", hash: "233ef44a72cb86590641b602d226908b9427a948de68bac9a628c8b4eb28908b" },
    LOVELACE: { salt: "s_lovelace_v1", hash: "6375620c7aa743a0f9e78b0beecfc64f40c0ba424e673e0fbdb1a90fdffb8b28" },
    MORSE: { salt: "s_morse_v1", hash: "48491298da3291e183403580846f4861cc05153b65fbb00c8a587710484cd91c" },
    VIGENERE: { salt: "s_vigenere_v1", hash: "865719a5abd4ac87e373304730f98f330c4efc480dfd5a1574b41083d41a6555" },
    DA_VINCI: { salt: "s_da_vinci_v1", hash: "c087c747e9dede340e6f924f013187417fb912fee8597ad1c154f491ef3978e6" },
    DEV: { salt: "s_dev_v1", hash: "9f89e4d87530a6650e8a17c98d06221dba9b5170515cf436249d2ea9c7744849" }
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

  async function guardPage(sectionId) {
    try {
      const unlocked = await isUnlocked(sectionId);
      if (unlocked) return true;
      const current = window.location.pathname.split("/").pop() || "";
      const next = normalizeNext(current + window.location.search + window.location.hash);
      const target = next ? `index.html?next=${encodeURIComponent(next)}` : "index.html";
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
