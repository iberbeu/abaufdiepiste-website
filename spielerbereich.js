// Shared unlock logic for the Spielerbereich (owner-only area).
// Every section is stored AES-GCM-encrypted in spielerbereich_enc/*.bin; the access
// code (from the printed QR card) is the decryption key. Nothing secret lives in this
// file — without the right code the .bin files cannot be decrypted. The file format is
// documented in spielerbereich_source/build_spielerbereich.js (local only).
//
// The hub page owns the access gate. Section pages never show a form: they unlock
// with the stored code and send the visitor back to the hub if there is none.

(function () {
  const STORAGE_KEY = 'spielerbereichCode';
  // Key used while the manual was the only protected page; migrated on first read.
  const LEGACY_STORAGE_KEY = 'anleitungCode';
  const HUB_URL = 'spielerbereich.html';
  const ENC_DIR = 'spielerbereich_enc/';
  const FORMAT_VERSION = 1;
  const HEADER_LEN = 1 + 4 + 16 + 12; // version, iterations, salt, IV

  // Iteration counts outside this range mean a corrupt header, not a real build.
  const MIN_ITERATIONS = 100000;
  const MAX_ITERATIONS = 2000000;

  const ERROR_TEXT = {
    code: 'Dieser Code ist leider nicht gültig. Bitte prüfe die Karte in deiner Spieltasche.',
    // Section pages: the code the hub accepted does not open this file.
    stored: 'Dein gespeicherter Code passt nicht zu diesem Inhalt. Bitte öffne den Spielerbereich und gib den Code von der Karte neu ein.',
    load: 'Der Inhalt konnte nicht geladen werden. Bitte lade die Seite neu oder prüfe deine Internetverbindung.',
    unsupported: 'Dein Browser unterstützt die Entschlüsselung nicht (oder die Seite wird nicht über HTTPS geöffnet). Bitte verwende einen aktuellen Browser.',
  };

  // Trim + uppercase, exactly like build_spielerbereich.js. Phone keyboards with
  // "smart punctuation" turn a typed hyphen into an en/em dash — map those back.
  function normalize(code) {
    return (code || '').replace(/[‐-―−]/g, '-').trim().toUpperCase();
  }

  // ─── Code storage ────────────────────────────────────
  // localStorage first, sessionStorage as fallback (private modes that block the
  // former) — otherwise the hub → section hop would lose the code.
  function getStoredCode() {
    try {
      let code = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        if (!code) {
          code = legacy;
          try { localStorage.setItem(STORAGE_KEY, legacy); } catch (e) { /* keep the legacy entry */ }
        }
        // Only drop the old entry once the new key really holds a value.
        if (localStorage.getItem(STORAGE_KEY)) localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      if (code) return code;
    } catch (e) { /* localStorage unavailable */ }
    try {
      return sessionStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  // Returns whether the code could be kept at all. When it could not, the section
  // pages will not find it — the hub tells the visitor instead of looping silently.
  function storeCode(code) {
    try {
      localStorage.setItem(STORAGE_KEY, code);
      return true;
    } catch (e) { /* fall through to sessionStorage */ }
    try {
      sessionStorage.setItem(STORAGE_KEY, code);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearCode() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // ─── Decryption ──────────────────────────────────────
  // All files of one build share a salt, so a page that loads several files derives
  // the key once. Caching the promise also covers files requested in parallel.
  const keyCache = new Map();

  function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function deriveKey(code, salt, iterations) {
    const id = iterations + ':' + toHex(salt) + ':' + code;
    if (!keyCache.has(id)) {
      const promise = crypto.subtle
        .importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey'])
        .then((material) => crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        ));
      promise.catch(() => keyCache.delete(id));
      keyCache.set(id, promise);
    }
    return keyCache.get(id);
  }

  // Resolves { ok: true, bytes } or { ok: false, reason } with reason
  // 'code' (wrong code), 'load' (fetch failed / corrupt file) or 'unsupported'.
  async function decryptFile(name, code) {
    if (!(window.crypto && crypto.subtle)) return { ok: false, reason: 'unsupported' };
    code = normalize(code);
    if (!code) return { ok: false, reason: 'code' };

    let data;
    try {
      const res = await fetch(ENC_DIR + name);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      return { ok: false, reason: 'load' };
    }
    // Header + at least the 16-byte GCM tag; anything else is not a file we wrote.
    if (data.length < HEADER_LEN + 16 || data[0] !== FORMAT_VERSION) return { ok: false, reason: 'load' };

    const iterations = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1);
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return { ok: false, reason: 'load' };
    const salt = data.subarray(5, 21);
    const iv = data.subarray(21, HEADER_LEN);
    const ciphertext = data.subarray(HEADER_LEN);

    let key;
    try {
      key = await deriveKey(code, salt, iterations);
    } catch (e) {
      return { ok: false, reason: 'load' };
    }
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return { ok: true, bytes: new Uint8Array(plain) };
    } catch (e) {
      // AES-GCM authentication fails for a wrong key — that is the "wrong code" signal.
      return { ok: false, reason: 'code' };
    }
  }

  async function decryptText(name, code) {
    const res = await decryptFile(name, code);
    if (!res.ok) return res;
    return { ok: true, text: new TextDecoder().decode(res.bytes) };
  }

  // ─── Section pages ───────────────────────────────────
  function goToHub() {
    location.replace(HUB_URL);
  }

  // Unlocks one file with the stored code. Without a stored code the visitor is sent
  // to the hub and null is returned. Every other outcome is returned for the page to
  // show; the result carries the code so a page can decrypt further files.
  //
  // A stored code that does not open this file is NOT cleared and NOT bounced: the
  // fault may lie with this one file (e.g. a partial rebuild with a mistyped code)
  // rather than with the code, and only the hub — which checks the code against its
  // own file — may decide to forget it.
  async function loadSection(name) {
    const code = getStoredCode();
    if (!code) {
      goToHub();
      return null;
    }
    const res = await decryptFile(name, code);
    if (!res.ok && res.reason === 'code') return { code, ok: false, reason: 'stored' };
    return Object.assign({ code }, res);
  }

  window.Spielerbereich = {
    normalize,
    getStoredCode,
    storeCode,
    clearCode,
    decryptFile,
    decryptText,
    loadSection,
    errorMessage: (reason) => ERROR_TEXT[reason] || ERROR_TEXT.load,
  };
})();
