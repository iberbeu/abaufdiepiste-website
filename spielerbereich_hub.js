// Hub page of the Spielerbereich: access gate + card overview.
// The cards are stored encrypted (hub.bin), so decrypting them doubles as the code
// check. Code sources, in order: URL hash (QR deep link — also reached through the
// redirect on the old anleitung.html), then localStorage (returning visitor), then the
// manual entry form.

(function () {
  const SB = window.Spielerbereich;

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gateForm');
  const gateCode = document.getElementById('gateCode');
  const gateError = document.getElementById('gateError');
  const gateBtn = gateForm.querySelector('button[type="submit"]');
  const loading = document.getElementById('loading');
  const storageNote = document.getElementById('storageNote');
  const hubContent = document.getElementById('hubContent');
  const VIDEO_FILE = 'quickstart_video.bin';

  // Code that opened hub.bin — the Quickstart video (another .bin) is decrypted with it.
  let unlockedCode = '';

  // Shows the gate, with an error message if there is one.
  function showGate(message) {
    gate.style.display = '';
    gateError.textContent = message || '';
    gateError.style.display = message ? '' : 'none';
    gateCode.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  // Resolves the decryption result; on success the cards are shown and the code stored.
  async function tryUnlock(code) {
    code = SB.normalize(code);
    const res = await SB.decryptText('hub.bin', code);
    if (!res.ok) return res;
    hubContent.innerHTML = res.text;
    unlockedCode = code;
    hubContent.style.display = '';
    gate.style.display = 'none';
    // Without any storage the section pages cannot see the code and would send the
    // visitor straight back here — say so instead of looping silently.
    if (!SB.storeCode(code)) storageNote.style.display = '';
    return res;
  }

  let unlocking = false;

  gateForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (unlocking) return;
    unlocking = true;
    gateBtn.disabled = true;
    gateBtn.textContent = 'Wird geprüft …';
    const res = await tryUnlock(gateCode.value);
    unlocking = false;
    gateBtn.disabled = false;
    gateBtn.textContent = 'Spielerbereich öffnen';
    if (!res.ok) {
      showGate(SB.errorMessage(res.reason));
      return;
    }
    // The focused button was just hidden along with the gate; hand focus to the new
    // page heading so keyboard and screen-reader users are not left at the top.
    const heading = hubContent.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  });

  async function init() {
    // QR deep link: abaufdiepiste.ch/spielerbereich.html#CODE
    let hashCode = '';
    try {
      hashCode = decodeURIComponent(location.hash.replace(/^#/, ''));
    } catch (e) { /* malformed percent-encoding in hash — fall through to the form */ }
    const stored = SB.getStoredCode();

    const candidates = [hashCode, stored].filter((c, i, all) => c && all.indexOf(c) === i);
    if (!candidates.length) {
      showGate();
      return;
    }

    loading.style.display = '';
    let res = { ok: false, reason: 'code' };
    for (const code of candidates) {
      res = await tryUnlock(code);
      if (res.ok) {
        // Drop the code from the address bar so it is not shared via copied links.
        if (hashCode) history.replaceState(null, '', location.pathname + location.search);
        break;
      }
      if (res.reason !== 'code') break; // load problem — another code will not help
    }
    loading.style.display = 'none';
    if (res.ok) return;

    if (res.reason === 'code') {
      // A rejected stored code is stale (e.g. cleared cards) — forget it.
      if (stored) SB.clearCode();
      // Only a code the visitor just scanned deserves an error message.
      showGate(hashCode ? SB.errorMessage('code') : '');
    } else {
      showGate(SB.errorMessage(res.reason));
    }
  }

  // ─── Quickstart video ───────────────────────────────
  // The video is large (~14 MB), so it is only fetched and decrypted when the visitor
  // asks for it. The decrypted MP4 is handed to the <video> element as a Blob URL.
  // The card markup comes from hub.bin, so the click is caught via delegation.
  let videoLoading = false;

  async function playQuickstart(btn) {
    if (videoLoading) return;
    const video = document.getElementById('qsVideo');
    const error = document.getElementById('qsError');
    if (!video || !error) return;
    videoLoading = true;
    btn.disabled = true;
    const label = btn.querySelector('.qs-play-label');
    if (label) label.textContent = 'Video wird geladen …';
    error.style.display = 'none';

    const res = await SB.decryptFile(VIDEO_FILE, unlockedCode);
    videoLoading = false;
    if (!res.ok) {
      btn.disabled = false;
      if (label) label.textContent = 'Video abspielen';
      error.textContent = res.reason === 'code' ? SB.errorMessage('stored') : SB.errorMessage(res.reason);
      error.style.display = '';
      return;
    }
    video.src = URL.createObjectURL(new Blob([res.bytes], { type: 'video/mp4' }));
    video.style.display = '';
    btn.style.display = 'none';
    video.focus();
    // Autoplay after a user click is allowed; if a browser still refuses, the native
    // controls are visible and the visitor can press play.
    video.play().catch(() => {});
  }

  hubContent.addEventListener('click', (ev) => {
    const btn = ev.target.closest('#qsPlay');
    if (btn) playQuickstart(btn);
  });

  init();
})();
