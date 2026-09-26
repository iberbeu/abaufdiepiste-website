// Section page: the Spielanleitung. Unlocks with the code stored by the hub
// (spielerbereich.js sends visitors without one back to the hub) and wires up the
// table of contents and the collapsible sections of the decrypted manual.

(function () {
  const SB = window.Spielerbereich;

  const loading = document.getElementById('loading');
  const loadError = document.getElementById('loadError');
  const hubLink = document.getElementById('hubLink');
  const manualContent = document.getElementById('manualContent');

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

  async function init() {
    loading.style.display = '';
    const res = await SB.loadSection('anleitung.bin');
    if (!res) return; // no valid code — already on its way back to the hub
    loading.style.display = 'none';
    if (!res.ok) {
      loadError.textContent = SB.errorMessage(res.reason);
      loadError.style.display = '';
      hubLink.style.display = '';
      return;
    }
    manualContent.innerHTML = new TextDecoder().decode(res.bytes);
    manualContent.style.display = '';
    wireToc();
  }

  init();
})();
