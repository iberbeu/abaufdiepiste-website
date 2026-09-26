// The QR cards already in circulation link to anleitung.html#CODE. Forward to the
// Spielerbereich hub and keep the fragment: it is client-side only and never reaches the
// server, so the redirect has to happen here rather than in a server rule.
location.replace('spielerbereich.html' + location.hash);
