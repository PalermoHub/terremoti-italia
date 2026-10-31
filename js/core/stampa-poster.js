// Stampa «poster» in PNG o PDF: mappa a tutta pagina con banner del titolo, legenda a riquadro (grandezza dei cerchi e
// colore del modo «Tematizza per»), barra di scala, rosa dei venti e piede con fonte dei dati, crediti della stampa e
// attribuzioni delle basi cartografiche. Impaginazione ispirata alle mappe mensili dell'INGV; nessun logo INGV: i dati
// sono citati come INGV e la mappa risulta realizzata con l'applicazione di OpenDataSicilia.
// Ispirato a Layout Composer (Defani Arman Alfitriansyah, MIT, https://github.com/Defani/Layout-Composer): nessun codice copiato.
import { t as tr, localeIntl } from './i18n.js';
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { FORMATI, barraScala, scalaDaZoom } from './stampa.js';
import { scala } from './mini-scala.js';
import { UNITA, contorniAttivi, contorniDati } from './shakemap-mappa.js';
import { modoTema } from './tema-magnitudo.js';
import { FASCE } from '../layers/scheda-terremoti.js';

const MM_PX_CSS = 25.4 / 96; // lato di un pixel CSS sul foglio, in mm
const BLU = '#0b4f7a';
const LOGO = 'img/opendatasicilia.png';
const URL_APP = 'https://palermohub.opendatasicilia.it/terremoti_italia.html';

// Pagina intera (senza margini) in mm
export function paginaMm(formato, direzione) {
  const [corto, lungo] = FORMATI[formato];
  return direzione === 'landscape' ? { larghezza: lungo, altezza: corto } : { larghezza: corto, altezza: lungo };
}

// Zoom che porta la vista attuale sul foglio: stesso territorio, riquadro di dimensioni diverse (mai oltre il riquadro più stretto)
export function zoomPerPagina(zoomVista, vistaPx, paginaPx) {
  return zoomVista + Math.log2(Math.min(paginaPx.larghezza / vistaPx.larghezza, paginaPx.altezza / vistaPx.altezza));
}

// Etichetta di una classe di magnitudo letta dalle stesse stringhe della scheda evento
const etichettaClasse = c => tr(`terremoti.ev.mag.${c.chiave}`);

// Dispone `testo` su più righe di larghezza massima `max` (nell'unità del contesto corrente)
export function spezzaRighe(ctx, testo, max) {
  const righe = [];
  let corrente = '';
  for (const parola of testo.split(/\s+/).filter(Boolean)) {
    const prova = corrente ? `${corrente} ${parola}` : parola;
    if (corrente && ctx.measureText(prova).width > max) { righe.push(corrente); corrente = parola; } else corrente = prova;
  }
  if (corrente) righe.push(corrente);
  return righe;
}

// Contorni ShakeMap in mappa: titolo e una riga (colore, valore) per ogni linea, dalla più forte alla più debole; null se non ce ne sono
function legendaContorni(evento) {
  const attivo = contorniAttivi();
  const dati = contorniDati();
  if (!attivo || !dati) return null;
  const linee = new Map();
  for (const f of dati.features) linee.set(f.properties.value, { colore: f.properties.color, unita: f.properties.units });
  const numero = new Intl.NumberFormat(localeIntl(), { maximumFractionDigits: 3 });
  return {
    titolo: `ShakeMap · ${tr(`terremoti.ev.cont.${attivo.prodotto}`)}`,
    voci: [...linee].sort((a, b) => b[0] - a[0]).map(([v, { colore, unita }]) => ({ colore, testo: `${numero.format(v)}${UNITA[unita] ? ` ${UNITA[unita]}` : ''}` })),
    // l'evento a cui appartengono i contorni: segnato anche in mappa (alone magenta); se la riga non è nota resta il solo id
    evento: { riga1: evento?.mag != null ? `M ${Number(evento.mag).toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ${evento.luogo || '—'}` : `ID ${attivo.id}`, riga2: evento?.ts ? `${new Date(evento.ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ID ${attivo.id}` : '' },
  };
}

// Scala del modo «Tematizza per» in corso: stessi colori e testi della mini-scala della legenda
function scalaTema() {
  const modo = modoTema();
  const { colori, nomi } = scala(modo, FASCE);
  return { modo, nome: tr(`tema.mini.modo.${modo}`), voci: colori.map((colore, i) => ({ colore, testo: nomi[i] })) };
}

function stella(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const raggio = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    ctx.lineTo(x + raggio * Math.cos(a), y + raggio * Math.sin(a));
  }
  ctx.closePath();
}

// Scheda arrotondata con ombra morbida (u = px per mm: l'ombra non segue la scala del contesto)
function carta(ctx, u, x, y, w, h, r = 1.2, riempimento = 'rgba(255,255,255,.95)') {
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,.38)'; ctx.shadowBlur = 1.8 * u; ctx.shadowOffsetY = 0.6 * u;
  ctx.fillStyle = riempimento;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(15,23,42,.2)'; ctx.lineWidth = 0.15;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke();
}

// Cerchio con sfumatura radiale e bordo: i simboli della legenda delle grandezze
function pallino(ctx, x, y, r, chiaro, scuro, bordo) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, chiaro); g.addColorStop(1, scuro);
  ctx.fillStyle = g; ctx.strokeStyle = bordo; ctx.lineWidth = 0.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
}

// Bussola: disco bianco, anello, stella a quattro punte con il nord evidenziato
function roseDeiVenti(ctx, u, x, y, r) {
  carta(ctx, u, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5, r * 1.25);
  ctx.strokeStyle = BLU; ctx.lineWidth = 0.25;
  ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, 2 * Math.PI); ctx.stroke();
  ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 2 * Math.PI); ctx.stroke();
  const punta = (ang, lungo, largo, colore) => {
    ctx.fillStyle = colore;
    ctx.beginPath();
    ctx.moveTo(x + lungo * Math.sin(ang), y - lungo * Math.cos(ang));
    ctx.lineTo(x + largo * Math.sin(ang + Math.PI / 4), y - largo * Math.cos(ang + Math.PI / 4));
    ctx.lineTo(x, y);
    ctx.lineTo(x + largo * Math.sin(ang - Math.PI / 4), y - largo * Math.cos(ang - Math.PI / 4));
    ctx.closePath(); ctx.fill();
  };
  [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4].forEach(a => punta(a, r * 0.55, r * 0.17, '#94a3b8'));
  [Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach(a => punta(a, r * 0.78, r * 0.2, '#334155'));
  punta(0, r * 0.82, r * 0.22, '#dc2626');
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.07, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${r * 0.42}px Montserrat, sans-serif`;
  ctx.fillText('N', x, y - r * 1.58);
}

// Corpo base del testo: 2,4 mm su A4 orizzontale, proporzionale sugli altri formati
export const corpoTesto = larghezzaPagina => Math.max(2.4, larghezzaPagina / 120);

// Area della mappa sulla pagina (mm): sotto il banner del titolo, con attorno la fascia della cornice e delle coordinate
export function areaMappaPoster(formato, direzione) {
  const p = paginaMm(formato, direzione);
  const corpo = corpoTesto(p.larghezza);
  const bordo = corpo * 3;
  const banner = corpo * 4.2;
  return { x: bordo, y: banner + bordo, larghezza: p.larghezza - 2 * bordo, altezza: p.altezza - banner - 2 * bordo, banner, bordo };
}

// — proiezione Web Mercator per graticola e scala: stessa matematica di MapLibre (mondo = 512 px × 2^zoom) —
const mercX = lng => (lng + 180) / 360;
const mercY = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

// `area` = dimensioni della mappa in mm; le coordinate restituite sono in mm dall'angolo in alto a sinistra della mappa
export function proiettore(centro, zoom, area) {
  const mondo = 512 * 2 ** zoom * MM_PX_CSS;
  const cx = mercX(centro.lng);
  const cy = mercY(centro.lat);
  return {
    verso: (lng, lat) => ({ x: area.larghezza / 2 + (mercX(lng) - cx) * mondo, y: area.altezza / 2 + (mercY(lat) - cy) * mondo }),
    lng: x => ((x - area.larghezza / 2) / mondo + cx) * 360 - 180,
    lat: y => Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y - area.altezza / 2) / mondo + cy)))) * 180 / Math.PI,
  };
}

const PASSI_GRIGLIA = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
// Passo della graticola in gradi: il più piccolo che non supera circa 6 linee sull'estensione data
export const passoGriglia = gradi => PASSI_GRIGLIA.find(p => gradi / p <= 6) ?? PASSI_GRIGLIA.at(-1);

// «12°30′ E», «38° N»; sotto i 3′ di passo gradi decimali
export function etichettaGradi(valore, asse, passo) {
  const lettera = asse === 'lng' ? (valore < 0 ? 'W' : 'E') : (valore < 0 ? 'S' : 'N');
  const assoluto = Math.abs(valore);
  if (passo < 0.05) return `${assoluto.toFixed(2)}° ${lettera}`;
  let g = Math.floor(assoluto + 1e-9);
  let m = Math.round((assoluto - g) * 60);
  if (m === 60) { g += 1; m = 0; }
  return m === 0 ? `${g}° ${lettera}` : `${g}°${String(m).padStart(2, '0')}′ ${lettera}`;
}

// Valori multipli di `passo` dentro [min, max]
export function valoriGriglia(min, max, passo) {
  const da = Math.ceil(min / passo - 1e-9);
  const a = Math.floor(max / passo + 1e-9);
  return Array.from({ length: Math.max(0, a - da + 1) }, (_, i) => Math.round((da + i) * passo * 1e6) / 1e6);
}

// Cornice a fascia a segmenti bianchi e neri (uno per intervallo di graticola), graticola e coordinate sui quattro lati
// Luminosità media (0–255) della mappa: la graticola cambia colore sulle basi scure (satellite, scuro) e su quelle chiare
export function luminosita(immagine, ritaglio) {
  const c = Object.assign(document.createElement('canvas'), { width: 24, height: 24 });
  const g = c.getContext('2d', { willReadFrequently: true });
  if (ritaglio) g.drawImage(immagine, ritaglio.x, ritaglio.y, ritaglio.w, ritaglio.h, 0, 0, 24, 24); else g.drawImage(immagine, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let somma = 0;
  for (let i = 0; i < d.length; i += 4) somma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return somma / (d.length / 4);
}

function cornice(ctx, m, proj, corpo, conGriglia, scuro = false) {
  const fascia = corpo * 0.4;
  const { x, y, larghezza: w, altezza: h } = m;
  const estremi = { lngMin: proj.lng(0), lngMax: proj.lng(w), latMax: proj.lat(0), latMin: proj.lat(h) };
  const passo = passoGriglia(Math.max(estremi.lngMax - estremi.lngMin, (estremi.latMax - estremi.latMin) * (w / h)));
  const meridiani = valoriGriglia(estremi.lngMin, estremi.lngMax, passo);
  const paralleli = valoriGriglia(estremi.latMin, estremi.latMax, passo);
  const xs = meridiani.map(v => proj.verso(v, estremi.latMax).x);
  const ys = paralleli.map(v => proj.verso(estremi.lngMin, v).y);
  const tratti = (posizioni, lunghezza) => { const p = [0, ...posizioni, lunghezza]; return p.slice(0, -1).map((da, i) => [da, p[i + 1]]); };

  if (conGriglia) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const linee = () => {
      ctx.beginPath();
      xs.forEach(px => { ctx.moveTo(x + px, y); ctx.lineTo(x + px, y + h); });
      ys.forEach(py => { ctx.moveTo(x, y + py); ctx.lineTo(x + w, y + py); });
      ctx.stroke();
    };
    // sottile ma leggibile su ogni base: alone di contrasto sotto e filo sopra, chiari sulle basi scure e scuri su quelle chiare
    ctx.setLineDash([]);
    ctx.strokeStyle = scuro ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.3; linee();
    ctx.setLineDash([corpo * 0.7, corpo * 0.45]);
    ctx.strokeStyle = scuro ? 'rgba(255,255,255,.9)' : 'rgba(20,20,20,.75)'; ctx.lineWidth = 0.1; linee();
    ctx.restore();
  }
  // fascia a scacchi: nera e bianca alternate fra due linee della graticola
  ctx.lineWidth = 0.08; ctx.strokeStyle = '#111';
  tratti(xs, w).forEach(([da, a], i) => {
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(x + da, y - fascia, a - da, fascia); ctx.fillRect(x + da, y + h, a - da, fascia);
  });
  tratti(ys, h).forEach(([da, a], i) => {
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(x - fascia, y + da, fascia, a - da); ctx.fillRect(x + w, y + da, fascia, a - da);
  });
  ctx.strokeStyle = '#111'; ctx.lineWidth = 0.12;
  ctx.strokeRect(x - fascia, y - fascia, w + 2 * fascia, h + 2 * fascia);
  ctx.lineWidth = 0.2; ctx.strokeRect(x, y, w, h);

  // coordinate: meridiani sopra e sotto, paralleli ai lati (testo ruotato)
  ctx.fillStyle = '#111'; ctx.font = `${corpo * 0.9}px Montserrat, sans-serif`;
  meridiani.forEach((v, i) => {
    const t = etichettaGradi(v, 'lng', passo);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(t, x + xs[i], y - fascia - corpo * 0.3);
    ctx.textBaseline = 'top'; ctx.fillText(t, x + xs[i], y + h + fascia + corpo * 0.25);
  });
  paralleli.forEach((v, i) => {
    const t = etichettaGradi(v, 'lat', passo);
    ctx.textAlign = 'center';
    ctx.save(); ctx.translate(x - fascia - corpo * 0.25, y + ys[i]); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'bottom'; ctx.fillText(t, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(x + w + fascia + corpo * 0.25, y + ys[i]); ctx.rotate(Math.PI / 2); ctx.textBaseline = 'bottom'; ctx.fillText(t, 0, 0); ctx.restore();
  });
  ctx.textBaseline = 'middle';
}

// Gli eventi forti (M ≥ 5) in mappa sono cerchi come gli altri: sul poster, come in legenda, diventano stelle del colore del tema.
// `stelle` = [{ lon, lat, colore }]; la stella è più grande del cerchio sottostante (14 px a zoom 7,5: 0,8 volte a zoom 6, 1,6 a zoom 12).
function disegnaStelle(ctx, m, proj, stelle, zoom, corpo) {
  if (!stelle.length) return;
  const moltiplicatore = Math.min(1.6, Math.max(0.8, 0.8 + (zoom - 6) * (0.8 / 6)));
  const R = Math.max(corpo * 0.9, 14 * moltiplicatore * MM_PX_CSS * 1.6);
  ctx.save();
  ctx.beginPath(); ctx.rect(m.x, m.y, m.larghezza, m.altezza); ctx.clip();
  ctx.lineJoin = 'round';
  for (const s of stelle) {
    const { x, y } = proj.verso(s.lon, s.lat);
    if (x < -R || y < -R || x > m.larghezza + R || y > m.altezza + R) continue;
    stella(ctx, m.x + x, m.y + y, R);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.7; ctx.stroke(); // bordo bianco: stacca la stella dai cerchi e dai contorni
    ctx.fillStyle = s.colore; ctx.fill();
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.25; ctx.stroke();
  }
  ctx.restore();
}

// Disegna il poster sulla pagina `canvas`: sfondo bianco, banner, mappa incorniciata con graticola, legenda, scala, rosa dei venti, piede.
// Le misure sono in mm: il contesto è scalato di `u` px/mm. `mappa` = { immagine, ritaglio? } con ritaglio opzionale { x, y, w, h } in px dell'immagine.
// `vista` = { centro, zoom } con cui la mappa è stata resa: servono per la graticola e la barra di scala.
export function disegnaPoster(canvas, opzioni) {
  const { pagina, formato, direzione, titolo, sottotitolo, attribuzioni, logo, data, mappa, vista } = opzioni;
  const el = { legenda: true, scala: true, rosa: true, griglia: true, ...opzioni.elementi }; // cornice, fonte dei dati, logo e attribuzioni ci sono sempre
  const ctx = canvas.getContext('2d');
  const u = canvas.width / pagina.larghezza;
  ctx.save();
  ctx.scale(u, u);
  const { larghezza: L, altezza: A } = pagina;
  const corpo = corpoTesto(L);
  const m = areaMappaPoster(formato, direzione);
  const margine = corpo * 1.3; // distanza degli elementi dal bordo della mappa
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, A);

  // Mappa
  if (mappa?.immagine) {
    const r = mappa.ritaglio;
    if (r) ctx.drawImage(mappa.immagine, r.x, r.y, r.w, r.h, m.x, m.y, m.larghezza, m.altezza);
    else ctx.drawImage(mappa.immagine, m.x, m.y, m.larghezza, m.altezza);
  }
  const proj = proiettore(vista.centro, vista.zoom, m);
  cornice(ctx, m, proj, corpo, el.griglia, mappa?.immagine ? luminosita(mappa.immagine, mappa.ritaglio) < 120 : false);
  disegnaStelle(ctx, m, proj, opzioni.stelle ?? [], vista.zoom, corpo);

  // Banner del titolo: sfumatura blu, onda sismica in filigrana e filo ambra
  const gb = ctx.createLinearGradient(0, 0, L, 0);
  gb.addColorStop(0, '#093a5c'); gb.addColorStop(0.55, BLU); gb.addColorStop(1, '#2a8fc4');
  ctx.fillStyle = gb; ctx.fillRect(0, 0, L, m.banner);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, L, m.banner); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.35; ctx.lineJoin = 'round';
  ctx.beginPath();
  const x0 = L * 0.52, yc = m.banner * 0.5, passi = 140;
  for (let i = 0; i <= passi; i++) {
    const t = i / passi;
    const spike = Math.exp(-(((t - 0.72) / 0.035) ** 2)) * Math.sin(i * 1.7) * m.banner * 0.42; // la scossa
    const rumore = Math.sin(i * 2.3) * Math.sin(i * 0.37) * m.banner * 0.07 * (0.4 + t);
    const px = x0 + t * (L - x0);
    i ? ctx.lineTo(px, yc + spike + rumore) : ctx.moveTo(px, yc + spike + rumore);
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#f5a623'; ctx.fillRect(0, m.banner - corpo * 0.3, L, corpo * 0.3);
  ctx.fillStyle = '#f5a623'; ctx.fillRect(corpo * 1.5, corpo * 0.9, corpo * 0.35, m.banner * 0.58);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.font = `bold ${corpo * 2.2}px Montserrat, sans-serif`;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 0.8 * u; ctx.shadowOffsetY = 0.25 * u;
  ctx.fillText(titolo, corpo * 2.6, m.banner * 0.4, L * 0.55);
  ctx.restore();
  ctx.font = `${corpo * 0.95}px Montserrat, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText(sottotitolo, corpo * 2.6, m.banner * 0.74, L * 0.55);


  const sx = m.x + margine; // origine degli elementi dentro la mappa
  const fondo = m.y + m.altezza - margine;

  // Barra di scala (sempre: la scala è nota dallo zoom) in basso a sinistra, su scheda arrotondata
  const scalaReale = scalaDaZoom(vista.zoom, vista.centro.lat);
  const hScala = corpo * 3.6;
  if (el.scala) {
    const b = barraScala(scalaReale, 60);
    const yS = fondo - hScala;
    carta(ctx, u, sx, yS, b.mm + corpo * 8, hScala, corpo * 0.7);
    const bx = sx + corpo * 1.2, by = yS + corpo * 1.4, spessore = corpo * 0.55;
    const segmenti = 4;
    for (let i = 0; i < segmenti; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#1e293b';
      ctx.fillRect(bx + i * b.mm / segmenti, by, b.mm / segmenti, spessore);
    }
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.15; ctx.strokeRect(bx, by, b.mm, spessore);
    ctx.fillStyle = '#1e293b'; ctx.font = `${corpo * 0.85}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const unita = b.metri >= 1000 ? 'km' : 'm';
    const divisore = b.metri >= 1000 ? 1000 : 1;
    ctx.fillText('0', bx, by - corpo * 0.2);
    ctx.fillText(`${(b.metri / divisore / 2).toLocaleString(localeIntl())}`, bx + b.mm / 2, by - corpo * 0.2);
    ctx.fillText(`${(b.metri / divisore).toLocaleString(localeIntl())} ${unita}`, bx + b.mm, by - corpo * 0.2);
    const cifre = 10 ** (Math.floor(Math.log10(scalaReale)) - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#475569'; ctx.font = `bold ${corpo * 0.9}px Montserrat, sans-serif`;
    ctx.fillText(`1:${(Math.round(scalaReale / cifre) * cifre).toLocaleString(localeIntl())}`, bx, by + spessore + corpo * 0.95);
  }

  // Legenda (sopra la scala): grandezza dei cerchi e scala del colore, con testata
  const tema = el.legenda ? scalaTema() : { modo: '', nome: '', voci: [] };
  const riga = corpo * 2.2;
  if (el.legenda) {
    const testata = corpo * 2.6;
    const contorni = legendaContorni(opzioni.evento);
    const hLeg = testata + corpo * 1.2 + CLASSI_MAGNITUDO.length * riga + (tema.voci.length ? corpo * 3 + tema.voci.length * corpo * 1.55 : 0) + (contorni ? corpo * 3 + (contorni.evento.riga2 ? corpo * 3.4 : corpo * 2) + contorni.voci.length * corpo * 1.45 : 0) + corpo * 0.6;
    const wLeg = corpo * 17.5;
    const y0 = fondo - (el.scala ? hScala + corpo * 0.9 : 0) - hLeg;
    carta(ctx, u, sx, y0, wLeg, hLeg, corpo * 0.8);
    ctx.fillStyle = BLU; ctx.beginPath(); ctx.roundRect(sx, y0, wLeg, testata, [corpo * 0.8, corpo * 0.8, 0, 0]); ctx.fill();
    ctx.fillStyle = '#f5a623'; ctx.fillRect(sx, y0 + testata - corpo * 0.2, wLeg, corpo * 0.2);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = `bold ${corpo * 1.25}px Montserrat, sans-serif`;
    ctx.fillText(tr('terremoti.ev.magnitudo'), sx + corpo, y0 + testata * 0.46);
    let y = y0 + testata + corpo * 1.5;
    ctx.font = `${corpo}px Montserrat, sans-serif`;
    CLASSI_MAGNITUDO.forEach(c => {
      const r = c.raggio * MM_PX_CSS * 1.25;
      const cx = sx + corpo * 2.4;
      if (c.a === Infinity) {
        stella(ctx, cx, y, Math.min(Math.max(r * 1.3, corpo), riga * 0.66));
        const g = ctx.createLinearGradient(cx, y - riga * 0.6, cx, y + riga * 0.6);
        if (tema.modo === 'magnitudo') { g.addColorStop(0, '#fff'); g.addColorStop(1, c.colore); } else { g.addColorStop(0, '#f8fafc'); g.addColorStop(1, '#94a3b8'); } // come i cerchi: neutra, a colore solo col tema magnitudo
        ctx.fillStyle = g; ctx.strokeStyle = tema.modo === 'magnitudo' ? '#1e293b' : '#475569'; ctx.lineWidth = 0.2; ctx.fill(); ctx.stroke();
      } else if (tema.modo === 'magnitudo') pallino(ctx, cx, y, r, '#fff', c.colore, '#1e293b');
      else pallino(ctx, cx, y, r, '#f8fafc', '#94a3b8', '#475569');
      ctx.fillStyle = '#1e293b'; ctx.textAlign = 'left'; ctx.fillText(etichettaClasse(c), sx + corpo * 4.8, y);
      y += riga;
    });
    if (tema.voci.length) {
      y += corpo * 0.1;
      ctx.strokeStyle = 'rgba(15,23,42,.18)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(sx + corpo, y); ctx.lineTo(sx + wLeg - corpo, y); ctx.stroke();
      y += corpo * 1.4;
      ctx.font = `bold ${corpo * 1.1}px Montserrat, sans-serif`; ctx.fillStyle = BLU; ctx.textAlign = 'left';
      ctx.fillText(tema.nome, sx + corpo, y, wLeg - 2 * corpo);
      y += corpo * 1.8;
      ctx.font = `${corpo * 0.95}px Montserrat, sans-serif`;
      tema.voci.forEach(v => {
        ctx.fillStyle = v.colore; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.roundRect(sx + corpo, y - corpo * 0.5, corpo * 2.4, corpo, corpo * 0.5); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.roundRect(sx + corpo, y - corpo * 0.5, corpo * 2.4, corpo, corpo * 0.5); ctx.stroke();
        ctx.fillStyle = '#1e293b'; ctx.fillText(v.testo, sx + corpo * 4.1, y, wLeg - corpo * 5);
        y += corpo * 1.55;
      });
    }
    if (contorni) {
      y += corpo * 0.1;
      ctx.strokeStyle = 'rgba(15,23,42,.18)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(sx + corpo, y); ctx.lineTo(sx + wLeg - corpo, y); ctx.stroke();
      y += corpo * 1.4;
      ctx.font = `bold ${corpo * 1.1}px Montserrat, sans-serif`; ctx.fillStyle = BLU; ctx.textAlign = 'left';
      ctx.fillText(contorni.titolo, sx + corpo, y, wLeg - 2 * corpo);
      y += corpo * 1.9;
      // evento evidenziato: stesso simbolo dell'alone in mappa (anello magenta con punto bianco)
      ctx.fillStyle = 'rgba(214,36,110,.18)'; ctx.strokeStyle = '#d6246e'; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(sx + corpo * 2, y + corpo * 0.3, corpo * 0.95, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + corpo * 2, y + corpo * 0.3, corpo * 0.38, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1e293b'; ctx.font = `bold ${corpo * 0.95}px Montserrat, sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(contorni.evento.riga1, sx + corpo * 3.7, y, wLeg - corpo * 4.7);
      if (contorni.evento.riga2) { ctx.font = `${corpo * 0.8}px Montserrat, sans-serif`; ctx.fillStyle = '#64748b'; ctx.fillText(contorni.evento.riga2, sx + corpo * 3.7, y + corpo * 1.25, wLeg - corpo * 4.7); }
      y += corpo * (contorni.evento.riga2 ? 3.4 : 2);
      ctx.font = `${corpo * 0.95}px Montserrat, sans-serif`;
      ctx.font = `${corpo * 0.95}px Montserrat, sans-serif`;
      contorni.voci.forEach(v => {
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(31,42,68,.55)'; ctx.lineWidth = corpo * 0.5; ctx.beginPath(); ctx.moveTo(sx + corpo * 1.2, y); ctx.lineTo(sx + corpo * 3.2, y); ctx.stroke();
        ctx.strokeStyle = v.colore; ctx.lineWidth = corpo * 0.3; ctx.beginPath(); ctx.moveTo(sx + corpo * 1.2, y); ctx.lineTo(sx + corpo * 3.2, y); ctx.stroke();
        ctx.fillStyle = '#1e293b'; ctx.fillText(v.testo, sx + corpo * 4.1, y, wLeg - corpo * 5);
        y += corpo * 1.45;
      });
    }
  }

  // Rosa dei venti (alto a destra dentro la mappa)
  if (el.rosa) roseDeiVenti(ctx, u, m.x + m.larghezza - margine - corpo * 2.6, m.y + margine + corpo * 4, corpo * 1.9);

  // Piede in basso a destra: fonte dei dati, realizzazione, link all'app, attribuzioni delle basi, logo ODS
  const wPiede = Math.min(m.larghezza * 0.5, corpo * 75);
  const xTesto = corpo * 6.4; // spazio per il logo
  ctx.font = `${corpo * 0.95}px Montserrat, sans-serif`;
  const righe = [
    tr('stampa.poster.fonteDati'),
    tr('stampa.poster.realizzazione', { data }),
    URL_APP,
    ...spezzaRighe(ctx, attribuzioni.join(' · '), wPiede - xTesto - corpo * 0.8),
  ];
  ctx.font = `italic ${corpo * 0.8}px Montserrat, sans-serif`;
  const avviso = spezzaRighe(ctx, tr('stampa.poster.avvertenza'), wPiede - xTesto - corpo * 0.8);
  const hRighe = righe.length * corpo * 1.25 + corpo * 1.0;
  const hPiede = hRighe + avviso.length * corpo * 1.0 + corpo * 1.2;
  const xP = m.x + m.larghezza - margine - wPiede;
  const yP = fondo - hPiede;
  carta(ctx, u, xP, yP, wPiede, hPiede, corpo * 0.8);
  ctx.fillStyle = BLU; ctx.beginPath(); ctx.roundRect(xP, yP, corpo * 0.45, hPiede, [corpo * 0.8, 0, 0, corpo * 0.8]); ctx.fill();
  ctx.textAlign = 'left';
  righe.forEach((r, i) => {
    ctx.font = `${i < 3 ? 'bold ' : ''}${corpo * 0.95}px Montserrat, sans-serif`;
    ctx.fillStyle = i === 2 ? '#1d6fa5' : i < 2 ? '#0f172a' : '#475569';
    ctx.fillText(r, xP + xTesto, yP + corpo * 1.2 + i * corpo * 1.25, wPiede - xTesto - corpo * 0.5);
  });
  ctx.strokeStyle = 'rgba(15,23,42,.18)'; ctx.lineWidth = 0.12;
  ctx.beginPath(); ctx.moveTo(xP + xTesto, yP + hRighe); ctx.lineTo(xP + wPiede - corpo * 0.8, yP + hRighe); ctx.stroke();
  ctx.font = `italic ${corpo * 0.8}px Montserrat, sans-serif`; ctx.fillStyle = '#64748b';
  avviso.forEach((r, i) => ctx.fillText(r, xP + xTesto, yP + hRighe + corpo * 1.0 + i * corpo * 1.0, wPiede - xTesto - corpo * 0.5));
  if (logo) {
    const hl = Math.min(hRighe - corpo * 0.4, corpo * 4.8);
    ctx.drawImage(logo, xP + corpo * 1.1, yP + (hRighe - hl) / 2, hl * (logo.naturalWidth / logo.naturalHeight), hl);
  }

  // Filetto esterno della pagina
  ctx.strokeStyle = BLU; ctx.lineWidth = 0.6; ctx.strokeRect(0.3, 0.3, L - 0.6, A - 0.6);
  ctx.restore();
}

// PDF minimo con una sola pagina e un'immagine JPEG a pagina intera (nessuna dipendenza)
export function creaPdf(jpeg, pxL, pxA, paginaL, paginaA) {
  const pt = mm => (mm * 72 / 25.4).toFixed(2);
  const codifica = new TextEncoder();
  const contenuto = `q ${pt(paginaL)} 0 0 ${pt(paginaA)} 0 0 cm /Im0 Do Q`;
  const parti = [];
  const offset = [];
  let lunghezza = 0;
  const aggiungi = dati => { const b = typeof dati === 'string' ? codifica.encode(dati) : dati; parti.push(b); lunghezza += b.length; };
  const oggetto = (n, corpo) => { offset[n] = lunghezza; aggiungi(`${n} 0 obj\n`); corpo(); aggiungi('\nendobj\n'); };
  aggiungi('%PDF-1.4\n');
  oggetto(1, () => aggiungi('<< /Type /Catalog /Pages 2 0 R >>'));
  oggetto(2, () => aggiungi('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  oggetto(3, () => aggiungi(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(paginaL)} ${pt(paginaA)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  oggetto(4, () => { aggiungi(`<< /Type /XObject /Subtype /Image /Width ${pxL} /Height ${pxA} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); aggiungi(jpeg); aggiungi('\nendstream'); });
  oggetto(5, () => aggiungi(`<< /Length ${contenuto.length} >>\nstream\n${contenuto}\nendstream`));
  const xref = lunghezza;
  aggiungi(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => `${String(offset[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parti, { type: 'application/pdf' });
}

export const caricaLogo = () => new Promise(risolvi => { const i = new Image(); i.onload = () => risolvi(i); i.onerror = () => risolvi(null); i.src = LOGO; });
const caricaImmagine = url => new Promise((risolvi, rifiuta) => { const i = new Image(); i.onload = () => risolvi(i); i.onerror = () => rifiuta(new Error('image load failed')); i.src = url; });
const comeBlob = (canvas, tipo, qualita) => new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('canvas too large'))), tipo, qualita));

function scarica(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// `immagineUrl` = mappa catturata a tutta pagina; `uscita` = 'png' | 'pdf'
// Sottotitolo di riserva: centro della mappa e data
export const sottotitoloPredefinito = (centro, data) => tr('stampa.poster.sottotitolo', { lat: centro.lat.toFixed(3), lng: centro.lng.toFixed(3), data });

export async function esportaPoster({ immagineUrl, uscita, formato, direzione, titolo, sottotitolo, elementi, evento, stelle, attribuzioni, centro, zoom }) {
  const pagina = paginaMm(formato, direzione);
  const area = areaMappaPoster(formato, direzione);
  const mappa = await caricaImmagine(immagineUrl);
  const k = mappa.naturalWidth / area.larghezza; // px per mm della mappa catturata
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(pagina.larghezza * k), height: Math.round(pagina.altezza * k) });
  const data = new Date().toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric' });
  disegnaPoster(canvas, {
    pagina, formato, direzione, titolo, attribuzioni, data, logo: await caricaLogo(), elementi, evento, stelle,
    mappa: { immagine: mappa }, vista: { centro, zoom },
    sottotitolo: sottotitolo || sottotitoloPredefinito(centro, data),
  });
  const nome = `terremoti-italia-${new Date().toISOString().slice(0, 10)}`;
  if (uscita === 'png') return scarica(await comeBlob(canvas, 'image/png'), `${nome}.png`);
  if (uscita === 'jpg') return scarica(await comeBlob(canvas, 'image/jpeg', 0.93), `${nome}.jpg`);
  const jpeg = new Uint8Array(await (await comeBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  scarica(creaPdf(jpeg, canvas.width, canvas.height, pagina.larghezza, pagina.altezza), `${nome}.pdf`);
}

