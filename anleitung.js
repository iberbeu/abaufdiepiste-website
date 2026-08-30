// Unlock logic for the protected Spielanleitung page.
// The manual is stored AES-GCM-encrypted in anleitung_payload.js; the access
// code (from the printed QR card) is the decryption key. Nothing secret lives
// in this file — without the right code the payload cannot be decrypted.
//
// Code sources, in order: URL hash (QR deep link), then localStorage (returning
// visitor), then the manual entry form.

(function () {
  const STORAGE_KEY = 'anleitungCode';

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gateForm');
  const gateCode = document.getElementById('gateCode');
  const gateError = document.getElementById('gateError');
  const manualContent = document.getElementById('manualContent');

  function normalize(code) {
    return (code || '').trim().toUpperCase();
  }

  function b64ToBytes(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async function decrypt(code) {
    const p = ANLEITUNG_PAYLOAD;
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(p.salt), iterations: p.iterations, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(p.iv) }, key, b64ToBytes(p.data)
    );
    return new TextDecoder().decode(plain);
  }

  function payloadAvailable() {
    return typeof ANLEITUNG_PAYLOAD !== 'undefined';
  }

  async function tryUnlock(code) {
    code = normalize(code);
    if (!code) return false;
    let html;
    try {
      html = await decrypt(code);
    } catch (e) {
      return false;
    }
    manualContent.innerHTML = html;
    manualContent.style.display = '';
    gate.style.display = 'none';
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (e) { /* private mode — session still works */ }
    return true;
  }

  const gateBtn = gateForm.querySelector('button[type="submit"]');
  let unlocking = false;

  gateForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (unlocking) return;
    if (!payloadAvailable()) {
      gateError.textContent = 'Die Anleitung konnte nicht geladen werden. Bitte lade die Seite neu oder prüfe deine Internetverbindung.';
      gateError.style.display = '';
      return;
    }
    unlocking = true;
    gateBtn.disabled = true;
    gateBtn.textContent = 'Wird geprüft …';
    const ok = await tryUnlock(gateCode.value);
    unlocking = false;
    gateBtn.disabled = false;
    gateBtn.textContent = 'Anleitung öffnen';
    if (!ok) {
      gateError.textContent = 'Dieser Code ist leider nicht gültig. Bitte prüfe die Karte in deiner Spieltasche.';
    }
    gateError.style.display = ok ? 'none' : '';
  });

  async function init() {
    // QR deep link: abaufdiepiste.ch/anleitung.html#CODE
    let hashCode = '';
    try {
      hashCode = decodeURIComponent(location.hash.replace(/^#/, ''));
    } catch (e) { /* malformed percent-encoding in hash — fall through to the form */ }
    if (hashCode && (await tryUnlock(hashCode))) {
      // Drop the code from the address bar so it is not shared via copied links.
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* localStorage unavailable */ }
    if (stored) await tryUnlock(stored);
  }

  init();
})();
