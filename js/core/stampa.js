// Stampa dell'area di mappa visibile: foglio con titolo, immagine della mappa, legende dei layer accesi e attribuzioni.
import { t as tr, localeIntl } from './i18n.js';
export function attribuzioniUniche(testi) {
  return [...new Set(testi.map(t => (t ?? '').trim()).filter(Boolean))];
}

const MM_PER_POLLICE = 25.4;
const DPI_CSS = 96;
const CIRCONFERENZA = 40075016.686;
// Lati (corto, lungo) dei formati ISO in mm.
export const FORMATI = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const MARGINE_MM = 10;
const FASCIA_TESTI_MM = 65; // titolo, scala, legenda e attribuzioni sotto la mappa

// Area della mappa sul foglio: pagina meno margini e fascia dei testi.
export function areaMappaMm(formato, direzione) {
  const [corto, lungo] = FORMATI[formato];
  const [l, a] = direzione === 'landscape' ? [lungo, corto] : [corto, lungo];
  return { larghezza: l - 2 * MARGINE_MM, altezza: a - 2 * MARGINE_MM - FASCIA_TESTI_MM };
}

// Riduce il pixel ratio finché il lato maggiore del canvas sta nel limite della GPU (mai sotto 1).
export function pixelRatioSicuro(ratio, area, maxLato) {
  const lato = mmInPx(Math.max(area.larghezza, area.altezza));
  return Math.max(1, Math.min(ratio, maxLato / lato));
}

// 192 dpi (nitido) finché il canvas resta gestibile; A0 a 192 dpi supererebbe i 49 milioni di pixel.
export const pixelRatioPerFormato = formato => (formato === 'A0' ? 1 : 2);
// Lato massimo del canvas WebGL del dispositivo (px): oltre, la cattura fallisce
export function limiteLatoGpu(map) {
  try {
    const gl = map.getCanvas().getContext('webgl2') ?? map.getCanvas().getContext('webgl');
    return gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 4096;
  } catch { return 4096; }
}
export const SCALE_STAMPA = [1000, 2000, 5000, 10000, 25000];

export const mmInPx = mm => mm / MM_PER_POLLICE * DPI_CSS;

// Metri sul terreno per pixel CSS a un dato zoom MapLibre (mondo = 512 px × 2^zoom) e latitudine.
const metriPerPx = (zoom, lat) => CIRCONFERENZA * Math.cos(lat * Math.PI / 180) / (512 * 2 ** zoom);
// Denominatore di scala di una mappa vista a `zoom` e stampata a 96 dpi CSS: 1 px = 0,2646 mm di carta.
export const scalaDaZoom = (zoom, lat) => metriPerPx(zoom, lat) * DPI_CSS / MM_PER_POLLICE * 1000;
export const zoomPerScala = (lat, scala) => Math.log2(CIRCONFERENZA * Math.cos(lat * Math.PI / 180) * DPI_CSS / (512 * scala * MM_PER_POLLICE / 1000));

const LUNGHEZZE_BARRA = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000];
// Barra grafica: la lunghezza tonda più grande che sta in `maxMm` di carta.
export function barraScala(scala, maxMm) {
  const metri = LUNGHEZZE_BARRA.filter(m => m * 1000 / scala <= maxMm).pop() ?? LUNGHEZZE_BARRA[0];
  return { metri, mm: metri * 1000 / scala, etichetta: metri >= 1000 ? `${metri / 1000} km` : `${metri} m` };
}

export function orientamento(larghezza, altezza) {
  return larghezza >= altezza ? 'landscape' : 'portrait';
}

// Il canvas WebGL è leggibile solo durante il render: si forza un ridisegno e si cattura al primo evento «render».
export function catturaMappa(map) {
  return new Promise((risolvi, rifiuta) => {
    map.once('render', () => {
      // Blob + URL temporaneo: per i formati grandi un data URL base64 sarebbe enorme
      map.getCanvas().toBlob(b => (b ? risolvi(URL.createObjectURL(b)) : rifiuta(new Error('canvas vuoto o troppo grande'))), 'image/png');
    });
    map.triggerRepaint();
  });
}

// Cattura a una scala esatta: la mappa reale viene portata (di nascosto) alla dimensione del riquadro di stampa e allo zoom
// corrispondente, poi rimessa com'era. Così restano tutti i layer, senza ricostruire una seconda mappa.
// `zoomFisso` (opzionale) sostituisce lo zoom calcolato dalla scala: il poster inquadra la vista attuale senza scala.
export async function catturaInScala(map, scala, area, pixelRatio, zoomFisso = null, centroFisso = null) {
  const contenitore = map.getContainer();
  const stile = contenitore.style.cssText;
  // il margine dei pannelli (padding) sposterebbe il centro della cattura: si azzera durante lo scatto e si rimette dopo
  const vista = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), padding: map.getPadding?.() };
  const centro = centroFisso ?? vista.center;
  const zoom = zoomFisso ?? zoomPerScala(centro.lat, scala);
  const ratioIniziale = map.getPixelRatio?.() ?? window.devicePixelRatio;
  try {
    map.setPixelRatio?.(pixelRatioSicuro(pixelRatio, area, limiteLatoGpu(map)));
    contenitore.style.cssText = `${stile};position:fixed;left:0;top:0;width:${mmInPx(area.larghezza)}px;height:${mmInPx(area.altezza)}px;visibility:hidden;pointer-events:none`;
    map.resize();
    map.jumpTo({ center: centro, zoom, bearing: 0, pitch: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    await new Promise(risolvi => { // pronta quando i tile richiesti sono arrivati: loaded() e «idle» restano falsi finché esistono sorgenti di layer spenti mai caricate
      const fine = () => { clearTimeout(t); map.off('render', controlla); risolvi(); };
      const controlla = () => { if (map.areTilesLoaded()) fine(); };
      const t = setTimeout(fine, 12000);
      map.on('render', controlla); map.triggerRepaint();
    });
    return { immagine: await catturaMappa(map), centro: map.getCenter(), zoom: map.getZoom() };
  } finally {
    contenitore.style.cssText = stile;
    map.setPixelRatio?.(ratioIniziale);
    map.resize();
    map.jumpTo(vista);
  }
}

export function el(tag, attr = {}, ...figli) {
  const nodo = Object.assign(document.createElement(tag), attr);
  nodo.append(...figli);
  return nodo;
}

// `scala` = denominatore (es. 5000) per la stampa in scala, null per la vista attuale.
function costruisciFoglio(map, immagine, { scala = null, centro = map.getCenter(), formato = 'A4', direzione = 'landscape', titolo = '' } = {}) {
  const attribuzioni = attribuzioniUniche(
    [...document.querySelectorAll('#mappa .maplibregl-ctrl-attrib-inner')].map(a => a.textContent));
  const legende = document.getElementById('legende');
  const data = new Date().toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric' });
  const dettaglio = scala ? tr('stampa.dettaglio.scala', { scala: scala.toLocaleString(localeIntl()) }) : `zoom ${map.getZoom().toFixed(1)}`;
  const area = areaMappaMm(formato, direzione);
  const foglio = el('div', { id: 'foglio-stampa', className: scala ? 'in-scala' : '', style: `--mappa-l:${area.larghezza}mm;--mappa-a:${area.altezza}mm` },
    el('style', { textContent: `@page { size: ${formato} ${direzione}; margin: ${MARGINE_MM}mm; }` }),
    el('header', {}, el('h1', { textContent: titolo || tr('stampa.titolo') }),
      el('p', { textContent: tr('stampa.riga', { data, lat: centro.lat.toFixed(4), lng: centro.lng.toFixed(4), dettaglio }) })),
    el('img', { className: 'stampa-mappa', src: immagine, alt: tr('stampa.alt') }));
  if (scala) {
    const barra = barraScala(scala, 60);
    foglio.append(el('div', { className: 'stampa-scala' },
      el('span', { className: 'stampa-scala-barra', style: `width:${barra.mm}mm` }),
      el('span', { textContent: tr('stampa.nota.scala', { etichetta: barra.etichetta, scala: scala.toLocaleString(localeIntl()) }) })));
  }
  const copia = legende?.cloneNode(true);
  // le legende spostate sotto gli strati (core/legenda-pannello.js) si stampano come le altre: si copia il nodo, non l'involucro ripiegabile
  document.querySelectorAll('.legenda-in-pannello > .legenda').forEach(n => copia?.append(n.cloneNode(true)));
  copia?.querySelectorAll('[hidden], .legenda-sostituita, .legenda-vuota').forEach(n => n.remove()); // restano solo le legende dei layer accesi
  if (copia?.textContent.trim()) {
    copia.removeAttribute('id');
    foglio.append(el('section', { className: 'stampa-legende' }, el('h2', { textContent: tr('stampa.legenda') }), copia));
  }
  if (attribuzioni.length) {
    foglio.append(el('footer', { className: 'stampa-attribuzioni' }, el('h2', { textContent: tr('stampa.fonti') }), el('p', { textContent: attribuzioni.join(' · ') })));
  }
  return foglio;
}

// PNG o PDF «poster»: la mappa a tutta pagina nel formato scelto (fino ad A0) con banner, legenda, scala, rosa dei venti e crediti.
// `centro`/`zoom` arrivano dal riquadro scelto sulla mappa; senza scala lo zoom è già quello che fa stare il riquadro sul foglio.
export async function esportaFile(map, { uscita, formato, direzione, scala, titolo, sottotitolo, elementi, evento, stelle, centro, zoom, dpi = null }) {
  const { esportaPoster, areaMappaPoster } = await import('./stampa-poster.js'); // caricato solo quando serve
  const area = areaMappaPoster(formato, direzione); // la mappa occupa l'area dentro la cornice, non tutta la pagina
  const attribuzioni = attribuzioniUniche([...document.querySelectorAll('#mappa .maplibregl-ctrl-attrib-inner')].map(a => a.textContent));
  let esito;
  try { esito = await catturaInScala(map, scala, area, dpi ? dpi / DPI_CSS : pixelRatioPerFormato(formato), scala ? null : zoom, centro); } catch (e) { console.error('Poster: cattura della mappa non riuscita', e); return false; } // i18n-ok: messaggio solo per la console
  try { await esportaPoster({ immagineUrl: esito.immagine, uscita, formato, direzione, titolo, sottotitolo, elementi, evento, stelle, attribuzioni, centro: esito.centro, zoom: esito.zoom }); return true; } catch (e) { console.error('Poster: esportazione non riuscita', e); return false; } finally { URL.revokeObjectURL(esito.immagine); } // i18n-ok: messaggio solo per la console
}

// Foglio stampabile (titolo, mappa, legende, attribuzioni) sull'area scelta: apre la finestra di stampa del browser
export async function stampaFoglio(map, { formato, direzione, scala, titolo, centro, zoom }) {
  let esito;
  try { esito = scala || zoom != null ? await catturaInScala(map, scala, areaMappaMm(formato, direzione), pixelRatioPerFormato(formato), scala ? null : zoom, centro) : { immagine: await catturaMappa(map), centro: map.getCenter() }; } catch (e) { console.error('Stampa: cattura della mappa non riuscita', e); return false; } // i18n-ok: messaggio solo per la console
  const foglio = costruisciFoglio(map, esito.immagine, { scala, centro: esito.centro, formato, direzione, titolo });
  const pulisci = () => { URL.revokeObjectURL(esito.immagine); foglio.remove(); document.body.classList.remove('stampa-mappa'); window.removeEventListener('afterprint', pulisci); };
  document.body.append(foglio);
  document.body.classList.add('stampa-mappa');
  window.addEventListener('afterprint', pulisci);
  // l'immagine va decodificata prima della stampa, altrimenti l'anteprima parte con l'immagine ancora vuota
  try { await foglio.querySelector('img').decode(); } catch { /* si stampa comunque */ }
  window.print();
  return true;
}

// «Stampa» è un tab del pannello di sinistra (`pannello` = la sua sezione, `tab.bottone` il suo pulsante): il contenuto si crea al
// primo clic. Il pulsante della barra strumenti (che il menu del telefono richiama) apre lo stesso tab.
// `opzioni.eventi`: funzione che dà gli eventi in elenco (per scegliere i contorni ShakeMap di uno di loro)
export function collegaStampa(map, bottone, pannello, opzioni = {}) {
  let pronto = false;
  const prepara = async () => {
    if (pronto) return;
    pronto = true;
    (await import('./stampa-dialogo.js')).creaPannelloStampa(map, pannello, pannello.bottone, opzioni);
  };
  pannello.bottone.addEventListener('click', prepara);
  bottone?.addEventListener('click', () => pannello.bottone.click());
}
