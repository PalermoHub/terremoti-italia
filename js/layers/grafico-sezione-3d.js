import { t, localeIntl } from '../core/i18n.js';
import { coloreProfondita } from './scheda-sezione.js';
import { raggioMagnitudo } from './scheda-terremoti.js';

// Vista 3D della sezione verticale, a canvas e senza librerie: come nel grafico 2D, x = distanza da A lungo la linea (km),
// y = scostamento dalla linea (km, dentro la fascia) e profondità verso il basso; colore = profondità, grandezza = magnitudo.
// Si ruota trascinando, si ingrandisce con la rotella; il passaggio del mouse e il clic usano lo stesso `sync` del grafico 2D.
const SUPERFICIE_DA_KM = 30; // sotto la crosta: sopra, la sismicità superficiale non descrive il piano della placca
const CELLE_X = 24, CELLE_Y = 8, MIN_EVENTI = 3;
const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
const mediana = v => { const s = [...v].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Griglia di profondità mediana per cella (x, scostamento); le celle con pochi eventi restano vuote
function superficie(eventi, lunghezza, semilarghezza) {
  const celle = Array.from({ length: (CELLE_X + 1) * (CELLE_Y + 1) }, () => []);
  const ix = e => Math.min(CELLE_X - 1, Math.floor(e.x / lunghezza * CELLE_X));
  const iy = e => Math.min(CELLE_Y - 1, Math.floor((e.trasversale + semilarghezza) / (2 * semilarghezza) * CELLE_Y));
  for (const e of eventi) if (e.prof >= SUPERFICIE_DA_KM) celle[iy(e) * (CELLE_X + 1) + ix(e)].push(e.prof);
  const quote = celle.map(c => (c.length >= MIN_EVENTI ? mediana(c) : null));
  const quadri = [];
  for (let j = 0; j < CELLE_Y; j++) {
    for (let i = 0; i < CELLE_X; i++) {
      const p = quote[j * (CELLE_X + 1) + i];
      if (p == null) continue;
      const x0 = i / CELLE_X * lunghezza, x1 = (i + 1) / CELLE_X * lunghezza;
      const y0 = -semilarghezza + j / CELLE_Y * 2 * semilarghezza, y1 = -semilarghezza + (j + 1) / CELLE_Y * 2 * semilarghezza;
      quadri.push({ p, ang: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
    }
  }
  return quadri;
}

// `cima` = estremo dell'asse della profondità (km); restituisce { canvas, comandi } da inserire nel popup
export function vista3d(eventi, lunghezza, semilarghezza, cima, { sync = null, interazione = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'grafico-3d';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('terremoti.sez.aria3d'));
  canvas.title = t('terremoti.sez.aiuto3d');
  const ctx = canvas.getContext('2d');
  const quadri = superficie(eventi, lunghezza, semilarghezza);
  // scala verticale iniziale: la profondità non più alta della linea è lunga, così la vista riempie la larghezza come il grafico 2D
  const ESAGERA = Math.round(Math.max(0.25, Math.min(1, 0.9 * lunghezza / cima)) * 20) / 20;
  const stato = { imbardata: -0.45, beccheggio: 0.3, zoom: 1, esagera: ESAGERA, mostraSuperficie: quadri.length > 0, sopra: null, fissato: null };
  let proiettati = [], tip = null, richiesta = 0;

  const R = Math.hypot(lunghezza / 2, semilarghezza, cima / 2);
  const proietta = (x, y, p, ox, oy, k) => {
    const u = x - lunghezza / 2, v = y, z = (p - cima / 2) * stato.esagera;
    const c = Math.cos(stato.imbardata), s = Math.sin(stato.imbardata), cp = Math.cos(stato.beccheggio), sp = Math.sin(stato.beccheggio);
    const x1 = u * c - v * s, y1 = u * s + v * c;
    const profondita = y1 * cp + z * sp;
    const prospettiva = 3 * R / (3 * R + profondita);
    return { sx: ox + x1 * k * prospettiva, sy: oy + (z * cp - y1 * sp) * k * prospettiva, d: profondita, f: prospettiva };
  };

  const colore = nome => getComputedStyle(canvas).getPropertyValue(nome).trim();
  function disegna() {
    richiesta = 0;
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // scala e centro dal riquadro della fascia a scala 1: la vista riempie la larghezza o l'altezza disponibili, qualunque sia la forma
    const prova = [0, lunghezza].flatMap(x => [-semilarghezza, semilarghezza].flatMap(y => [0, cima].map(q => proietta(x, y, q, 0, 0, 1))));
    const minX = Math.min(...prova.map(o => o.sx)), maxX = Math.max(...prova.map(o => o.sx)), minY = Math.min(...prova.map(o => o.sy)), maxY = Math.max(...prova.map(o => o.sy));
    const k = 0.84 * Math.min(w / Math.max(1, maxX - minX), h / Math.max(1, maxY - minY)) * stato.zoom;
    const ox = w / 2 - (minX + maxX) / 2 * k, oy = h / 2 - (minY + maxY) / 2 * k;
    const P = (x, y, p) => proietta(x, y, p, ox, oy, k);
    const linea = colore('--border-ui') || '#9ca3af', testo = colore('--text-muted') || colore('color') || '#6b7280';
    ctx.font = '12px system-ui, sans-serif';

    // scatola della fascia: base e tetto, spigoli verticali
    const ang = [[0, -semilarghezza], [lunghezza, -semilarghezza], [lunghezza, semilarghezza], [0, semilarghezza]];
    ctx.strokeStyle = linea;
    ctx.lineWidth = 1;
    for (const q of [0, cima]) {
      ctx.beginPath();
      ang.forEach(([x, y], i) => { const o = P(x, y, q); i ? ctx.lineTo(o.sx, o.sy) : ctx.moveTo(o.sx, o.sy); });
      ctx.closePath();
      ctx.stroke();
    }
    for (const [x, y] of ang) {
      const a = P(x, y, 0), b = P(x, y, cima);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    // la linea A–B sulla superficie (profondità 0), con gli estremi
    ctx.strokeStyle = testo;
    ctx.lineWidth = 1.5;
    const A = P(0, 0, 0), B = P(lunghezza, 0, 0);
    ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke();
    ctx.fillStyle = testo;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('A', A.sx - 14, A.sy + 4);
    ctx.fillText('B', B.sx + 6, B.sy + 4);
    ctx.font = '12px system-ui, sans-serif';
    // profondità sullo spigolo più a sinistra sullo schermo
    const spigolo = ang.reduce((m, c) => (P(c[0], c[1], 0).sx < P(m[0], m[1], 0).sx ? c : m));
    for (const q of [0, cima / 2, cima]) {
      const o = P(spigolo[0], spigolo[1], q);
      ctx.fillText(`${numero(Math.round(q))} km`, o.sx - 46, o.sy + 4);
    }

    // superficie stimata, dal più lontano al più vicino
    if (stato.mostraSuperficie) {
      const celle = quadri.map(q => ({ q, pt: q.ang.map(([x, y]) => P(x, y, q.p)) })).sort((a, b) => b.pt.reduce((s, o) => s + o.d, 0) - a.pt.reduce((s, o) => s + o.d, 0));
      for (const { q, pt } of celle) {
        ctx.beginPath();
        pt.forEach((o, i) => (i ? ctx.lineTo(o.sx, o.sy) : ctx.moveTo(o.sx, o.sy)));
        ctx.closePath();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = coloreProfondita(q.p);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = coloreProfondita(q.p);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // punti, dal più lontano al più vicino; i più forti hanno comunque la precedenza a parità di distanza
    proiettati = eventi.map(e => {
      const o = P(e.x, e.trasversale, e.prof);
      return { e, sx: o.sx, sy: o.sy, d: o.d, r: Math.max(1.5, raggioMagnitudo(e.mag) * 0.7 * o.f * Math.min(1.6, stato.zoom)) };
    }).sort((a, b) => b.d - a.d);
    const evid = e => e && (e === stato.sopra || e === stato.fissato || (stato.fissato && e.id != null && e.id === stato.fissato.id) || (stato.sopra && e.id != null && e.id === stato.sopra.id));
    for (const p of proiettati) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r, 0, 2 * Math.PI);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = coloreProfondita(p.e.prof);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.stroke();
    }
    for (const p of proiettati) {
      if (!evid(p.e)) continue;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r + 3, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = colore('--accent') || '#0369a1';
      ctx.stroke();
    }
  }
  const ridisegna = () => { if (!richiesta) richiesta = requestAnimationFrame(disegna); };

  const vicino = ev => {
    const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let migliore = null, distanza = Infinity;
    for (let i = proiettati.length - 1; i >= 0; i--) { // dal più vicino allo schermo
      const p = proiettati[i], d = Math.hypot(p.sx - x, p.sy - y);
      if (d <= Math.max(7, p.r + 3) && d < distanza) { distanza = d; migliore = p.e; }
    }
    return migliore;
  };
  const etichetta = (e, ev) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'grafico-3d-tip'; canvas.parentNode?.append(tip); }
    tip.hidden = !e;
    if (!e) return;
    tip.textContent = `M ${numero(e.mag, 1)} · ${numero(e.prof)} km · ${e.ora}${e.luogo ? ` · ${e.luogo}` : ''}`;
    const r = canvas.getBoundingClientRect(), p = canvas.parentNode.getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX - p.left + 12, p.width - 240)}px`;
    tip.style.top = `${ev.clientY - p.top + 14}px`;
  };

  let trascina = null, mosso = false;
  canvas.addEventListener('pointerdown', ev => { trascina = { x: ev.clientX, y: ev.clientY }; mosso = false; canvas.setPointerCapture(ev.pointerId); canvas.classList.add('trascina'); });
  canvas.addEventListener('pointermove', ev => {
    if (trascina) {
      const dx = ev.clientX - trascina.x, dy = ev.clientY - trascina.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) mosso = true;
      stato.imbardata += dx * 0.008;
      stato.beccheggio = Math.max(-1.45, Math.min(1.45, stato.beccheggio + dy * 0.008));
      trascina = { x: ev.clientX, y: ev.clientY };
      etichetta(null);
      ridisegna();
      return;
    }
    if (ev.pointerType === 'touch') return;
    const e = vicino(ev);
    if (e === stato.sopra) { if (e) etichetta(e, ev); return; }
    stato.sopra = e;
    etichetta(e, ev);
    sync?.passa(e);
    if (e) interazione?.mostra([e], canvas); else interazione?.pulisci(canvas);
    ridisegna();
  });
  canvas.addEventListener('pointerup', ev => {
    trascina = null;
    canvas.classList.remove('trascina');
    if (!mosso) { const e = vicino(ev); if (e && sync) sync.seleziona(e); }
  });
  canvas.addEventListener('pointerleave', () => {
    if (trascina || !stato.sopra) return;
    stato.sopra = null; etichetta(null); sync?.passa(null); interazione?.pulisci(canvas); ridisegna();
  });
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    stato.zoom = Math.max(0.4, Math.min(6, stato.zoom * Math.exp(-ev.deltaY * 0.0015)));
    ridisegna();
  }, { passive: false });
  new ResizeObserver(ridisegna).observe(canvas);
  sync?.mostra(e => { stato.fissato = e; ridisegna(); }); // evidenza anche dal passaggio sulla minimappa

  // comandi: superficie, esagerazione verticale, azzera vista
  const comandi = document.createElement('span');
  comandi.className = 'grafico-3d-comandi';
  const etichettaDi = (testo, campo) => { const l = document.createElement('label'); l.append(campo, ` ${testo}`); return l; };
  const sup = document.createElement('input');
  sup.type = 'checkbox';
  sup.checked = stato.mostraSuperficie;
  sup.disabled = !quadri.length;
  sup.addEventListener('change', () => { stato.mostraSuperficie = sup.checked; ridisegna(); });
  const esa = document.createElement('input');
  esa.type = 'range'; esa.min = '0.25'; esa.max = '3'; esa.step = '0.05'; esa.value = String(ESAGERA);
  esa.addEventListener('input', () => { stato.esagera = Number(esa.value); ridisegna(); });
  const azzera = document.createElement('button');
  azzera.type = 'button';
  azzera.textContent = t('terremoti.sez.azzeraVista');
  azzera.addEventListener('click', () => { Object.assign(stato, { imbardata: -0.45, beccheggio: 0.3, zoom: 1, esagera: ESAGERA }); esa.value = String(ESAGERA); ridisegna(); });
  comandi.append(etichettaDi(t('terremoti.sez.superficie'), sup), etichettaDi(t('terremoti.sez.esagerazione'), esa), azzera);
  return { canvas, comandi, disegna: ridisegna };
}
