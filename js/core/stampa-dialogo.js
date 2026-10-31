// Pannello «Stampa»: scelta di cosa stampare. Un riquadro trascinabile sulla mappa (con la proporzione del foglio) dice quale area
// finisce nel file; il pannello sceglie formato, uscita, titolo ed elementi e mostra un'anteprima che si aggiorna da sola.
// La mappa sotto il riquadro resta spostabile e ingrandibile: il riquadro resta fermo sullo schermo.
import { t as tr, localeIntl } from './i18n.js';
import { FORMATI, SCALE_STAMPA, areaMappaMm, attribuzioniUniche, el, esportaFile, limiteLatoGpu, mmInPx, pixelRatioSicuro, stampaFoglio } from './stampa.js';
import { evidenziaEventi, nascondiEvidenzaEventi } from './evidenza-eventi.js';
import { coloreMagnitudo } from './magnitudo.js';
import { coloreProfondita } from './profondita.js';
import { modoTema } from './tema-magnitudo.js';
import { EVENTO_SHAKEMAP, contorniAttivi } from './shakemap-mappa.js';
import { PRODOTTI_SHAKEMAP, fasciaEta, haShakeMap } from '../layers/scheda-terremoti.js';
import { areaMappaPoster, caricaLogo, disegnaPoster, paginaMm, sottotitoloPredefinito, zoomPerPagina } from './stampa-poster.js';

const LARGHEZZA_ANTEPRIMA = 640; // px del canvas dell'anteprima (CSS lo adatta al pannello)
const LARGHEZZA_MIN_RIQUADRO = 80;
const MARGINE_INIZIALE = 0.12;

// Proporzione larghezza/altezza dell'area stampata: la mappa dentro la cornice per il poster, l'area sopra i testi per il foglio
export function aspetto(formato, direzione, uscita) {
  const a = uscita === 'stampa' ? areaMappaMm(formato, direzione) : areaMappaPoster(formato, direzione);
  return a.larghezza / a.altezza;
}

// Riquadro { x, y, w, h } in px dello schermo, al centro della vista e con un margine tutt'intorno
// `vista.sinistra` (opzionale) = x da cui la mappa è libera: a sinistra c'è il pannello
export function riquadroIniziale(vista, proporzione) {
  const sinistra = vista.sinistra ?? 0;
  const libera = vista.larghezza - sinistra;
  const maxL = libera * (1 - 2 * MARGINE_INIZIALE);
  const maxA = vista.altezza * (1 - 2 * MARGINE_INIZIALE);
  const w = Math.min(maxL, maxA * proporzione);
  const h = w / proporzione;
  return { x: sinistra + (libera - w) / 2, y: (vista.altezza - h) / 2, w, h };
}

// Tiene il riquadro dentro la vista senza cambiarne la dimensione
export function dentroVista(r, vista) {
  return { ...r, x: Math.max(vista.sinistra ?? 0, Math.min(r.x, vista.larghezza - r.w)), y: Math.max(0, Math.min(r.y, vista.altezza - r.h)) };
}

// Nuova proporzione (cambio di formato o orientamento): stesso centro e stessa larghezza, ridotto se non sta nella vista
export function adattaProporzione(r, proporzione, vista) {
  let w = r.w;
  let h = w / proporzione;
  if (h > vista.altezza) { h = vista.altezza; w = h * proporzione; }
  const libera = vista.larghezza - (vista.sinistra ?? 0);
  if (w > libera) { w = libera; h = w / proporzione; }
  return dentroVista({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h }, vista);
}

// Ridimensiona dall'angolo in basso a destra tenendo la proporzione, senza uscire dalla vista né scendere sotto il minimo
export function ridimensiona(r, dx, proporzione, vista) {
  let w = Math.max(LARGHEZZA_MIN_RIQUADRO, Math.min(r.w + dx, vista.larghezza - r.x));
  let h = w / proporzione;
  if (r.y + h > vista.altezza) { h = vista.altezza - r.y; w = h * proporzione; }
  return { ...r, w, h };
}

// Copia del fotogramma della mappa: il canvas WebGL si legge solo durante il render
function fotogramma(map) {
  return new Promise(risolvi => {
    map.once('render', () => {
      const c = map.getCanvas();
      const copia = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height });
      copia.getContext('2d').drawImage(c, 0, 0);
      risolvi(copia);
    });
    map.triggerRepaint();
  });
}

const SOGLIA_STELLA = 5; // dalla magnitudo in su un evento è una stella nel poster, come in legenda
const SOGLIA_FORTI = 5; // «tutti gli eventi dell'area» = magnitudo uguale o superiore a questa
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPZIONI_ELEMENTI = ['legenda', 'scala', 'rosa', 'griglia']; // logo, fonte, attribuzioni e cornice non si tolgono

export function creaPannelloStampa(map, radice, bottone, { eventi = () => [] } = {}) {
  const contenitore = map.getContainer();
  const stato = { formato: 'A4', direzione: 'landscape', uscita: 'png', dpi: 150, scala: null, titolo: '', sottotitolo: '', elementi: Object.fromEntries(OPZIONI_ELEMENTI.map(k => [k, true])), riquadro: null, occupato: false };
  let logo = null;
  let ultimoFotogramma = null;
  let aperto = false;

  // Area della mappa in cui sta il riquadro: quella libera accanto al pannello (a destra del pannello sul desktop, sopra il foglio
  // basso sul telefono), così riquadro e maniglia non finiscono mai sotto il pannello
  const vista = () => {
    const b = contenitore.getBoundingClientRect();
    let larghezza = contenitore.clientWidth;
    let altezza = contenitore.clientHeight;
    let sinistra = 0;
    if (aperto) {
      const p = radice.getBoundingClientRect();
      const minimo = 2 * LARGHEZZA_MIN_RIQUADRO;
      if (p.width >= b.width * 0.9) altezza = Math.max(minimo, Math.min(altezza, p.top - b.top - 12));
      else if (p.left - b.left < b.width / 2) sinistra = Math.max(0, Math.min(larghezza - minimo, p.right - b.left + 12));
      else larghezza = Math.max(minimo, Math.min(larghezza, p.left - b.left - 12));
    }
    return { larghezza, altezza, sinistra };
  };
  const proporzione = () => aspetto(stato.formato, stato.direzione, stato.uscita);

  // — riquadro sulla mappa —
  const maniglia = el('span', { className: 'stampa-maniglia', title: tr('stampa.maniglia') });
  const riquadro = el('div', { id: 'stampa-riquadro', hidden: true }, maniglia);
  document.body.append(riquadro);
  const posiziona = () => {
    const r = stato.riquadro;
    const b = contenitore.getBoundingClientRect();
    Object.assign(riquadro.style, { left: `${b.left + r.x}px`, top: `${b.top + r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  };
  let trascina = null;
  riquadro.addEventListener('pointerdown', e => {
    trascina = { tipo: e.target === maniglia ? 'maniglia' : 'sposta', x: e.clientX, y: e.clientY, partenza: { ...stato.riquadro } };
    riquadro.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  riquadro.addEventListener('pointermove', e => {
    if (!trascina) return;
    const dx = e.clientX - trascina.x;
    const dy = e.clientY - trascina.y;
    stato.riquadro = trascina.tipo === 'maniglia'
      ? ridimensiona(trascina.partenza, dx, proporzione(), vista())
      : dentroVista({ ...trascina.partenza, x: trascina.partenza.x + dx, y: trascina.partenza.y + dy }, vista());
    posiziona();
  });
  const rilascia = () => { if (trascina) { trascina = null; riempiEventi(); aggiornaAnteprima(); } };
  riquadro.addEventListener('pointerup', rilascia);
  riquadro.addEventListener('pointercancel', rilascia);

  // — anteprima —
  const anteprima = el('canvas', { className: 'stampa-anteprima', role: 'img', ariaLabel: tr('stampa.anteprima.alt') });
  // Centro e zoom con cui il riquadro verrebbe reso: gli stessi dell'esportazione, così la graticola dell'anteprima è quella vera
  const inquadratura = () => {
    const r = stato.riquadro;
    const area = stato.uscita === 'stampa' ? areaMappaMm(stato.formato, stato.direzione) : areaMappaPoster(stato.formato, stato.direzione);
    return {
      centro: map.unproject([r.x + r.w / 2, r.y + r.h / 2]),
      zoom: zoomPerPagina(map.getZoom(), { larghezza: r.w, altezza: r.h }, { larghezza: mmInPx(area.larghezza), altezza: mmInPx(area.altezza) }),
    };
  };
  // Con i contorni in mappa il sottotitolo di riserva dice di quale evento sono (se il testo è vuoto)
  const sottotitoloEffettivo = () => {
    if (stato.sottotitolo) return stato.sottotitolo;
    const c = contorniAttivi();
    if (!c) return '';
    const prodotto = tr(`terremoti.ev.cont.${c.prodotto}`);
    return tr('stampa.poster.sottotitoloShakeMap', { prodotto, id: c.id });
  };
  async function aggiornaAnteprima(nuovoFotogramma = true) {
    if (!aperto || !stato.riquadro) return;
    if (nuovoFotogramma) ultimoFotogramma = await fotogramma(map);
    if (!aperto || !ultimoFotogramma) return;
    const r = stato.riquadro;
    const k = ultimoFotogramma.width / contenitore.clientWidth;
    const ritaglio = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    if (stato.uscita === 'stampa') {
      anteprima.width = LARGHEZZA_ANTEPRIMA;
      anteprima.height = Math.round(LARGHEZZA_ANTEPRIMA / proporzione());
      anteprima.getContext('2d').drawImage(ultimoFotogramma, ritaglio.x, ritaglio.y, ritaglio.w, ritaglio.h, 0, 0, anteprima.width, anteprima.height);
      return;
    }
    const pagina = paginaMm(stato.formato, stato.direzione);
    anteprima.width = LARGHEZZA_ANTEPRIMA;
    anteprima.height = Math.round(LARGHEZZA_ANTEPRIMA * pagina.altezza / pagina.larghezza);
    const data = new Date().toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric' });
    const vista = inquadratura();
    disegnaPoster(anteprima, {
      pagina, formato: stato.formato, direzione: stato.direzione, titolo: stato.titolo || tr('stampa.poster.titoloDefault'),
      sottotitolo: sottotitoloEffettivo() || sottotitoloPredefinito(vista.centro, data),
      attribuzioni: attribuzioniUniche([...document.querySelectorAll('#mappa .maplibregl-ctrl-attrib-inner')].map(a => a.textContent)),
      logo, data, elementi: stato.elementi, evento: eventoScelto(), stelle: stelleDaEventi(), mappa: { immagine: ultimoFotogramma, ritaglio }, vista,
    });
  }
  const sulMovimento = () => { riempiEventi(); aggiornaAnteprima(); };
  const sulRidimensionamento = () => { if (aperto) { stato.riquadro = adattaProporzione(stato.riquadro, proporzione(), vista()); posiziona(); riempiEventi(); aggiornaAnteprima(); } };

  // — controlli —
  const sceltaDa = (id, etichetta, opzioni, valore, suCambio) => {
    const select = el('select', { id }, ...opzioni.map(([v, testo]) => el('option', { value: v, textContent: testo, selected: v === valore })));
    select.addEventListener('change', () => suCambio(select.value));
    return el('label', { className: 'stampa-campo', htmlFor: id }, el('span', { textContent: etichetta }), select);
  };
  const campoTesto = (id, etichetta, suCambio, segnaposto = '') => {
    const input = el('input', { id, type: 'text', maxLength: 90, placeholder: segnaposto });
    input.addEventListener('input', () => suCambio(input.value.trim()));
    return el('label', { className: 'stampa-campo', htmlFor: id }, el('span', { textContent: etichetta }), input);
  };
  const dopoCambioProporzione = () => { stato.riquadro = adattaProporzione(stato.riquadro, proporzione(), vista()); posiziona(); aggiornaVisibilita(); aggiornaRisoluzione(); riempiEventi(); aggiornaAnteprima(false); };
  const campoSoloPoster = [];
  const elementi = el('fieldset', { className: 'stampa-elementi' }, el('legend', { textContent: tr('stampa.elementi') }),
    ...OPZIONI_ELEMENTI.map(k => {
      const casella = el('input', { type: 'checkbox', checked: true });
      casella.addEventListener('change', () => { stato.elementi[k] = casella.checked; aggiornaAnteprima(false); });
      return el('label', {}, casella, el('span', { textContent: tr(`stampa.el.${k}`) }));
    }),
    el('p', { className: 'stampa-nota', textContent: tr('stampa.el.nota') }));
  const sottotitolo = campoTesto('stampa-sottotitolo', tr('stampa.sottotitolo'), v => { stato.sottotitolo = v; aggiornaAnteprima(false); }, tr('stampa.sottotitolo.segnaposto'));
  campoSoloPoster.push(sottotitolo, elementi);
  const aggiornaVisibilita = () => campoSoloPoster.forEach(n => { n.hidden = stato.uscita === 'stampa'; });
  // Risoluzione di uscita: la dimensione in pixel dell'immagine; il dispositivo ha un limite alla cattura, che qui si dichiara
  const infoRisoluzione = el('p', { className: 'stampa-nota' });
  const aggiornaRisoluzione = () => {
    const ratio = pixelRatioSicuro(stato.dpi / 96, areaMappaPoster(stato.formato, stato.direzione), limiteLatoGpu(map));
    const pagina = paginaMm(stato.formato, stato.direzione);
    const px = mm => Math.round(mm / 25.4 * ratio * 96).toLocaleString(localeIntl());
    const effettivi = Math.round(ratio * 96);
    infoRisoluzione.textContent = tr('stampa.risoluzione.info', { l: px(pagina.larghezza), a: px(pagina.altezza) }) + (effettivi < stato.dpi - 1 ? ` · ${tr('stampa.risoluzione.limitata', { dpi: effettivi })}` : '');
  };

  // — contorni ShakeMap di un evento: stessa azione della scheda dell'evento, le linee compaiono sulla mappa e quindi nel file —
  // L'elenco mostra tutti gli eventi M ≥ soglia dentro il riquadro, per decidere quale stampare (se ne stampa uno solo);
  // quelli senza ShakeMap si vedono ma non si scelgono.
  const sceltaEvento = el('select', { id: 'stampa-shakemap-evento' });
  const sceltaProdotto = el('select', { id: 'stampa-shakemap-prodotto' }, ...PRODOTTI_SHAKEMAP.map(([v, chiave]) => el('option', { value: v, textContent: tr(chiave) })));
  const vuotoShake = el('p', { className: 'stampa-nota', textContent: tr('stampa.shakemap.vuoto', { soglia: SOGLIA_FORTI }), hidden: true });
  const intestazioneElenco = el('p', { className: 'stampa-nota' });
  // Eventi M ≥ soglia dentro il riquadro (limiti dagli angoli: la mappa del file ha il nord in alto), i più forti per primi
  const fortiNellArea = () => {
    const r = stato.riquadro;
    const a = map.unproject([r.x, r.y]);
    const b = map.unproject([r.x + r.w, r.y + r.h]);
    const visti = new Set();
    return eventi().filter(p => p.mag >= SOGLIA_FORTI && p.lon >= a.lng && p.lon <= b.lng && p.lat <= a.lat && p.lat >= b.lat && !visti.has(String(p.id)) && visti.add(String(p.id)))
      .sort((x, y) => y.mag - x.mag || y.ts - x.ts).slice(0, 80);
  };
  // Stelle del poster: gli eventi in elenco con magnitudo da SOGLIA_STELLA, col colore che hanno in mappa nel modo «Tematizza per» in corso
  const stelleDaEventi = () => {
    const modo = modoTema();
    const colore = p => (modo === 'magnitudo' ? coloreMagnitudo(p.mag) : modo === 'profondita' ? coloreProfondita(p.prof) : fasciaEta(p.ts).colore);
    return eventi().filter(p => p.mag >= SOGLIA_STELLA && Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => ({ lon: p.lon, lat: p.lat, colore: colore(p) }));
  };
  const noti = new Map(); // eventi già visti nell'elenco (id → riga): servono a evidenziarli e a scriverli nel poster anche dopo che escono dall'area
  const eventoScelto = () => { const c = contorniAttivi(); return c ? noti.get(String(c.id)) ?? null : null; };
  // L'evento dei contorni si evidenzia in mappa con l'alone magenta (è un livello della mappa: finisce anche nel file)
  const aggiornaEvidenza = () => {
    const p = aperto ? eventoScelto() : null;
    if (p) evidenziaEventi(map, [{ ...p, raggio: Math.min(34, 14 + p.mag * 2.6) }], { inquadra: false }); else nascondiEvidenzaEventi(map);
  };
  const applicaContorni = () => { document.dispatchEvent(new CustomEvent(EVENTO_SHAKEMAP, { detail: sceltaEvento.value ? { id: sceltaEvento.value, prodotto: sceltaProdotto.value } : { prodotto: null } })); aggiornaEvidenza(); aggiornaAnteprima(false); };
  sceltaEvento.addEventListener('change', applicaContorni);
  sceltaProdotto.addEventListener('change', () => { if (sceltaEvento.value) applicaContorni(); });
  const riempiEventi = () => {
    const corrente = contorniAttivi()?.id ?? '';
    const voci = fortiNellArea();
    for (const p of voci) noti.set(String(p.id), p);
    const etichetta = p => {
      const base = tr('stampa.shakemap.voce', { mag: Number(p.mag).toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }), luogo: p.luogo || '—', data: new Date(p.ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) });
      return haShakeMap(p) ? base : `${base} · ${tr('stampa.shakemap.senza')}`;
    };
    const ids = new Set(voci.map(p => String(p.id)));
    sceltaEvento.replaceChildren(
      el('option', { value: '', textContent: tr('stampa.shakemap.nessuno') }),
      ...voci.map(p => el('option', { value: String(p.id), textContent: etichetta(p), disabled: !haShakeMap(p) })),
      ...(corrente && !ids.has(corrente) ? [el('option', { value: corrente, textContent: `ID ${corrente}` })] : []), // contorni accesi da scheda o link, fuori dall'area o dal periodo
    );
    sceltaEvento.value = corrente;
    if (contorniAttivi()) sceltaProdotto.value = contorniAttivi().prodotto;
    intestazioneElenco.textContent = voci.length ? tr('stampa.shakemap.elenco', { n: voci.length, soglia: SOGLIA_FORTI }) : '';
    vuotoShake.hidden = voci.length > 0;
  };
  const shake = el('fieldset', { className: 'stampa-shakemap' }, el('legend', { textContent: tr('stampa.shakemap.titolo') }),
    el('label', { className: 'stampa-campo', htmlFor: 'stampa-shakemap-evento' }, el('span', { textContent: tr('stampa.shakemap.evento') }), sceltaEvento),
    el('label', { className: 'stampa-campo', htmlFor: 'stampa-shakemap-prodotto' }, el('span', { textContent: tr('stampa.shakemap.prodotto') }), sceltaProdotto),
    intestazioneElenco, vuotoShake, el('p', { className: 'stampa-nota', textContent: tr('stampa.shakemap.nota') }));
  const campoRisoluzione = sceltaDa('stampa-risoluzione', tr('html.stampa.risoluzione'), [96, 150, 300].map(d => [String(d), tr('stampa.risoluzione.opzione', { dpi: d, nome: tr(`stampa.risoluzione.${d}`) })]), String(stato.dpi), v => { stato.dpi = +v; aggiornaRisoluzione(); });
  campoSoloPoster.push(campoRisoluzione, infoRisoluzione);
  const statoEsporta = el('p', { className: 'stampa-nota stampa-errore', role: 'status', hidden: true, textContent: tr('stampa.errore') });
  const esporta = el('button', { type: 'button', className: 'stampa-esporta', textContent: tr('stampa.esporta') });
  const centra = el('button', { type: 'button', className: 'stampa-centra', textContent: tr('stampa.centra'), title: tr('stampa.centra.titolo') });
  const adatta = el('button', { type: 'button', className: 'stampa-adatta', textContent: tr('stampa.riquadro.adatta') });

  radice.append( // il titolo è quello del tab, già nella sezione
    anteprima,
    el('p', { className: 'stampa-nota', textContent: tr('stampa.riquadro.nota') }),
    campoTesto('stampa-titolo', tr('html.stampa.titolo'), v => { stato.titolo = v; aggiornaAnteprima(false); }, tr('stampa.poster.titoloDefault')),
    sottotitolo,
    el('div', { className: 'stampa-riga' },
      sceltaDa('stampa-formato', tr('html.stampa.formato'), Object.keys(FORMATI).map(f => [f, f]), stato.formato, v => { stato.formato = v; dopoCambioProporzione(); }),
      sceltaDa('stampa-direzione', tr('html.stampa.orient'), [['landscape', tr('stampa.orizzontale')], ['portrait', tr('stampa.verticale')]], stato.direzione, v => { stato.direzione = v; dopoCambioProporzione(); })),
    el('div', { className: 'stampa-riga' },
      sceltaDa('stampa-uscita', tr('html.stampa.uscita'), ['png', 'jpg', 'pdf', 'stampa'].map(v => [v, tr(`stampa.uscita.${v}`)]), stato.uscita, v => { stato.uscita = v; dopoCambioProporzione(); }),
      sceltaDa('stampa-scala', tr('html.stampa.scala'), [['', tr('stampa.vistaAttuale')], ...SCALE_STAMPA.map(n => [String(n), tr('stampa.opzioneScala', { n: n.toLocaleString(localeIntl()) })])], '', v => { stato.scala = +v || null; aggiornaAnteprima(false); })),
    campoRisoluzione, infoRisoluzione,
    shake,
    elementi,
    statoEsporta,
    el('div', { className: 'stampa-azioni' }, adatta, centra, esporta));
  aggiornaVisibilita();
  aggiornaRisoluzione();

  // Centra: con un evento ShakeMap scelto porta l'epicentro al centro del riquadro (sposta la mappa); altrimenti centra il riquadro
  // nell'area libera della mappa
  centra.addEventListener('click', () => {
    const p = eventoScelto();
    const r = stato.riquadro;
    if (p && Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
      const punto = map.project([p.lon, p.lat]);
      map.panBy([punto.x - (r.x + r.w / 2), punto.y - (r.y + r.h / 2)], { duration: reducedMotion() ? 0 : 400 }); // a fine movimento anteprima ed elenco si aggiornano
      return;
    }
    const v = vista();
    stato.riquadro = dentroVista({ ...r, x: (v.sinistra ?? 0) + (v.larghezza - (v.sinistra ?? 0) - r.w) / 2, y: (v.altezza - r.h) / 2 }, v);
    posiziona(); riempiEventi(); aggiornaAnteprima();
  });
  adatta.addEventListener('click', () => { stato.riquadro = riquadroIniziale(vista(), proporzione()); posiziona(); riempiEventi(); aggiornaAnteprima(); });

  esporta.addEventListener('click', async () => {
    if (stato.occupato) return;
    stato.occupato = true;
    esporta.disabled = true;
    const etichetta = esporta.textContent;
    esporta.textContent = tr('stampa.occupato');
    try {
      const { centro } = inquadratura();
      const { zoom } = inquadratura();
      const comuni = { formato: stato.formato, direzione: stato.direzione, scala: stato.scala, centro, zoom, titolo: stato.titolo };
      statoEsporta.hidden = true;
      const riuscita = stato.uscita === 'stampa' ? await stampaFoglio(map, comuni)
        : await esportaFile(map, { ...comuni, uscita: stato.uscita, dpi: stato.dpi, titolo: stato.titolo || tr('stampa.poster.titoloDefault'), sottotitolo: sottotitoloEffettivo(), elementi: stato.elementi, evento: eventoScelto(), stelle: stelleDaEventi() });
      statoEsporta.hidden = riuscita !== false; // cattura o scrittura fallite (di solito immagine troppo grande per il dispositivo)
    } finally { stato.occupato = false; esporta.disabled = false; esporta.textContent = etichetta; }
  });

  // Contorni accesi o spenti da altrove (scheda, chip, link): il pannello si riallinea e l'anteprima attende l'arrivo delle linee
  const suContorni = () => { riempiEventi(); aggiornaEvidenza(); setTimeout(() => aggiornaAnteprima(), 1400); };

  // Il tab si apre e si chiude dal pannello di sinistra (pulsante, Esc, altro tab): qui si segue lo stato della sezione
  function imposta(apri) {
    if (apri === aperto) return;
    aperto = apri;
    riquadro.hidden = !apri;
    aggiornaEvidenza(); // chiuso il pannello l'alone va via, i contorni restano
    if (!apri) { map.off('moveend', sulMovimento); window.removeEventListener('resize', sulRidimensionamento); document.removeEventListener(EVENTO_SHAKEMAP, suContorni); return; }
    stato.riquadro = stato.riquadro ? adattaProporzione(stato.riquadro, proporzione(), vista()) : riquadroIniziale(vista(), proporzione());
    posiziona();
    map.on('moveend', sulMovimento);
    document.addEventListener(EVENTO_SHAKEMAP, suContorni);
    window.addEventListener('resize', sulRidimensionamento);
    riempiEventi();
    aggiornaEvidenza();
    caricaLogo().then(i => { logo = i; aggiornaAnteprima(false); });
    aggiornaAnteprima();
    radice.querySelector('#stampa-titolo').focus();
  }
  new MutationObserver(() => imposta(!radice.hidden)).observe(radice, { attributes: true, attributeFilter: ['hidden'] });
  imposta(!radice.hidden); // il contenuto si crea al primo clic sul tab, quando la sezione è già aperta
  return { aperto: () => aperto };
}
