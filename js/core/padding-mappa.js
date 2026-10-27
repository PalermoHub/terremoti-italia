// Il margine della mappa segue i pannelli: la mappa occupa tutta la finestra e i pannelli (barra e pannello Layer a sinistra,
// scheda e gli altri pannelli a destra) le stanno sopra. Con il margine impostato, il centro di ogni spostamento (clic su un punto,
// Home, ricerca, zoom su una zona) è il centro della parte rimasta visibile, e si aggiorna quando un pannello si apre o si chiude.
const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };
const SINISTRA = ['#barra-strati', '#pannello'];
const DESTRA = ['#rail-pannelli', '#scheda', '#rndt-pannello', '#geoimage-pannello', '#tema-ui-pannello', '#chatbot-pannello', '#storico-pannello', '#confronto-pannello'];
const MOBILE = '(max-width: 720px)';

const rettangolo = (doc, sel) => {
  const r = doc.querySelector(sel)?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null; // pannello nascosto (display: none): non toglie spazio
};

// Margine in pixel della mappa `tela` (il suo elemento) dato lo stato attuale dei pannelli.
export function calcolaPadding(doc, tela, mobile) {
  const m = tela.getBoundingClientRect();
  if (mobile) { // la scheda è un foglio basso (a tutto schermo la mappa non si vede: nessun margine)
    const scheda = rettangolo(doc, '#scheda');
    if (!scheda || scheda.top <= m.top || doc.querySelector('#scheda')?.classList.contains('scheda-piena')) return ZERO;
    return { ...ZERO, bottom: Math.round(m.bottom - scheda.top) };
  }
  const sx = SINISTRA.map(s => rettangolo(doc, s)).filter(Boolean).map(r => r.right - m.left);
  const dx = DESTRA.map(s => rettangolo(doc, s)).filter(Boolean).map(r => m.right - r.left);
  const quanto = lista => Math.max(0, Math.round(Math.max(0, ...lista)));
  return { ...ZERO, left: quanto(sx), right: quanto(dx) };
}

// Zoom a cui un cerchio di `raggio` metri a latitudine `lat` entra per intero nella parte visibile (margini dei pannelli e `extra`
// per barra strumenti, chip e ricerca esclusi). Tile da 512 px: a zoom z un pixel vale 78271.517·cos(lat)/2^z metri.
export function zoomPerCerchio({ larghezza, altezza }, padding, extra, raggio, lat) {
  const w = larghezza - padding.left - padding.right - extra.left - extra.right;
  const h = altezza - padding.top - padding.bottom - extra.top - extra.bottom;
  const lato = Math.max(Math.min(w, h), 1);
  return Math.log2(78271.517 * Math.cos(lat * Math.PI / 180) * lato / (2 * raggio));
}

const uguali = (a, b) => !!a && ['top', 'right', 'bottom', 'left'].every(k => a[k] === b[k]);
const ultimo = new WeakMap(); // ultimo margine chiesto alla mappa (anche se l'animazione non è finita)

// Porta la mappa al margine dei pannelli. `vista` (center, zoom, duration…) viaggia nello stesso movimento: così un clic che apre
// la scheda sposta il punto una volta sola. Senza `vista`, se il margine non è cambiato non fa nulla.
export function allineaPadding(map, vista) {
  const padding = calcolaPadding(document, map.getContainer(), matchMedia(MOBILE).matches);
  const cambiato = !uguali(ultimo.get(map), padding);
  if (!cambiato && !vista) return;
  ultimo.set(map, padding);
  map.easeTo({ duration: 300, ...vista, padding });
}

export function collegaPaddingMappa(map) {
  let atteso = false;
  const pianifica = () => {
    if (atteso) return;
    atteso = true;
    requestAnimationFrame(() => { atteso = false; allineaPadding(map); });
  };
  const ro = new ResizeObserver(pianifica);
  const mo = new MutationObserver(pianifica);
  for (const sel of [...SINISTRA, ...DESTRA]) {
    const e = document.querySelector(sel);
    if (!e) continue;
    ro.observe(e);
    mo.observe(e, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
  window.addEventListener('resize', pianifica);
  allineaPadding(map, { duration: 0 });
}
