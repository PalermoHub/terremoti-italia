// PDF A4 della scheda del pannello di destra: le sezioni vengono clonate in pagine HTML fuori schermo (sempre chiare),
// ogni pagina è rasterizzata in JPEG (SVG `foreignObject` → canvas, senza librerie) e le pagine formano un PDF multipagina.
// Nota tecnica: l'SVG va caricato da un data URL (da un blob il canvas risulta «tainted») e le immagini esterne vanno
// convertite prima in data URL, perché dentro il `foreignObject` non si caricano risorse di rete.
import { t as tr, localeIntl } from './i18n.js';
import { creaPdfPagine } from './pdf-pagine.js';
import { impagina, classifica } from './scheda-pdf-impagina.js';

const L_PX = 794; // A4 a 96 dpi
const A_PX = 1123;
const MARGINE = 40;
const BANNER = { pieno: 78, ridotto: 38 };
const PIEDE = 96;
const VUOTO = 14; // spazio fra le righe di blocchi
const COLONNA = (L_PX - 2 * MARGINE - 16) / 2;
const SCALA = 1.6; // ≈150 dpi
const LOGO = 'img/opendatasicilia.png';
const URL_APP = 'https://palermohub.opendatasicilia.it/terremoti_italia.html';

const el = (tag, classe, testo) => { const e = document.createElement(tag); if (classe) e.className = classe; if (testo != null) e.textContent = testo; return e; };

// I token chiari stanno nel primo `:root` del CSS: applicati alla radice del PDF vincono sul tema scuro dell'app
function tokenChiari() {
  const token = {};
  for (const foglio of document.styleSheets) {
    let regole;
    try { regole = foglio.cssRules; } catch { continue; }
    for (const r of regole) if (r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--')) token[p] = r.style.getPropertyValue(p);
  }
  return token;
}

async function comeDataUrl(url) {
  const risposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`); // i18n-ok: errore tecnico
  const blob = await risposta.blob();
  return new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = ko; f.readAsDataURL(blob); });
}

// Le immagini esterne (tessere della mappa, logo) diventano data URL; se una non si scarica resta vuota, la pagina si genera lo stesso
async function incorporaImmagini(radice) {
  await Promise.all([...radice.querySelectorAll('img')].map(async img => {
    if (img.src.startsWith('data:')) return;
    try { img.src = await comeDataUrl(img.src); } catch { img.removeAttribute('src'); }
  }));
  // senza decodifica l'immagine misura ~0 px e la riga che la contiene risulta più bassa di com'è
  await Promise.all([...radice.querySelectorAll('img[src]')].map(img => { img.loading = 'eager'; return Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 3000))]); }));
}

// Stile calcolato copiato inline sul clone: nell'SVG non arrivano i fogli di stile dell'app. Copiarlo tutto (565 proprietà su
// migliaia di elementi) produce centinaia di MB: si copiano solo le proprietà diverse dal valore predefinito del tag (misurato
// in un iframe vuoto) e, dentro gli SVG dei grafici, solo quelle di presentazione.
const PROPRIETA_SVG = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'display', 'visibility', 'color', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'shape-rendering', 'paint-order'];

function creaStili() {
  const iframe = el('iframe');
  iframe.style.cssText = 'position:fixed;left:-10000px;width:0;height:0;border:0';
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  const difetti = new Map();
  const predefiniti = tag => {
    if (!difetti.has(tag)) {
      const e = doc.createElement(tag);
      doc.body.append(e);
      const cs = doc.defaultView.getComputedStyle(e);
      difetti.set(tag, new Map([...cs].map(p => [p, cs.getPropertyValue(p)])));
    }
    return difetti.get(tag);
  };
  const inline = vivo => {
    const clone = vivo.cloneNode(true);
    const da = [vivo, ...vivo.querySelectorAll('*')];
    const a = [clone, ...clone.querySelectorAll('*')];
    da.forEach((e, i) => {
      const cs = getComputedStyle(e);
      let stile = '';
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') {
        for (const p of PROPRIETA_SVG) stile += `${p}:${cs.getPropertyValue(p)};`;
      } else {
        const base = e instanceof HTMLElement ? predefiniti(e.tagName.toLowerCase()) : null;
        for (const p of cs) { const v = cs.getPropertyValue(p); if (!base || base.get(p) !== v) stile += `${p}:${v};`; }
      }
      a[i].setAttribute('style', stile);
    });
    return clone;
  };
  return { inline, chiudi: () => iframe.remove() };
}

// Pagina (già nel documento e impaginata) → JPEG
export async function rasterizza(pagina, stili) {
  const clone = stili.inline(pagina);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L_PX}" height="${A_PX}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('SVG non caricabile')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }); // i18n-ok: errore tecnico
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(L_PX * SCALA), height: Math.round(A_PX * SCALA) });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(SCALA, SCALA);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('canvas non esportabile'))), 'image/jpeg', 0.82)); // i18n-ok: errore tecnico
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), pxL: canvas.width, pxA: canvas.height };
}

// Sezione clonata, aperta e senza controlli interattivi
function pulita(sez) {
  const c = sez.cloneNode(true);
  c.querySelectorAll('.scheda-strato, .scheda-azione, .terremoti-filtri').forEach(n => n.remove());
  const sommario = c.querySelector(':scope > summary');
  if (sommario) {
    const h = el('h3', 'pdf-h3');
    const icona = sommario.querySelector('.scheda-icona');
    if (icona) h.append(icona);
    h.append(sez.dataset.titolo || sommario.querySelector('h3')?.textContent?.trim() || '');
    sommario.replaceWith(h);
  }
  // senza <summary> un <details> mostrerebbe un titolo predefinito («Details»): la sezione diventa un semplice blocco; gli accordion interni restano come li vede l'utente (chiusi = solo titolo)
  const blocco = el('div', 'scheda-sez pdf-sez');
  blocco.dataset.chiave = sez.dataset.chiave;
  blocco.append(...c.childNodes);
  return blocco;
}

// Sezioni → blocchi impaginabili. Le sezioni con grafici `.terremoti-serie` si spezzano: titolo, un blocco per grafico, nota di fonte
function blocchiDa(sezioni, { stralcio, coordinate, contesto, data }) {
  const blocchi = [];
  let n = 0;
  const aggiungi = (nodo, larghezza) => blocchi.push({ id: `b${n++}`, nodo, larghezza });
  if (stralcio) {
    const mappa = el('figure', 'pdf-stralcio');
    const img = el('img');
    img.src = stralcio;
    img.alt = tr('scheda.stralcio');
    mappa.append(img);
    aggiungi(mappa, 'meta');
    const dati = el('dl', 'pdf-dati');
    for (const [k, v] of [[tr('scheda.pdf.coordinate'), coordinate], [tr('scheda.pdf.contesto'), contesto], [tr('scheda.pdf.data'), data]]) {
      if (!v) continue;
      dati.append(el('dt', null, k), el('dd', null, v));
    }
    aggiungi(dati, 'meta');
  }
  for (const sez of sezioni) {
    const c = pulita(sez);
    const serie = [...c.querySelectorAll('.terremoti-serie')];
    if (!serie.length) { aggiungi(c, classifica({ haGrafico: false, haTabella: false })); continue; }
    const titolo = el('div', 'pdf-titolo-sezione');
    titolo.append(c.querySelector(':scope > .pdf-h3') ?? el('h3'));
    aggiungi(titolo, 'piena');
    blocchi[blocchi.length - 1].conSuccessivo = true;
    // grafici in coppia; note e testi della sezione restano, nell'ordine originale, come blocchi a tutta larghezza
    const percorri = nodo => {
      for (const f of [...nodo.children]) {
        if (f.classList.contains('terremoti-serie')) aggiungi(f, classifica({ haGrafico: true, haTabella: false }));
        else if (f.querySelector('.terremoti-serie')) percorri(f);
        else if (f.textContent.trim() || f.querySelector('svg, img')) aggiungi(f, 'piena');
      }
    };
    percorri(c);
  }
  return blocchi;
}

async function caricaLogo() { try { return await comeDataUrl(LOGO); } catch { return null; } }

function banner(ridotto, { titolo, coordinate, contesto, data }) {
  const b = el('header', `pdf-banner${ridotto ? ' pdf-banner-ridotto' : ''}`);
  b.style.height = `${ridotto ? BANNER.ridotto : BANNER.pieno}px`;
  const testo = el('div', 'pdf-banner-testo');
  testo.append(el('h1', null, titolo));
  if (!ridotto) testo.append(el('p', null, [coordinate, contesto].filter(Boolean).join(' · ')));
  b.append(testo, el('span', 'pdf-banner-data', data));
  return b;
}

function piede(n, tot, logo) {
  const p = el('footer', 'pdf-piede');
  p.style.height = `${PIEDE}px`;
  if (logo) { const i = el('img', 'pdf-logo'); i.src = logo; i.alt = 'OpenDataSicilia'; p.append(i); }
  const testo = el('div', 'pdf-piede-testo');
  testo.append(el('p', 'pdf-link', URL_APP), el('p', 'pdf-disclaimer', tr('scheda.disclaimer')));
  p.append(testo, el('span', 'pdf-pagina-n', tr('scheda.pdf.pagina', { n, tot })));
  return p;
}

// `contenitore` = `#scheda`; opzioni = { stralcio: data URL | null, titolo, coordinate, contesto }. Restituisce il Blob del PDF.
export async function generaPdfScheda(contenitore, { stralcio = null, titolo, coordinate = '', contesto = '' }) {
  const data = new Date().toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric' });
  const radice = el('div', 'pdf-radice');
  const stili = creaStili();
  for (const [k, v] of Object.entries(tokenChiari())) radice.style.setProperty(k, v);
  document.body.append(radice);
  try {
    const visti = new Set();
    const sezioni = [...contenitore.querySelectorAll('.scheda-sez')].filter(s => {
      if (visti.has(s.dataset.chiave) || !s.textContent.trim()) return false; // copie (es. edificio in più tab) e sezioni vuote
      visti.add(s.dataset.chiave);
      return true;
    });
    let nuovoId = 0;
    const opz = { stralcio, coordinate, contesto, data, titolo };
    const blocchi = blocchiDa(sezioni, opz);
    if (!blocchi.length) throw new Error('scheda senza contenuto'); // i18n-ok: errore tecnico
    // misura: ogni blocco alla larghezza che avrà in pagina
    const misura = el('div', 'pdf-misura');
    radice.append(misura);
    for (const b of blocchi) {
      const casella = el('div', 'pdf-blocco');
      casella.style.width = `${b.larghezza === 'meta' ? COLONNA : L_PX - 2 * MARGINE}px`;
      casella.append(b.nodo);
      misura.append(casella);
      b.casella = casella;
    }
    const corpo = h => A_PX - h - PIEDE - 2 * VUOTO;
    await incorporaImmagini(misura);
    const MAX = corpo(BANNER.ridotto);
    // un blocco a tutta larghezza più alto di una pagina si spezza nei suoi figli (altrimenti la pagina lo taglierebbe)
    for (let giro = 0; giro < 4; giro++) {
      let spezzato = false;
      for (let i = 0; i < blocchi.length; i++) {
        const b = blocchi[i];
        if (b.larghezza !== 'piena' || b.casella.offsetHeight + VUOTO <= MAX) continue;
        let contenitore = b.nodo; // si scende nei contenitori con un solo figlio fino a trovare dove tagliare
        while (contenitore.children?.length === 1) contenitore = contenitore.firstElementChild;
        const figli = [...(contenitore.children ?? [])].filter(f => f.textContent.trim() || f.querySelector('svg, img'));
        if (figli.length < 2) continue;
        const nuovi = figli.map(f => {
          const casella = el('div', 'pdf-blocco');
          casella.style.width = b.casella.style.width;
          casella.append(f);
          return { id: `${b.id}.${nuovoId++}`, nodo: f, larghezza: 'piena', casella };
        });
        nuovi.forEach(x => b.casella.before(x.casella));
        b.casella.remove();
        blocchi.splice(i, 1, ...nuovi);
        i += nuovi.length - 1;
        spezzato = true;
      }
      if (!spezzato) break;
    }
    for (const b of blocchi) {
      b.altezza = b.casella.offsetHeight + VUOTO;
      if (b.altezza > MAX) console.warn('PDF scheda: blocco più alto di una pagina, sarà tagliato', b.id, b.altezza); // i18n-ok: avviso solo per la console
    }
    const pagine = impagina(blocchi, { primaPagina: corpo(BANNER.pieno), altre: corpo(BANNER.ridotto) });
    const logo = await caricaLogo();
    const perId = new Map(blocchi.map(b => [b.id, b]));
    const elementi = pagine.map((voci, i) => {
      const pg = el('section', 'pdf-pagina');
      pg.style.width = `${L_PX}px`;
      pg.style.height = `${A_PX}px`;
      const area = el('div', 'pdf-corpo');
      area.style.height = `${corpo(i ? BANNER.ridotto : BANNER.pieno)}px`;
      let riga = null;
      for (const v of voci) {
        const b = perId.get(v.id);
        if (v.colonna === 0 || v.colonna === null) { riga = el('div', 'pdf-riga'); area.append(riga); }
        if (v.colonna === null) riga.classList.add('pdf-riga-piena');
        riga.append(b.casella);
      }
      pg.append(banner(i > 0, opz), area, piede(i + 1, pagine.length, logo));
      return pg;
    });
    radice.append(...elementi);
    misura.remove();
    const immagini = [];
    for (const pg of elementi) { immagini.push(await rasterizza(pg, stili)); }
    return creaPdfPagine(immagini, 210, 297);
  } finally {
    stili.chiudi();
    radice.remove();
  }
}
