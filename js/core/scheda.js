import { allineaPadding, calcolaPadding, zoomPerCerchio } from './padding-mappa.js';
import { unisci, sezioniConRitardo, testoContesto, titoloScheda, tabScheda, tabDedicato, NOTA_LEGALE, MANCANTE } from './scheda-modello.js';
import { applicaPreferenze, registraVisti, leggiPreferenze, salvaPreferenze } from './scheda-preferenze.js';
import { svgIcona } from './icone.js';
import { segnala } from './pannello.js';
import { ZOOM_SCHEDA, urlDati } from './config.js';
import { liveZoomAttivo } from './live-zoom.js';
import { sceltePerLayer, soloCliccato, evidenzia, cancellaEvidenza, evidenzaVicine } from './evidenza.js';
import { featureVicine } from './scheda-util.js';
import { el, icona, sincronizzaStrato, acceseDaScheda, spegniStratiDaScheda, creaInterruttoreStrato, disegnaSezione } from './scheda-disegno.js';
import { ICONA_INGRANAGGIO, ICONA_X, creaPannelloPreferenze } from './scheda-pannello-preferenze.js';
import { t as tr, tl } from './i18n.js';
import { mostraCerchio, nascondiCerchio } from './cerchio-raggio.js';
import { raggioVicini, cerchioVisibile, EVENTO_RAGGIO } from './raggio-vicini.js';
import { inModoEmergenza, moduliAlClic } from './modo-emergenza.js';
import { ICONE_RAIL } from './rail.js';
import { paroleScheda } from './scheda-parole.js';

const R = 4; // tolleranza in pixel attorno al clic

// Indirizzo condivisibile: la posizione cliccata e la scheda attiva stanno nella query (la vista della mappa è già nell'hash).
function aggiornaUrl(lngLat, tab) {
  try {
    const u = new URL(location.href);
    if (lngLat) {
      u.searchParams.set('scheda', `${lngLat.lat.toFixed(5)},${lngLat.lng.toFixed(5)}`);
      if (tab) u.searchParams.set('tab', tab);
    } else { u.searchParams.delete('scheda'); u.searchParams.delete('tab'); }
    history.replaceState(history.state, '', u);
  } catch { /* contesti senza history: nessun link condivisibile */ }
}

const ICONA_COPIA = svgIcona('copia', 18);
const ICONA_OK = svgIcona('seggio', 18);
const ICONA_STAMPA = svgIcona('stampa', 18);

function copiaTesto(testo) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(testo);
  const t = document.createElement('textarea');
  t.value = testo;
  document.body.append(t);
  t.select();
  document.execCommand('copy');
  t.remove();
  return Promise.resolve();
}

// Le frecce avanti/indietro di una scheda stanno sotto al dito: la scheda nuova si scorre in modo che la sua barra resti alla stessa altezza di prima
const altezzaBarra = contenitore => {
  const barra = contenitore.querySelector('.scheda-nav');
  const corpo = contenitore.querySelector('.scheda-corpo');
  return barra && corpo ? barra.getBoundingClientRect().top - corpo.getBoundingClientRect().top : null;
};
function rimettiBarra(contenitore, sopra) {
  const corpo = contenitore.querySelector('.scheda-corpo');
  const barra = corpo?.querySelector('.scheda-nav');
  if (barra) corpo.scrollTop += barra.getBoundingClientRect().top - corpo.getBoundingClientRect().top - sopra;
}

function mostra(contenitore, lngLat, dati, chiusura, adattaVista, pref, tabIniziale = null) {
  const { contesto, sezioni, legale } = dati;
  let corrente = dati; // le sezioni RNDT arrivano dopo: `aggiungi` le fonde qui e ridisegna il corpo
  const titoloTesto = titoloScheda(sezioni);
  const titolo = el('h2', null, titoloTesto);
  const x = el('button', 'scheda-x');
  x.type = 'button';
  x.title = tr('scheda.chiudiEsc');
  x.setAttribute('aria-label', tr('scheda.chiudi'));
  x.innerHTML = ICONA_X;
  x.addEventListener('click', chiusura);
  // su mobile la scheda è un foglio basso: il pulsante la porta a tutto schermo per leggerla meglio
  const espandi = el('button', 'scheda-espandi');
  espandi.type = 'button';
  const ALT = ['peek', 'meta', 'pieno'];
  const maniglia = el('button', 'scheda-maniglia');
  maniglia.type = 'button';
  maniglia.setAttribute('aria-label', tr('scheda.altezza'));
  maniglia.append(el('i'));
  const imposta = alt => { contenitore.dataset.altezza = alt; contenitore.classList.toggle('scheda-piena', alt === 'pieno'); };
  imposta(inModoEmergenza() ? 'pieno' : 'meta'); // in modalità emergenza (telefono) la scheda dell'area si apre a tutta altezza
  let y0 = 0, mosso = false;
  maniglia.addEventListener('pointerdown', e => { y0 = e.clientY; mosso = false; });
  maniglia.addEventListener('pointerup', e => {
    const dy = e.clientY - y0;
    if (Math.abs(dy) < 30) return;
    mosso = true;
    imposta(ALT[Math.max(0, Math.min(2, ALT.indexOf(contenitore.dataset.altezza) + (dy < 0 ? 1 : -1)))]);
    adattaVista();
  });
  maniglia.addEventListener('click', () => {
    if (mosso) { mosso = false; return; }
    imposta(ALT[(ALT.indexOf(contenitore.dataset.altezza) + 1) % 3]);
    adattaVista();
  });
  // il pannello conosce anche le sezioni di questa scheda: le registra prima di elencarle
  pref.scrivi(registraVisti(pref.leggi(), sezioni));
  const piede = el('footer', 'scheda-piede');
  // visibile solo in stampa, sempre, anche se la nota legale è nascosta dalle preferenze
  const disclaimer = el('p', 'scheda-disclaimer', DISCLAIMER_STAMPA);
  // Schede (tab) per argomento: l'ordine è la gerarchia delle informazioni, dal luogo cliccato ai dati di contesto.
  const SCHEDE = [['luogo', tr('scheda.tab.luogo')], ['storico', tr('scheda.tab.storico')], ['strumenti', tr('scheda.tab.strumenti')], ['mercato', tr('scheda.tab.mercato')], ['popolazione', tr('scheda.tab.popolazione')], ['terreno', tr('scheda.tab.terreno')], ['servizi', tr('scheda.tab.servizi')], ['pnrr', tr('scheda.tab.pnrr')], ['opere', tr('scheda.tab.opere')], ['piano', tr('scheda.tab.piano')], ['rndt', tr('scheda.tab.rndt')]];
  const tabDi = tabScheda;
  const tabs = el('div', 'scheda-tabs');
  const prev = el('button', 'scheda-tabs-freccia', '\u2039');
  const next = el('button', 'scheda-tabs-freccia', '\u203a');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', tr('scheda.scorriSinistra'));
  next.setAttribute('aria-label', tr('scheda.scorriDestra'));
  const indice = el('nav', 'scheda-indice');
  indice.setAttribute('role', 'tablist');
  indice.setAttribute('aria-label', tr('scheda.argomenti'));
  // frecce, Home e Fine passano da una linguetta all'altra (come in ogni tablist)
  indice.addEventListener('keydown', e => {
    const tab = [...indice.querySelectorAll('[role=tab]')];
    const i = tab.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tab.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tab.length) % tab.length;
    tab[j].focus();
    tab[j].click();
  });
  tabs.append(prev, indice, next);
  const frecce = () => {
    const troppo = indice.scrollWidth > indice.clientWidth + 1;
    prev.hidden = next.hidden = !troppo;
    prev.disabled = indice.scrollLeft <= 0;
    next.disabled = indice.scrollLeft + indice.clientWidth >= indice.scrollWidth - 1;
  };
  prev.addEventListener('click', () => indice.scrollBy({ left: -140, behavior: 'smooth' }));
  next.addEventListener('click', () => indice.scrollBy({ left: 140, behavior: 'smooth' }));
  indice.addEventListener('scroll', frecce);
  indice.addEventListener('wheel', e => {
    if (indice.scrollWidth <= indice.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    indice.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  const corpo = el('div', 'scheda-corpo');
  const fissa = el('div', 'scheda-allerta-fissa'); // l'allerta meteo-idro sta sotto le coordinate, fuori dai tab, visibile qualunque sia il tab aperto
  let attiva = tabIniziale ?? new URLSearchParams(location.search).get('tab'); // il tab chiesto da uno strato vince su quello ricordato
  const TITOLI_SUNTO = { mercato: () => tr('scheda.suntoMercato') }; // titolo sopra il riepilogo, dove serve
  let sunti = new Map(); // riepilogo in testa a certe schede: id -> celle { valore, chiave }
  const mostraTab = id => {
    attiva = id;
    aggiornaUrl(lngLat, id);
    for (const sz of corpo.querySelectorAll('.scheda-sez')) sz.hidden = sz.dataset.tab !== id;
    for (const b of indice.children) {
      b.setAttribute('aria-selected', String(b.dataset.tab === id));
      if (b.dataset.tab === id) indice.scrollTo({ left: Math.max(0, b.offsetLeft - 24), behavior: 'smooth' });
    }
    for (const l of piede.querySelectorAll('.scheda-link')) l.hidden = l.dataset.tab !== id;
    piede.hidden = ![...piede.children].some(c => !c.hidden);
    for (const x of corpo.querySelectorAll('.scheda-sunto, .scheda-sunto-titolo')) x.remove();
    const celle = sunti.get(id);
    if (celle) {
      const box = el('div', 'scheda-sunto');
      for (const c of celle) {
        const cella = el('div');
        cella.append(el('b', null, c.valore), el('span', null, tl(c.chiave)));
        box.append(cella);
      }
      corpo.prepend(...(TITOLI_SUNTO[id] ? [el('h3', 'scheda-sunto-titolo', TITOLI_SUNTO[id]()), box] : [box]));
    }
    corpo.scrollTop = 0;
  };
  const aggiorna = () => {
    const visibili = applicaPreferenze(corrente, pref.leggi());
    corpo.replaceChildren(...visibili.sezioni.map(disegnaSezione));
    if (!visibili.sezioni.length) corpo.append(el('p', 'scheda-vuota', tr('scheda.tuttoNascosto')));
    // ogni pulsante di approfondimento resta legato al tab della sua sezione: compare solo lì
    const visti = new Set(); // lo stesso indirizzo (es. più zone OMI) compare una volta sola per tab
    const links = [...corpo.querySelectorAll('.scheda-link')].filter(l => {
      const sz = l.closest('.scheda-sez');
      l.dataset.tab = tabDi(+sz.dataset.peso, sz.dataset.chiave);
      const k = `${l.dataset.tab}|${l.href}`;
      return !visti.has(k) && visti.add(k) || l.remove();
    });
    piede.replaceChildren(...links);
    if (visibili.legale) piede.append(el('p', 'scheda-nota scheda-legale', NOTA_LEGALE));
    piede.hidden = !piede.children.length;
    // riepilogo in testa a Mercato, Popolazione e Terreno: tre valori chiave della prima sezione
    sunti = new Map();
    for (const sez of visibili.sezioni) {
      const id = tabDi(sez.peso, sez.chiave);
      if (!['mercato', 'popolazione', 'terreno'].includes(id) || sunti.has(id)) continue;
      const daAccordion = sez.accordion?.elementi?.filter(x => x.anteprima).slice(0, 3).map(x => ({ valore: x.anteprima, chiave: x.titolo }));
      const celle = daAccordion?.length ? daAccordion
        : sez.gruppi.flatMap(g => g.righe).filter(r => r.valore && r.valore !== MANCANTE && String(r.valore).length <= 10 && !/codice|^id\b|sezione/i.test(r.etichetta))
          .slice(0, 3).map(r => ({ valore: String(r.valore), chiave: r.etichetta }));
      if (celle.length) sunti.set(id, celle);
    }
    for (const sz of corpo.querySelectorAll('.scheda-sez')) sz.dataset.tab = tabDi(+sz.dataset.peso, sz.dataset.chiave);
    // Strumenti urbanistici: l'edificio (duplicato da Luogo) apre il tab, poi catasto, zonizzazione, vincoli del PRG, PAI e incendi
    const edificio = corpo.querySelector('.scheda-sez[data-peso="30"]');
    if (edificio) {
      const copia = edificio.cloneNode(true);
      copia.dataset.tab = 'strumenti';
      corpo.append(copia);
    }
    const ordine = sz => (sz.dataset.peso === '30' ? 0 : sz.dataset.peso === '20' ? 1 : sz.dataset.peso === '40' ? 2 : sz.dataset.peso === '50' ? 3 : String(sz.dataset.chiave).startsWith('pai:') ? 4 : 5);
    const strumenti = [...corpo.querySelectorAll('.scheda-sez')].filter(sz => sz.dataset.tab === 'strumenti').sort((a, b) => ordine(a) - ordine(b));
    corpo.append(...strumenti);
    if (edificio) corpo.prepend(edificio); // anche in Luogo l'edificio è la prima informazione
    corpo.prepend(...corpo.querySelectorAll('.scheda-sez[data-peso="1"]')); // tranne lo strato che il clic ha cercato (peso 1, es. l'area del Piano di emergenza)
    const sezioni = [...corpo.querySelectorAll('.scheda-sez')];
    for (const sz of sezioni) if (sz.dataset.strato) sz.querySelector('.scheda-sez-extra').append(creaInterruttoreStrato(sz.dataset.strato));
    for (const t of corpo.querySelectorAll('.scheda-tipo[data-strato]')) t.querySelector(':scope > summary').append(creaInterruttoreStrato(t.dataset.strato));
    const fisse = sezioni.filter(sz => sz.dataset.chiave === 'allerta-meteo');
    fissa.replaceChildren(...fisse);
    fissa.hidden = !fisse.length;
    for (const sz of fisse) sz.hidden = false;
    sezioni.splice(0, sezioni.length, ...sezioni.filter(sz => !fisse.includes(sz)));
    const presenti = SCHEDE.filter(([id]) => sezioni.some(sz => sz.dataset.tab === id));
    indice.replaceChildren(...presenti.map(([id, nome]) => {
      const b = el('button', null, nome);
      const n = sezioni.filter(sz => sz.dataset.tab === id).length;
      if (n > 1) b.append(el('span', 'scheda-tab-n', String(n)));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.addEventListener('click', () => mostraTab(id));
      return b;
    }));
    const soloUno = presenti.length < 2 && presenti[0]?.[0] !== 'storico'; // lo storico ha sempre la sua linguetta, anche da solo
    tabs.hidden = soloUno;
    if (soloUno) sezioni.forEach(sz => { sz.hidden = false; });
    else mostraTab(presenti.some(([id]) => id === attiva) ? attiva : presenti[0][0]);
    requestAnimationFrame(frecce);
    // il Chat bot riassume la scheda: gli arriva il modello con le sezioni visibili
    document.dispatchEvent(new CustomEvent('scheda:sunto', { detail: { sezioni: visibili.sezioni } }));
  };
  const pannelloPref = creaPannelloPreferenze(pref, aggiorna);
  const personalizza = el('button', 'scheda-personalizza');
  personalizza.type = 'button';
  personalizza.title = tr('scheda.personalizza');
  personalizza.setAttribute('aria-label', tr('scheda.personalizza.aria'));
  personalizza.setAttribute('aria-expanded', 'false');
  personalizza.innerHTML = ICONA_INGRANAGGIO;
  personalizza.addEventListener('click', () => {
    pannelloPref.hidden = !pannelloPref.hidden;
    personalizza.setAttribute('aria-expanded', String(!pannelloPref.hidden));
  });
  const annuncio = el('p', 'solo-lettori', tr('scheda.aperta', { titolo: titoloTesto }));
  annuncio.setAttribute('role', 'status');
  const azioni = el('div', 'scheda-azioni');
  const azione = (classe, titolo, icona, fn) => {
    const b = el('button', 'scheda-azione ' + classe);
    b.type = 'button';
    b.title = titolo;
    b.setAttribute('aria-label', titolo);
    b.innerHTML = icona;
    b.addEventListener('click', () => fn(b));
    return b;
  };
  const copia = azione('scheda-copia', tr('scheda.copia'), ICONA_COPIA, async b => {
    const part = sezioni.find(sz => sz.chiave === 'particella')?.gruppi.flatMap(g => g.righe) ?? [];
    const v = nome => part.find(r => r.etichetta === nome)?.valore;
    const righe = [titoloTesto, `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`];
    if (v('Foglio') && v('Particella')) righe.push(tr('scheda.copia.catasto', { foglio: v('Foglio'), particella: v('Particella') }));
    await copiaTesto(righe.join('\n'));
    b.innerHTML = ICONA_OK;
    b.title = tr('scheda.copiato');
    annuncio.textContent = tr('scheda.copiato.annuncio');
    setTimeout(() => { b.innerHTML = ICONA_COPIA; b.title = tr('scheda.copia'); annuncio.textContent = ''; }, 1600);
  });
  const stampa = azione('scheda-stampa', tr('scheda.stampa'), ICONA_STAMPA, () => document.dispatchEvent(new CustomEvent('scheda:stampa')));
  // Talia racconta il luogo in frasi semplici: il pannello di Talia si apre da app.js
  const talia = azione('scheda-talia', tr('parole.apri'), ICONE_RAIL.chatbot, () => document.dispatchEvent(new CustomEvent('talia:racconta', { detail: { luogo: titoloTesto, blocchi: paroleScheda(corrente.sezioni) } })));
  azioni.append(talia, copia, stampa, personalizza, x);
  const testata = el('header', 'scheda-intestazione');
  const riga = el('div', 'scheda-testata');
  riga.append(titolo, azioni);
  testata.append(riga, el('p', 'scheda-coordinate', `${lngLat.lat.toFixed(5)}° N, ${lngLat.lng.toFixed(5)}° E`), fissa);
  const testo = testoContesto(contesto);
  if (testo) testata.append(el('p', 'scheda-contesto', testo));
  testata.append(pannelloPref, tabs);

  aggiorna();
  // annuncio breve per i lettori di schermo: la scheda intera non è una regione live
  contenitore.replaceChildren(maniglia, testata, corpo, piede, disclaimer, annuncio);
  contenitore.dataset.punto = `${lngLat.lng},${lngLat.lat}`; // per lo stralcio di mappa in stampa
  contenitore.hidden = false;
  const selezionato = indice.querySelector('[aria-selected="true"]'); // a scheda ancora scollegata le linguette non hanno posizione: ora la linguetta attiva si porta in vista
  if (selezionato) indice.scrollLeft = Math.max(0, selezionato.offsetLeft - 24);
  frecce();
  corpo.scrollTop = 0;
  adattaVista(lngLat); // la mappa si centra sul punto nella parte rimasta visibile
  return {
    aggiungi(nuovi) {
      const y = corpo.scrollTop;
      corrente = sezioniConRitardo(corrente, nuovi);
      aggiorna();
      corpo.scrollTop = y; // l'arrivo di una risposta non riporta in cima chi sta leggendo
    },
  };
}

// Il margine segue i pannelli (padding-mappa.js): il centro dello spostamento è il centro della parte visibile.
// `centro` = punto da portare lì; senza, si riallinea solo il margine. Con il cerchio dei vicini (`raggio` in metri) lo zoom lo
// inquadra per intero (barra strumenti in alto, ricerca in basso); senza, si avvicina a ZOOM_SCHEDA se serve.
// Lo zoom c'è solo con Live Zoom acceso: spento, il clic centra il punto e lascia lo zoom com'è.
const MARGINE_CERCHIO = { top: 70, right: 20, bottom: 90, left: 20 };
function adattaVistaMappa(map, centro, raggio) {
  if (!centro) return allineaPadding(map);
  let zoom = liveZoomAttivo() ? Math.max(map.getZoom(), ZOOM_SCHEDA) : map.getZoom();
  if (raggio && liveZoomAttivo()) {
    const tela = map.getContainer();
    const dimensioni = { larghezza: tela.clientWidth, altezza: tela.clientHeight };
    zoom = Math.min(zoomPerCerchio(dimensioni, calcolaPadding(document, tela, matchMedia('(max-width: 720px)').matches), MARGINE_CERCHIO, raggio, centro.lat), 18);
  }
  allineaPadding(map, { center: centro, zoom, duration: 600 });
}

// Prima il punto esatto; per i layer senza risultato, un riquadro di ±R pixel.
// almeno un livello disegnato di uno strato del modulo è visibile
const stratoAcceso = (map, m) => (m.strati ?? []).some(st => (st.layers ?? []).some(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') === 'visible'));

function trovaFeature(map, punto, layers) {
  let trovati = map.queryRenderedFeatures(punto, { layers });
  const mancanti = layers.filter(id => !trovati.some(f => f.layer.id === id));
  if (mancanti.length) {
    const riquadro = [[punto.x - R, punto.y - R], [punto.x + R, punto.y + R]];
    trovati = trovati.concat(map.queryRenderedFeatures(riquadro, { layers: mancanti }));
  }
  return trovati;
}

// ritaglia la mappa visibile attorno al punto cliccato e lo cerchia (il canvas ha la risoluzione del dispositivo)
function stralcioConCerchio(map, punto) {
  const sorgente = map.getCanvas();
  const [lng, lat] = (punto ?? '').split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return sorgente.toDataURL('image/png');
  const k = sorgente.width / sorgente.clientWidth;
  const p = map.project([lng, lat]);
  const px = p.x * k, py = p.y * k;
  const w = sorgente.width, h = Math.min(sorgente.height, Math.round(w / 2));
  const y0 = Math.max(0, Math.min(sorgente.height - h, Math.round(py - h / 2)));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d');
  g.drawImage(sorgente, 0, y0, w, h, 0, 0, w, h);
  const r = h * 0.3, y = py - y0;
  // fuori dalla lente la mappa è attenuata, così il punto risalta
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.beginPath(); g.rect(0, 0, w, h); g.arc(px, y, r, 0, 2 * Math.PI, true); g.fill('evenodd');
  // manico della lente, in basso a destra
  const d = Math.SQRT1_2, m0 = [px + r * d, y + r * d], m1 = [px + r * (1 + 0.75) * d, y + r * (1 + 0.75) * d];
  g.lineCap = 'round';
  for (const [spessore, colore] of [[16 * k, '#fff'], [10 * k, '#d6246e']]) {
    g.lineWidth = spessore; g.strokeStyle = colore;
    g.beginPath(); g.moveTo(...m0); g.lineTo(...m1); g.stroke();
  }
  g.lineWidth = 9 * k; g.strokeStyle = '#fff';
  g.beginPath(); g.arc(px, y, r, 0, 2 * Math.PI); g.stroke();
  g.lineWidth = 5 * k; g.strokeStyle = '#d6246e';
  g.beginPath(); g.arc(px, y, r, 0, 2 * Math.PI); g.stroke();
  g.fillStyle = '#d6246e';
  g.beginPath(); g.arc(px, y, 4 * k, 0, 2 * Math.PI); g.fill();
  return out.toDataURL('image/png');
}

const DISCLAIMER_STAMPA = tr('scheda.disclaimer');

let richiestaLuogo = 0;

export function collegaScheda(map, moduli, contenitore, opzioni = {}) {
  const rndt = opzioni.rndt;
  // stampa: tutte le schede aperte e visibili; dopo, si torna alla scheda attiva
  window.addEventListener('beforeprint', () => {
    for (const sz of contenitore.querySelectorAll('.scheda-sez')) { sz.hidden = false; sz.open = true; }
  });
  window.addEventListener('afterprint', () => {
    contenitore.querySelector('.scheda-stralcio')?.remove();
    contenitore.querySelector('.scheda-indice [aria-selected="true"]')?.click();
  });
  // stralcio della mappa visualizzata: il canvas WebGL si legge solo subito dopo un render
  document.addEventListener('scheda:stampa', () => {
    let fatto = false;
    const stampa = async () => {
      if (fatto) return;
      fatto = true;
      try {
        const img = el('img', 'scheda-stralcio');
        img.alt = tr('scheda.stralcio');
        img.src = stralcioConCerchio(map, contenitore.dataset.punto);
        await img.decode(); // senza, la stampa parte prima che l'immagine sia pronta
        contenitore.querySelector('.scheda-intestazione')?.after(img);
      } catch { /* canvas non leggibile: si stampa senza stralcio */ }
      window.print();
    };
    map.once('render', stampa);
    map.triggerRepaint();
    setTimeout(stampa, 1500);
  });
  // il Chat bot porta alla scheda: tab e, se indicata, sezione (aperta e portata in vista)
  document.addEventListener('scheda:vai', e => {
    const { tab, chiave } = e.detail ?? {};
    contenitore.querySelector(`.scheda-indice [data-tab="${CSS.escape(String(tab))}"]`)?.click();
    const sez = [...contenitore.querySelectorAll('.scheda-sez')].find(x => x.dataset.chiave === chiave && !x.hidden);
    if (!sez) return;
    sez.open = true;
    sez.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  // il Chat bot apre la scheda di un oggetto trovato per nome: strato acceso, mappa sul punto, poi il clic che apre la scheda
  document.addEventListener('scheda:apri-luogo', e => {
    const { lon, lat, strato, zoom } = e.detail ?? {};
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const casella = strato && document.getElementById(`strato-${strato}`);
    if (casella && !casella.checked && !casella.disabled) { casella.checked = true; casella.dispatchEvent(new Event('change')); }
    const lngLat = new maplibregl.LngLat(lon, lat);
    const mio = ++richiestaLuogo; // una richiesta più recente annulla quella in corso
    let fatto = false;
    const clic = () => {
      if (fatto || mio !== richiestaLuogo) return;
      fatto = true;
      map.fire('click', { point: map.project(lngLat), lngLat });
      document.dispatchEvent(new CustomEvent('scheda:mostra')); // il pannello della scheda torna davanti agli altri (Chat bot compreso)
    };
    // il clic parte a mappa ferma e con lo strato disegnato (idle); se la mappa era già lì, moveend può non scattare: c'è un tempo massimo
    const attendi = () => { if (map.isMoving()) map.once('moveend', attendi); else if (map.loaded()) setTimeout(clic, 150); else map.once('idle', () => setTimeout(clic, 150)); };
    map.flyTo({ center: lngLat, zoom: Math.max(zoom ?? 18, ZOOM_SCHEDA), duration: 600 });
    setTimeout(attendi, 700);
    setTimeout(clic, 4000);
  });
  // link condiviso: riapre la scheda nel punto indicato, dopo il primo caricamento dei dati
  const condiviso = new URLSearchParams(location.search).get('scheda');
  if (condiviso) {
    const [lat, lng] = condiviso.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.once('idle', () => setTimeout(() => {
        const lngLat = new maplibregl.LngLat(lng, lat);
        map.fire('click', { point: map.project(lngLat), lngLat });
      }, 800));
    }
  }
  const conScheda = moduli.filter(m => m.scheda);
  // gli strati si accendono anche dal pannello: gli interruttori nella scheda aperta si riallineano
  document.addEventListener('change', e => {
    if (String(e.target.id).startsWith('strato-')) {
      if (!e.target.checked) acceseDaScheda.delete(e.target.id.slice(7)); // spento a mano: non va più spento alla chiusura
      contenitore.querySelectorAll('.scheda-strato').forEach(sincronizzaStrato);
    }
  });
  // le scelte sulle informazioni da mostrare stanno in memoria e, se il browser lo permette, in localStorage
  const archivio = (() => { try { return window.localStorage; } catch { return null; } })();
  let preferenze = leggiPreferenze(archivio);
  const pref = { leggi: () => preferenze, scrivi: p => { preferenze = p; return salvaPreferenze(archivio, p); } };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !contenitore.hidden) contenitore.querySelector('.scheda-x')?.click();
  });
  // cambiando il raggio dei vicini la scheda aperta si rifà sullo stesso punto (senza ripetere il clic a mano)
  let ultimoClic = null;
  let attesaRaggio = null;
  document.addEventListener(EVENTO_RAGGIO, () => {
    clearTimeout(attesaRaggio);
    attesaRaggio = setTimeout(() => { if (ultimoClic && !contenitore.hidden) map.fire('click', { point: map.project(ultimoClic), lngLat: ultimoClic }); }, 120);
  });
  map.on('click', async e => {
    const fuori = false; // la mappa copre tutta l'Italia: nessun confine comunale oltre il quale la scheda non si apre
    const emergenza = inModoEmergenza(); // telefono con il Piano di emergenza: la scheda è solo quella dell'area
    const moduliBase = moduliAlClic(conScheda, emergenza);
    const moduliClic = fuori ? moduliBase.filter(m => m.scheda.apertoFuoriComune?.(map, e)) : moduliBase;
    if (fuori && !moduliClic.length) {
      segnala(tr('scheda.fuoriComune'));
      return;
    }
    ultimoClic = e.lngLat;
    // `mantieniVista` (frecce avanti/indietro di una scheda): la scheda nuova si apre sullo stesso tab e alla stessa altezza di scorrimento di quella che sostituisce
    const vistaPrima = e.mantieniVista && !contenitore.hidden
      ? { tab: contenitore.querySelector('[role=tab][aria-selected="true"]')?.dataset.tab ?? null, sopra: altezzaBarra(contenitore) } : null;
    // i dati degli strati puntuali si scaricano in secondo piano: un clic arrivato prima li attende
    if (window.dt && window.dt.differitiPronti === false) await window.dt.differiti();
    const voci = [];
    const trovatiTutti = [];
    const viciniTutti = []; // punti dei dintorni (`scheda.vicini`): evidenziati ma non cambiano il tab né l'evidenza principale
    let tabIniziale = vistaPrima?.tab ?? null; // lo strato cliccato può chiedere il suo tab; solo per un clic vero (non per il ripristino da un link condiviso)
    // Un oggetto 3D sopra la mappa (es. l'edificio per piani, anche esploso) sta più in alto del terreno: e.lngLat è il punto
    // a terra dietro di lui. Lo strato che lo possiede dice dove sta l'oggetto, e la scheda (luogo, edificio, catasto…) si
    // apre lì; il suo strato si interroga invece al pixel cliccato.
    const sopra = moduliClic.map(m => ({ m, lngLat: m.scheda.puntoAlClic?.(map, e) })).find(x => x.lngLat);
    const lngLat = sopra?.lngLat ?? e.lngLat;
    const punto = sopra ? map.project(lngLat) : e.point;
    for (const m of moduliClic) {
      const layers = m.scheda.layers.filter(id => map.getLayer(id));
      if (!layers.length) continue;
      const esatti = trovaFeature(map, m === sopra?.m ? e.point : punto, layers);
      trovatiTutti.push(...esatti);
      // `scheda.vicini` ({ raggio, max }): il layer mostra anche i suoi punti nei dintorni del clic, a strato acceso o spento
      const vicini = m.scheda.vicini ? featureVicine(map, lngLat, layers, { ...m.scheda.vicini, raggio: raggioVicini() }, esatti) : [];
      viciniTutti.push(...vicini);
      const vociM = m.scheda.voci(esatti.concat(vicini), lngLat);
      // clic vero su un elemento di uno strato acceso: la scheda si apre sul tab dedicato (`scheda.tabAlClic` lo sceglie o lo esclude);
      // gli strati spenti, con i loro livelli trasparenti sempre interrogabili (terreno, edifici…), non rubano il tab
      if (esatti.length && e.originalEvent) tabIniziale ??= (m.scheda.tabAlClic ? m.scheda.tabAlClic(map) : stratoAcceso(map, m) ? tabDedicato(vociM) : null) ?? null;
      voci.push(...vociM);
    }
    // dalla vista «Strati in 3D» il clic dice quali strati ha toccato: la scheda si apre sul tab del primo che ha dati qui
    // (PRG e vincoli: «Strumenti urbanistici»)
    const daStrato = e.strati?.map(id => voci.find(v => v.strato === id)).find(Boolean);
    if (daStrato) tabIniziale = tabScheda(daStrato.peso, daStrato.chiave);
    const interrogabili = rndt && !fuori && !emergenza ? rndt.layerAlPunto(lngLat) : []; // i servizi RNDT valgono per il Comune
    if (interrogabili.length) voci.push(rndt.segnaposto()); // la scheda si apre subito: le risposte dei servizi arrivano dopo
    let raggioCerchio = null; // metri, se il cerchio dei vicini è in mappa
    const adattaVista = centro => adattaVistaMappa(map, centro, raggioCerchio);
    const chiudiScheda = () => { spegniStratiDaScheda(); aggiornaUrl(null); document.dispatchEvent(new CustomEvent('scheda:chiusa')); contenitore.hidden = true; contenitore.classList.remove('scheda-piena'); cancellaEvidenza(map); nascondiCerchio(map); adattaVista(); };
    const dati = unisci(voci);
    if (!dati.sezioni.length) { // clic su un punto vuoto
      chiudiScheda();
      segnala(map.getZoom() < 14 ? tr('scheda.nessunDatoZoom') : tr('scheda.nessunDato'));
      return;
    }
    // I layer RNDT si interrogano subito, come i layer nativi (trovaFeature): scheda e evidenza adattano la vista della mappa
    // (con «riduci animazioni» attivo lo spostamento è immediato), e dopo non si saprebbe più cosa c'era sotto il clic.
    const risposte = interrogabili.length ? rndt.interroga(interrogabili, lngLat, punto, map.getZoom()) : null;
    const extra = [...voci.flatMap(v => v.evidenza ?? []), ...evidenzaVicine(viciniTutti)]; // luoghi vicini che un layer vuole vedere sulla mappa
    const base = soloCliccato(sceltePerLayer(trovatiTutti, lngLat));
    for (const m of conScheda) m.scheda.suEvidenza?.(base); // chi ridisegna l'evidenza dopo il clic (es. percorso di una linea) tiene anche questa
    const scelte = [...base, ...extra];
    // fuori dal Comune (terremoti, aerei, navi…) il cerchio non serve: l'oggetto cliccato è già evidenziato
    if (!fuori && cerchioVisibile() && conScheda.some(m => m.scheda.vicini)) { raggioCerchio = raggioVicini(); mostraCerchio(map, lngLat, raggioCerchio); } // il cerchio dei punti vicini, sotto all'evidenza
    else nascondiCerchio(map);
    evidenzia(map, scelte);
    document.dispatchEvent(new CustomEvent('scheda:evidenzia-gruppo', { detail: null })); // il vincolo scelto nella scheda precedente non vale più
    const scheda = mostra(contenitore, lngLat, dati, chiudiScheda, adattaVista, pref, tabIniziale);
    if (vistaPrima?.sopra != null) rimettiBarra(contenitore, vistaPrima.sopra);
    if (risposte) {
      const punto = contenitore.dataset.punto;
      risposte.then(nuove => {
        if (contenitore.hidden || contenitore.dataset.punto !== punto) return; // la scheda ora è su un altro punto, o chiusa
        scheda.aggiungi(unisci(nuove));
      });
    }
  });
}
