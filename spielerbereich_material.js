// Section pages with one picture plus a print PDF (Pistenplan, Punkteblock). Both files are
// stored encrypted; they are decrypted in the browser and handed to the page as Blob URLs,
// so nothing readable ever sits on the server. The page names its files on #materialView:
//   data-image-file="…_bild.bin"  data-pdf-file="….bin"

(function () {
  const SB = window.Spielerbereich;

  const loading = document.getElementById('loading');
  const loadError = document.getElementById('loadError');
  const hubLink = document.getElementById('hubLink');
  const view = document.getElementById('materialView');
  const image = document.getElementById('materialImage');
  const imageOpen = document.getElementById('materialOpen');
  const pdfLink = document.getElementById('pdfLink');
  const pdfError = document.getElementById('pdfError');

  async function init() {
    loading.style.display = '';
    const res = await SB.loadSection(view.dataset.imageFile);
    if (!res) return; // no valid code — already on its way back to the hub
    loading.style.display = 'none';
    if (!res.ok) {
      loadError.textContent = SB.errorMessage(res.reason);
      loadError.style.display = '';
      hubLink.style.display = '';
      return;
    }

    // The image link opens the picture on its own, where the browser's native
    // pinch-zoom works — the material is too detailed for a phone-width column.
    const imageUrl = URL.createObjectURL(new Blob([res.bytes], { type: 'image/png' }));
    image.src = imageUrl;
    imageOpen.href = imageUrl;
    view.style.display = '';

    // The PDF shares the derived key with the image, so this costs no second
    // key derivation.
    const pdf = await SB.decryptFile(view.dataset.pdfFile, res.code);
    if (pdf.ok) {
      pdfLink.href = URL.createObjectURL(new Blob([pdf.bytes], { type: 'application/pdf' }));
      pdfLink.style.display = '';
    } else {
      pdfError.textContent = 'Das PDF konnte nicht geladen werden. Bitte lade die Seite neu.';
      pdfError.style.display = '';
    }
  }

  init();
})();
