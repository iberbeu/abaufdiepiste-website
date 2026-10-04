// Section page: Quickstart (gameplay video + step-by-step guide + quick reference).
// Unlocks with the code stored by the hub (spielerbereich.js sends visitors without
// one back to the hub). The text comes from quickstart.bin; the video is a separate,
// much larger file (quickstart_video.bin, ~14 MB) that is only fetched and decrypted
// when the visitor presses play. It reaches the <video> element as a Blob URL.

(function () {
  const SB = window.Spielerbereich;
  const TEXT_FILE = 'quickstart.bin';
  const VIDEO_FILE = 'quickstart_video.bin';

  const loading = document.getElementById('loading');
  const loadError = document.getElementById('loadError');
  const hubLink = document.getElementById('hubLink');
  const content = document.getElementById('quickstartContent');

  let code = '';
  let videoLoading = false;

  async function playVideo(btn) {
    if (videoLoading) return;
    const video = document.getElementById('qsVideo');
    const error = document.getElementById('qsError');
    if (!video || !error) return;
    videoLoading = true;
    btn.disabled = true;
    const label = btn.querySelector('.qs-play-label');
    if (label) label.textContent = 'Video wird geladen …';
    error.style.display = 'none';

    const res = await SB.decryptFile(VIDEO_FILE, code);
    videoLoading = false;
    if (!res.ok) {
      btn.disabled = false;
      if (label) label.textContent = 'Video abspielen';
      error.textContent = SB.errorMessage(res.reason === 'code' ? 'stored' : res.reason);
      error.style.display = '';
      return;
    }
    video.src = URL.createObjectURL(new Blob([res.bytes], { type: 'video/mp4' }));
    video.style.display = '';
    btn.style.display = 'none';
    video.focus();
    // Starting playback right after a click is allowed; should a browser refuse,
    // the native controls are visible and the visitor can press play.
    video.play().catch(() => {});
  }

  async function init() {
    loading.style.display = '';
    const res = await SB.loadSection(TEXT_FILE);
    if (!res) return; // no valid code — already on its way back to the hub
    loading.style.display = 'none';
    if (!res.ok) {
      loadError.textContent = SB.errorMessage(res.reason);
      loadError.style.display = '';
      hubLink.style.display = '';
      return;
    }
    code = res.code;
    content.innerHTML = new TextDecoder().decode(res.bytes);
    content.style.display = '';
    const btn = document.getElementById('qsPlay');
    if (btn) btn.addEventListener('click', () => playVideo(btn));
  }

  init();
})();
