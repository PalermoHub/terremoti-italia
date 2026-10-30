import { svgIcona } from './icone.js';
import { applicaOpacita } from './opacita.js';
import { limitiStrato, zoomMinimoStrato } from './zoom-strato.js';
import { creaPannelloTema } from './pannello-tema.js';
import { ordinaSezioni, leggiAperte, salvaAperta, CHIAVE } from './layer-sezioni.js';
import { ordineStrati } from './riordino.js';
import { raccogliLegende, collegaLegendePannello } from './legenda-pannello.js';
import { abilitaRiordino, creaOrdineDisegno } from './pannello-riordino.js';
export { abilitaRiordino }; // l'API pubblica resta qui: i gruppi RNDT e «I miei layer» la importano da pannello.js
import { ETICHETTE, EVENTO_GRUPPO } from './pannello-comune.js';
import { aggiornaSottogruppi, rendiPieghevoli } from './sottogruppi.js';
import { t } from './i18n.js';
import { EVENTO_SHAKEMAP } from './shakemap-mappa.js';
import { tooltipAttivi, impostaTooltipAttivi } from './tooltip.js';
import { creaInterruttorePannello as interruttoreLiveZoom } from './live-zoom.js';
import { creaRigaColore, STRATI_TERREMOTI } from './tema-magnitudo.js';


const mostrati = new Set();
const DURATA_AVVISO = 8000;

// Avviso non bloccante: ha il pulsante di chiusura e sparisce da solo; lo stesso testo non si impila due volte
// finché è visibile, ma può ricomparire dopo la chiusura.
const errori = new Set();

// Più strati non caricati si riassumono in un solo avviso (la copia non ha tutti i dati locali).
export function segnala(testo) {
  let riassunto = false;
  if (testo.startsWith(t('avviso.stratoNonCaricato'))) {
    errori.add(testo.slice(t('avviso.stratoNonCaricato').length).replace(/^:\s*/, ''));
    riassunto = true;
    document.querySelector('#avvisi [data-errori] button')?.click();
    testo = errori.size === 1 ? t('avviso.stratoNonCaricato.dettaglio', { nome: [...errori][0] }) : t('avviso.stratiNonCaricati', { n: errori.size });
  }
  if (mostrati.has(testo)) return;
  mostrati.add(testo);
  const d = document.createElement('div');
  if (riassunto) d.dataset.errori = '1';
  const etichettaEl = document.createElement('span');
  etichettaEl.textContent = testo;
  const x = document.createElement('button');
  x.type = 'button';
  x.title = t('comune.chiudi');
  x.setAttribute('aria-label', t('avviso.chiudi'));
  x.innerHTML = svgIcona('chiudi', 14);
  const chiudi = () => { clearTimeout(timer); d.remove(); mostrati.delete(testo); };
  const timer = setTimeout(chiudi, DURATA_AVVISO);
  x.addEventListener('click', chiudi);
  d.append(etichettaEl, x);
  document.getElementById('avvisi').append(d);
}

function imposta(map, ids, visibile) {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibile ? 'visible' : 'none');
  }
}


// I soli gruppi che hanno un tab proprio; tutti gli altri sono sezioni del tab «Layer».
const TAB_DIRETTI = new Set(['base', 'rndt', 'miei', 'filtri']);

// Totale degli strati accesi (mostrato sul pulsante «Strati» di mobile)
function aggiornaConteggio() {
  const caselle = [...document.querySelectorAll('#pannello input[type=checkbox][id^="strato-"]:checked')];
  for (const el of document.querySelectorAll('#strati-attivi, .conta-strati')) {
    el.textContent = String(caselle.length);
    if (el.classList.contains('conta-strati')) el.hidden = caselle.length === 0; // il pallino sul tab Strati compare solo con strati accesi
  }
  const tabLayer = document.getElementById('btn-gruppo-layer');
  if (tabLayer) {
    const n = document.querySelectorAll('#gruppo-layer input[type=checkbox][id^="strato-"]:checked').length;
    tabLayer.dataset.attivo = String(n > 0);
    tabLayer.dataset.n = String(n);
  }
  // chip degli strati accesi: si spengono con un clic
  const chip = document.getElementById('strati-chip');
  if (!chip) return;
  const MAX = 4;
  const voci = caselle.slice(0, MAX).map(c => {
    const nome = c.closest('label')?.textContent.replace(/\s+/g, ' ').trim() || c.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'strato-chip';
    b.title = t('pannello.spegniChip', { nome });
    b.setAttribute('aria-label', t('pannello.spegni', { nome }));
    const etichettaEl = document.createElement('span');
    etichettaEl.textContent = nome;
    const x = document.createElement('i');
    x.textContent = '\u00d7';
    x.setAttribute('aria-hidden', 'true');
    b.append(etichettaEl, x);
    b.addEventListener('click', () => { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    return b;
  });
  if (caselle.length > MAX) {
    const altri = document.createElement('span');
    altri.className = 'strato-chip strato-chip--altri';
    altri.textContent = `+${caselle.length - MAX}`;
    voci.push(altri);
  }
  chip.replaceChildren(...voci);
}

function bottoneGruppo(id, titolo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rail-tab';
  b.id = `btn-gruppo-${id}`;
  b.title = titolo;
  b.setAttribute('aria-label', titolo);
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-controls', `gruppo-${id}`);
  b.innerHTML = `${id === 'rndt' ? '<span class="icona-puzzle" aria-hidden="true"></span>' : svgIcona(id === 'base' ? 'mappa' : id) || svgIcona('info')}<span class="et">${ETICHETTE[id] ?? titolo}</span>`;
  return b;
}

// Interruttore a occhio: la casella resta (accessibilità, id, eventi) ma si vede solo l'icona.
export function occhio() {
  const o = document.createElement('span');
  o.className = 'occhio';
  o.setAttribute('aria-hidden', 'true');
  o.innerHTML = '<svg class="on" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>'
    + '<svg class="off" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.7 10.7 0 0 1 12 19C5.5 19 1.5 12 1.5 12a18.5 18.5 0 0 1 4.6-5.4M9.9 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10.5 7 10.5 7a18.6 18.6 0 0 1-2.2 3.2M1 1l22 22"/></svg>';
  return o;
}

// Cursore «Opacità» sotto lo strato: visibile solo a strato acceso (la casella resta l'interruttore on/off).
export function sliderOpacita(map, strato, cb, stato = { originali: new Map(), valore: 1 }) {
  const { originali } = stato;
  const riga = document.createElement('div');
  riga.className = 'strato-opacita';
  const etichettaEl = document.createElement('span');
  etichettaEl.textContent = t('pannello.opacita');
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '0';
  r.max = '1';
  r.step = '0.05';
  r.value = String(stato.valore);
  r.dataset.opacita = strato.id;
  r.setAttribute('aria-label', t('pannello.opacita.di', { nome: strato.etichetta }));
  const v = document.createElement('output');
  v.textContent = stato.valore.toFixed(2);
  r.addEventListener('input', () => {
    stato.valore = Number(r.value);
    v.textContent = stato.valore.toFixed(2);
    applicaOpacita(map, strato.layers, Number(r.value), originali);
  });
  const z = document.createElement('button');
  z.type = 'button';
  z.className = 'strato-zoom';
  z.dataset.zoomStrato = strato.id;
  z.title = z.ariaLabel = t('pannello.zoomSu', { nome: strato.etichetta });
  z.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';
  z.addEventListener('click', async () => {
    const area = map.getMaxBounds()?.toArray(); // area di lavoro: [[o, s], [e, n]]
    const b = await limitiStrato(map, strato.layers, area && [...area[0], ...area[1]]);
    const riquadro = b ? [[b[0], b[1]], [b[2], b[3]]] : area;
    const opzioni = { padding: 60, maxZoom: 17, duration: 600 };
    const minimo = zoomMinimoStrato(map, strato.layers);
    const cam = map.cameraForBounds(riquadro, { padding: opzioni.padding, maxZoom: opzioni.maxZoom });
    // Se l'inquadratura è sotto il minzoom dello strato, lo strato resterebbe invisibile: sale fino al suo zoom minimo.
    if (cam && cam.zoom < minimo) map.easeTo({ center: cam.center, zoom: minimo, duration: opzioni.duration });
    else map.fitBounds(riquadro, opzioni);
  });
  const tema = creaPannelloTema(map, strato, stato);
  if (STRATI_TERREMOTI.includes(strato.id)) {
    let storageColore = null;
    try { storageColore = window.localStorage; } catch { /* storage bloccato: il modo vale per la sessione */ }
    tema.pannello.prepend(creaRigaColore(storageColore));
  }
  riga.append(etichettaEl, r, v, z, tema.bottone, tema.pannello);
  cb.addEventListener('change', tema.aggiorna);
  const mostra = () => { riga.hidden = !cb.checked; };
  cb.addEventListener('change', mostra);
  mostra();
  return riga;
}

// Ogni modulo diventa un sotto-pannello a comparsa sotto la barra degli strumenti; ne sta aperto uno solo.
export function costruisciPannello(map, moduli, contenitore, barra) {
  let storage = null;
  try { storage = window.localStorage; } catch { /* storage bloccato: ordine e sezioni valgono per la sessione */ }
  const aperte = leggiAperte(storage);
  const sezioni = [];
  let layer = null;
  let cercando = ''; // testo del «Cerca strato» di Layer: finché c'è, aprire e chiudere le sezioni non va salvato
  const gruppi = [];
  const STRETTO = 1280; // sotto questa larghezza due pannelli da 380px non stanno insieme
  const chiudiGruppi = () => { for (const g of gruppi) if (!g.el.hidden) { g.el.hidden = true; g.bottone.setAttribute('aria-expanded', 'false'); } };
  const ripiegaDestra = () => {
    if (window.innerWidth >= STRETTO) return;
    document.querySelector('#rail-pannelli .rail-tab.attivo')?.click();
  };
  const nuovoTab = (id, titolo) => {
    const el = document.createElement('section');
    el.id = `gruppo-${id}`;
    el.className = 'sotto-pannello';
    el.hidden = true;
    const h = document.createElement('h2');
    h.textContent = titolo;
    el.append(h);
    const bottone = bottoneGruppo(id, titolo);
    bottone.addEventListener('click', () => {
      const apri = el.hidden;
      chiudiGruppi();
      el.hidden = !apri;
      bottone.setAttribute('aria-expanded', String(apri));
      if (apri) ripiegaDestra();
    });
    gruppi.push({ el, bottone });
    barra.append(bottone);
    contenitore.append(el);
    el.bottone = bottone;
    return el;
  };
  // gruppo ordinario: una sezione ripiegabile dentro il pannello «Layer», creato al primo uso
  const nuovaSezione = (id, titolo, { aperta = false } = {}) => {
    layer ??= nuovoTab('layer', ETICHETTE.layer);
    const el = document.createElement('details');
    el.id = `gruppo-${id}`;
    el.className = 'layer-sezione';
    // una sezione può chiedere di nascere aperta (es. «Territorio»); poi vale la scelta dell'utente, salvata in localStorage
    el.open = aperte.includes(id) || (aperta && storage?.getItem(CHIAVE) == null);
    const sommario = document.createElement('summary');
    const h = document.createElement('h2');
    h.textContent = ETICHETTE[id] ?? titolo;
    sommario.append(h);
    el.append(sommario);
    el.bottone = sommario; // `segna` ci scrive pallino e conteggio, come sul tab di un gruppo
    el.addEventListener('toggle', () => { if (!cercando) salvaAperta(storage, id, el.open); });
    sezioni.push(el);
    layer.append(el);
    return el;
  };
  const aggiungi = (id, titolo, modulo = null) => (TAB_DIRETTI.has(id) ? nuovoTab(id, titolo) : nuovaSezione(id, titolo, { aperta: Boolean(modulo?.sezioneAperta) }));

  // in un gruppo condiviso ogni modulo ha il suo titolo, anche quello che ospita gli altri: gli strati si possono spostare
  const perGruppo = new Map();
  for (const m of moduli) perGruppo.set(m.gruppo ?? m.id, (perGruppo.get(m.gruppo ?? m.id) ?? 0) + 1);
  for (const m of moduli) {
    // un modulo con `gruppo` mette i suoi strati in un gruppo già esistente (che deve precederlo in MODULI)
    const gruppo = (m.gruppo && document.getElementById(`gruppo-${m.gruppo}`)) || aggiungi(m.id, m.titolo, m);
    // `sezione`: titolo sopra gli strati di un modulo che condivide il gruppo con altri;
    // `senzaIntestazione`: il modulo ci rinuncia, così nel gruppo restano solo i nomi degli strati
    const titolo = m.senzaIntestazione ? null : m.sezione ?? (perGruppo.get(m.gruppo ?? m.id) > 1 && m.strati.length ? m.argomento?.titolo ?? m.titolo : null);
    if (titolo) {
      const h = document.createElement('h3');
      h.className = 'gruppo-sezione';
      h.textContent = titolo;
      if (m.sezioniFisse) h.dataset.fissa = '';
      gruppo.append(h);
    }
    let sezioneStrato = null;
    let sottosezioneStrato = null;
    for (const s of m.strati) {
      // `sezione` su uno strato: sottotitolo che raggruppa gli strati consecutivi (es. Geomorfologia / Idraulica nel PAI)
      if (s.sezione && s.sezione !== sezioneStrato) {
        sezioneStrato = s.sezione;
        const h = document.createElement('h3');
        h.className = 'gruppo-sezione';
        h.textContent = s.sezione;
        if (m.sezioniFisse) h.dataset.fissa = ''; // titolo che non viaggia con gli strati: il riordino resta dentro la sezione
        gruppo.append(h);
        if (s.nota) { // nota sotto il titolo: non è uno strato, il riordino la lascia dov'è
          const n = document.createElement('p');
          n.className = 'base-suggerimento gruppo-nota';
          n.textContent = s.nota;
          gruppo.append(n);
        }
      }
      // `sottosezione` su uno strato: titolo di secondo livello dentro la sezione (es. Colonnine di ricarica in Servizi su strada); non si ripiega da solo
      if (s.sottosezione && s.sottosezione !== sottosezioneStrato) {
        sottosezioneStrato = s.sottosezione;
        const h = document.createElement('h4');
        h.className = 'gruppo-sottosezione';
        h.textContent = s.sottosezione;
        gruppo.append(h);
      }
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `strato-${s.id}`;
      cb.checked = s.attivo;
      cb.addEventListener('change', () => {
        imposta(map, s.layers, cb.checked);
        if (s.suCambio) s.suCambio(cb.checked, map);
      });
      label.className = 'strato';
      label.append(cb, occhio(), ' ', s.etichetta);
      gruppo.append(label, sliderOpacita(map, s, cb));
    }
    if (m.pannello) m.pannello(gruppo, map);
    // pallino verde sull'icona se nel gruppo c'è almeno uno strato acceso
    const segna = (conta = true) => {
      const caselle = [...gruppo.querySelectorAll('input[type=checkbox][id^="strato-"]')];
      if (caselle.length) {
        const n = caselle.filter(c => c.checked).length;
        gruppo.bottone.dataset.attivo = String(n > 0);
        gruppo.bottone.dataset.n = String(n);
      }
      if (conta === true) aggiornaConteggio(); // in costruzione basta il conteggio finale (sotto)
    };
    gruppo.addEventListener('change', () => segna());
    segna(false);
  }
  // i filtri della ricerca (zona, trasporto, incidenti, catasto) vivono in un tab proprio, non in un popup sulla mappa
  const filtri = document.getElementById('pannello-filtri');
  if (filtri) {
    nuovoTab('filtri', ETICHETTE.filtri).append(filtri);
    filtri.hidden = false;
  }
  // sezioni in ordine: prima quelle con un `ordine` dichiarato (Terremoti, Faglie, Protezione Civile, Territorio),
  // poi le altre in ordine alfabetico (anche per i gruppi che arriveranno)
  if (layer) {
    const ordine = new Map(moduli.map(m => [m.id, m.ordine]));
    layer.append(...ordinaSezioni(sezioni.map(el => ({ id: el.id, titolo: el.querySelector('h2').textContent, ordine: ordine.get(el.id.replace('gruppo-', '')) }))).map(id => document.getElementById(id)));
  }
  const contenitori = [...gruppi.map(g => g.el).filter(el => el !== layer), ...sezioni];
  // albero ripiegabile e strati riordinabili: ogni gruppo porta subito la mappa nell'ordine dell'elenco (in alto = sopra),
  // poi l'ordine di disegno globale parte da lì
  const layersDi = new Map(moduli.flatMap(m => m.strati.map(s => [s.id, s.layers])));
  for (const el of contenitori) abilitaRiordino(map, el, layersDi, storage);
  const inizialeDisegno = ordineStrati(map.getStyle().layers.map(l => l.id), moduli.flatMap(m => m.strati));
  // i titoli dei sottogruppi (es. «Immobili comunali», «PEBA» in Territorio) si aprono e si chiudono; dopo un riordino si riapplicano
  for (const el of contenitori) rendiPieghevoli(el);
  document.addEventListener(EVENTO_GRUPPO, () => contenitori.forEach(el => aggiornaSottogruppi(el, { ignora: !!cercando, riapri: true })));
  // ordine di disegno globale: un elenco unico degli strati accesi, sotto «Cerca strato»
  const disegno = layer ? creaOrdineDisegno(map, moduli, storage, inizialeDisegno) : null;
  disegno?.ripristinaSalvato();
  // un solo «Cerca strato» in cima a Layer: filtra gli strati di tutte le sezioni, apre quelle con risultati e nasconde le altre
  if (layer) {
    const campo = document.createElement('input');
    campo.type = 'search';
    campo.className = 'strato-cerca';
    campo.placeholder = t('pannello.cerca.placeholder');
    campo.setAttribute('aria-label', t('pannello.cerca'));
    campo.addEventListener('input', () => {
      cercando = campo.value.trim().toLowerCase();
      for (const el of sezioni) {
        let trovati = 0;
        for (const v of el.querySelectorAll(':scope > label.strato')) {
          const nascosta = !!cercando && !v.textContent.toLowerCase().includes(cercando);
          v.hidden = nascosta;
          if (!nascosta) trovati++;
          const o = v.nextElementSibling;
          if (o?.classList.contains('strato-opacita')) o.classList.toggle('filtrata', nascosta);
        }
        el.hidden = !!cercando && !trovati;
        aggiornaSottogruppi(el, { ignora: !!cercando }); // durante la ricerca i sottogruppi chiusi non nascondono i risultati
        el.open = cercando ? trovati > 0 : leggiAperte(storage).includes(el.id.replace('gruppo-', ''));
      }
    });
    layer.querySelector(':scope > h2').after(campo);
    // legende sotto lo strato (come nei GIS), con l'interruttore per tenerle sulla mappa
    const contenitoreLegende = document.getElementById('legende');
    const legendeUi = contenitoreLegende ? collegaLegendePannello({ legende: raccogliLegende(moduli), contenitore: contenitoreLegende, layer, occhio, storage }) : null;
    // interruttore dei tooltip sulla mappa (acceso di default), prima dell'ordine dei layer
    const interruttore = document.createElement('label');
    interruttore.classList.add('strato', 'interruttore-tip');
    const cbTip = document.createElement('input');
    cbTip.type = 'checkbox';
    cbTip.id = 'interruttore-tooltip';
    cbTip.dataset.filtro = 'tooltip'; // non è uno strato: non va nei conteggi degli strati accesi
    cbTip.checked = tooltipAttivi();
    cbTip.addEventListener('change', () => impostaTooltipAttivi(cbTip.checked));
    interruttore.append(cbTip, occhio(), ' ', t('tooltip.interruttore'));
    // i due interruttori stanno in un unico menu a tendina, aperto di default
    const opzioni = document.createElement('details');
    opzioni.id = 'opzioni-overlay';
    opzioni.open = true;
    opzioni.className = 'layer-sezione opzioni-overlay';
    const sommarioOpz = document.createElement('summary');
    const titoloOpz = document.createElement('h2');
    titoloOpz.textContent = t('pannello.overlay.titolo');
    sommarioOpz.append(titoloOpz);
    opzioni.append(sommarioOpz, interruttore, ...(legendeUi ? [legendeUi.interruttore] : []), creaRigaColore(storage), interruttoreLiveZoom(occhio, storage));
    campo.after(opzioni, disegno.el);
    campo.addEventListener('input', () => { disegno.el.hidden = !!cercando; opzioni.hidden = !!cercando; });
    contenitore.addEventListener('change', e => { if (e.target.matches?.('label.strato input[type=checkbox]')) { if (disegno.el.open) disegno.ridisegna(); else disegno.aggiornaTestata(); } });
  }
  aggiornaConteggio();
  // Esc ripiega il gruppo aperto; il clic sulla mappa no (come i pannelli di destra)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiGruppi(); });
  // sotto STRETTO, quando a destra si apre un pannello si ripiega il gruppo a sinistra
  new MutationObserver(() => {
    if (window.innerWidth >= STRETTO) return;
    const aperto = ['scheda', 'rndt-pannello', 'geoimage-pannello', 'tema-ui-pannello', 'chatbot-pannello', 'storico-pannello', 'confronto-pannello'].some(id => { const p = document.getElementById(id); return p && !p.hidden && !p.classList.contains('collassato'); });
    if (aperto) chiudiGruppi();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
}

// Disattiva uno strato il cui dato non si è caricato: nascosto, casella spenta e non cliccabile.
export function disattivaStrato(map, strato) {
  imposta(map, strato.layers, false);
  const casella = document.getElementById(`strato-${strato.id}`);
  if (!casella) return;
  casella.checked = false;
  casella.disabled = true;
  casella.title = t('pannello.dato.nd');
  aggiornaConteggio();
}

// «Reset» accanto alla ricerca: spegne tutti gli strati del pannello tranne quelli indicati (id dei moduli),
// lasciando acceso «Terremoti in tempo reale»; spegne anche i contorni ShakeMap. Ogni casella passa dal suo `change`, come un clic dell'utente.
export function spegniStratiTranne(ids = ['terremoti']) {
  const restano = new Set(ids.map(id => `strato-${id}`));
  for (const casella of document.querySelectorAll('#pannello input[type=checkbox][id^="strato-"]')) {
    const accesa = restano.has(casella.id);
    if (casella.checked === accesa) continue;
    casella.checked = accesa;
    casella.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.dispatchEvent(new CustomEvent(EVENTO_SHAKEMAP, { detail: { prodotto: null } }));
}
