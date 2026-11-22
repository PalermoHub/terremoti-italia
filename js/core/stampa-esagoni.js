// Esportazione della mappa a esagoni in PNG o PDF (A4–A0, verticale o orizzontale): banner con titolo e sottotitolo, mappa con graticola,
// scala grafica e rosa dei venti, e in basso tre colonne: legenda (con il numero di esagoni per classe), «Come leggerla» e crediti.
// Riusa la cattura a misura di foglio e i disegni del poster; il resto dell'impaginazione è qui.
import { localeIntl } from './i18n.js';
import { VISTA_ITALIA } from './config.js';
import { catturaInScala, pixelRatioPerFormato, mmInPx, scalaDaZoom, barraScala } from './stampa.js';
import { paginaMm, corpoTesto, proiettore, cornice, carta, roseDeiVenti, spezzaRighe, caricaLogo, caricaImmagine, comeBlob, scarica, creaPdf, BLU, URL_APP } from './stampa-poster.js';

export const FORMATI_ESAGONI = ['A4', 'A3', 'A2', 'A1', 'A0'];

// Geometria del foglio (mm): banner in alto, mappa, piede con tre colonne
export function geometriaEsagoni(formato, direzione) {
  const pagina = paginaMm(formato, direzione);
  const c = corpoTesto(pagina.larghezza);
  const b = c * 3; // margine: dentro ci sta la fascia della graticola
  const banner = c * 6.4;
  const piede = c * (direzione === 'landscape' ? 13 : 15.5);
  const mappa = { x: b, y: banner + b, larghezza: pagina.larghezza - 2 * b, altezza: pagina.altezza - banner - 3 * b - piede, banner, bordo: b };
  return { pagina, c, b, banner, mappa, piede: { x: b, y: mappa.y + mappa.altezza + b, w: pagina.larghezza - 2 * b, h: piede } };
}

const mercX = lng => (lng + 180) / 360;
const mercY = lat => { const sn = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI); };

// Inquadratura del foglio: se la vista è già stretta su una zona (meno del 65% dell'Italia in larghezza) vale quella, adattata alla
// forma del foglio; altrimenti si inquadra tutta l'Italia con un po' di margine. Zoom MapLibre: mondo = 512 px × 2^zoom.
export function inquadratura(map, area) {
  const b = map.getBounds();
  const larghezzaItalia = VISTA_ITALIA[1][0] - VISTA_ITALIA[0][0];
  const [ovest, sud, est, nord] = b.getEast() - b.getWest() < larghezzaItalia * 0.65
    ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    : [VISTA_ITALIA[0][0], VISTA_ITALIA[0][1], VISTA_ITALIA[1][0], VISTA_ITALIA[1][1]];
  const dx = (mercX(est) - mercX(ovest)) * 1.06, dy = (mercY(sud) - mercY(nord)) * 1.06;
  const zoom = Math.log2(Math.min(mmInPx(area.larghezza) / dx, mmInPx(area.altezza) / dy) / 512);
  const cy = (mercY(sud) + mercY(nord)) / 2;
  return { zoom, centro: { lng: (ovest + est) / 2, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180 / Math.PI } };
}

// Disegna il foglio. `dati` = { titolo, sottotitolo, voci: [{ colore, opacita, bordo, testo }], rampa: { colori, testo } | null,
// comeLeggerla, crediti, data }; `vista` = { centro, zoom } della mappa catturata.
export function disegnaEsagoni(canvas, { geo, immagine, vista, dati, logo }) {
  const ctx = canvas.getContext('2d');
  const { pagina: { larghezza: L, altezza: A }, c, b, banner, mappa: m, piede } = geo;
  const u = canvas.width / L;
  ctx.save();
  ctx.scale(u, u);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, A);

  // Banner
  const sfumatura = ctx.createLinearGradient(0, 0, L, 0);
  sfumatura.addColorStop(0, BLU); sfumatura.addColorStop(1, '#1e6fa8');
  ctx.fillStyle = sfumatura; ctx.fillRect(0, 0, L, banner);
  ctx.fillStyle = '#f5a623'; ctx.fillRect(0, banner - c * 0.25, L, c * 0.25);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.font = `bold ${c * 2.5}px Montserrat, sans-serif`;
  ctx.fillText(dati.titolo, b, banner * 0.38);
  ctx.font = `${c * 1.15}px Montserrat, sans-serif`;
  ctx.fillText(dati.sottotitolo, b, banner * 0.74);
  if (logo) {
    const h = banner * 0.62, w = h * logo.naturalWidth / logo.naturalHeight;
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.roundRect(L - b - w - c * 0.6, (banner - h) / 2 - c * 0.3, w + c * 1.2, h + c * 0.6, c * 0.5); ctx.fill();
    ctx.drawImage(logo, L - b - w, (banner - h) / 2, w, h);
  }

  // Mappa con graticola, scala e rosa dei venti
  ctx.drawImage(immagine, m.x, m.y, m.larghezza, m.altezza);
  const proj = proiettore(vista.centro, vista.zoom, m);
  cornice(ctx, m, proj, c, true, false);
  const margine = c * 1.3;
  const barra = barraScala(scalaDaZoom(vista.zoom, vista.centro.lat), Math.min(m.larghezza * 0.3, c * 22));
  carta(ctx, u, m.x + margine, m.y + m.altezza - margine - c * 3.6, barra.mm + c * 3, c * 3.6, c * 0.4);
  ctx.fillStyle = '#111'; ctx.fillRect(m.x + margine + c * 1.5, m.y + m.altezza - margine - c * 2, barra.mm, c * 0.5);
  ctx.textAlign = 'left'; ctx.font = `${c * 0.95}px Montserrat, sans-serif`;
  ctx.fillText(barra.etichetta, m.x + margine + c * 1.5, m.y + m.altezza - margine - c * 2.8);
  roseDeiVenti(ctx, u, m.x + m.larghezza - margine - c * 2.6, m.y + margine + c * 4, c * 1.9);

  // Piede: tre colonne
  const col = (piede.w - 2 * c) / 3;
  const testata = (testo, x) => { ctx.fillStyle = BLU; ctx.font = `bold ${c * 1.2}px Montserrat, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(testo, x, piede.y + c * 0.8); };
  const paragrafo = (testo, x, y0, dimensione = 0.95) => {
    ctx.fillStyle = '#334155'; ctx.font = `${c * dimensione}px Montserrat, sans-serif`;
    spezzaRighe(ctx, testo, col).forEach((riga, i) => ctx.fillText(riga, x, y0 + i * c * dimensione * 1.35));
  };
  // 1. legenda
  const x1 = piede.x;
  testata(dati.legendaTitolo, x1);
  let y = piede.y + c * 2.9;
  const riga = c * 1.75;
  if (dati.rampa) {
    const g = ctx.createLinearGradient(x1, 0, x1 + col * 0.8, 0);
    dati.rampa.colori.forEach((k, i) => g.addColorStop(i / (dati.rampa.colori.length - 1), k));
    ctx.fillStyle = g; ctx.fillRect(x1, y - c * 0.5, col * 0.8, c);
    ctx.fillStyle = '#334155'; ctx.font = `${c * 0.95}px Montserrat, sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(dati.rampa.testo, x1, y + c * 1.4);
    y += riga * 1.6;
  }
  const passo = Math.min(riga, (piede.h - c * 3.4) / Math.max(1, dati.voci.length));
  ctx.font = `${c * 0.95}px Montserrat, sans-serif`;
  for (const v of dati.voci) {
    ctx.save();
    if (v.bordo) { ctx.strokeStyle = v.bordo; ctx.lineWidth = c * 0.22; ctx.strokeRect(x1, y - c * 0.5, c * 1.8, c); }
    else { ctx.globalAlpha = v.opacita ?? 1; ctx.fillStyle = v.colore; ctx.fillRect(x1, y - c * 0.5, c * 1.8, c); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.12; ctx.strokeRect(x1, y - c * 0.5, c * 1.8, c); }
    ctx.restore();
    ctx.fillStyle = '#334155'; ctx.textAlign = 'left';
    ctx.fillText(v.testo, x1 + c * 2.4, y);
    y += passo;
  }
  // 2. come leggerla, 3. crediti
  const x2 = piede.x + col + c;
  testata(dati.comeLeggerlaTitolo, x2);
  paragrafo(dati.comeLeggerla, x2, piede.y + c * 2.9);
  const x3 = x2 + col + c;
  testata(dati.creditiTitolo, x3);
  paragrafo(dati.crediti, x3, piede.y + c * 2.9, 0.85);
  ctx.fillStyle = '#64748b'; ctx.font = `${c * 0.8}px Montserrat, sans-serif`; ctx.textAlign = 'left';
  ctx.fillText(`${URL_APP.replace(/^https?:\/\//, '')} · ${dati.data}`, x3, piede.y + piede.h - c * 0.4);

  // Filetto esterno e separatori
  ctx.strokeStyle = 'rgba(15,23,42,.18)'; ctx.lineWidth = 0.15;
  for (const x of [x2 - c * 0.5, x3 - c * 0.5]) { ctx.beginPath(); ctx.moveTo(x, piede.y); ctx.lineTo(x, piede.y + piede.h); ctx.stroke(); }
  ctx.strokeStyle = BLU; ctx.lineWidth = 0.6; ctx.strokeRect(0.3, 0.3, L - 0.6, A - 0.6);
  ctx.restore();
}

// Cattura la mappa a misura di foglio (stesso territorio della vista attuale) e salva PNG o PDF. Risponde true se riuscita.
export async function esportaEsagoni(map, { uscita = 'png', formato = 'A3', direzione = 'portrait', dati }) {
  const geo = geometriaEsagoni(formato, direzione);
  const area = geo.mappa;
  const { zoom, centro } = inquadratura(map, area);
  let esito;
  try { esito = await catturaInScala(map, null, area, pixelRatioPerFormato(formato), zoom, centro); } catch (e) { console.error('Esagoni: cattura della mappa non riuscita', e); return false; } // i18n-ok: messaggio solo per la console
  try {
    const immagine = await caricaImmagine(esito.immagine);
    const k = immagine.naturalWidth / area.larghezza; // px per mm della mappa catturata
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(geo.pagina.larghezza * k), height: Math.round(geo.pagina.altezza * k) });
    const data = new Date().toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric' });
    disegnaEsagoni(canvas, { geo, immagine, vista: { centro: esito.centro, zoom: esito.zoom }, dati: { ...dati, data }, logo: await caricaLogo() });
    const nome = `terremoti-esagoni-${new Date().toISOString().slice(0, 10)}`;
    if (uscita === 'pdf') {
      const jpeg = new Uint8Array(await (await comeBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
      scarica(creaPdf(jpeg, canvas.width, canvas.height, geo.pagina.larghezza, geo.pagina.altezza), `${nome}.pdf`);
    } else scarica(await comeBlob(canvas, 'image/png'), `${nome}.png`);
    return true;
  } catch (e) { console.error('Esagoni: esportazione non riuscita', e); return false; } finally { URL.revokeObjectURL(esito.immagine); } // i18n-ok: messaggio solo per la console
}
