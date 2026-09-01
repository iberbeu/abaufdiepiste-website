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

  // The sections are collapsed <details> elements — a TOC link must open its
  // target before scrolling, otherwise only the header shows. Scrolling is done
  // explicitly rather than via the native anchor jump, whose timing relative to
  // the just-changed layout is unreliable on iOS Safari with smooth scrolling.
  function openAndScrollTo(id) {
    const target = document.getElementById(id);
    if (!target) return false;
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  // The TOC is a <details>. On phones it stays collapsed so the manual starts
  // right below the intro; from the shared 681px breakpoint up there is room to
  // show it expanded. Matches the media query in website_anleitung.css.
  const wideViewport = window.matchMedia('(min-width: 681px)');

  function wireToc() {
    const toc = manualContent.querySelector('.manual-toc');
    if (toc) toc.open = wideViewport.matches;

    manualContent.querySelectorAll('.manual-toc a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (ev) => {
        const id = link.getAttribute('href').slice(1);
        if (!document.getElementById(id)) return;
        ev.preventDefault();
        // Collapse first on phones: the list would otherwise stay open above the
        // target and the scroll offset would be computed against a stale layout.
        if (toc && !wideViewport.matches) toc.open = false;
        openAndScrollTo(id);
        history.pushState(null, '', '#' + id);
      });
    });
    // Deep link straight to a section, e.g. after a reload on #bergab.
    const hash = location.hash.replace(/^#/, '');
    if (hash && openAndScrollTo(hash) && toc && !wideViewport.matches) toc.open = false;
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
    wireToc();
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
