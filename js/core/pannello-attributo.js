// Sezione «Colora per attributo» del pannello Colori: sceglie un campo letto dalle feature visibili e lo colora
// per categorie o in classi numeriche. Il risultato ({campo, tipo, ...}) lo salva e applica pannello-tema.js.
import { rilevaAttributi, calcolaSoglie, etichetteClassi, coloriRampa, RAMPE, GRUPPI_RAMPE, TAVOLOZZA } from './tema-attributo.js';
import { comeEsadecimale } from './tema.js';
import { nomeCampo, nomeValore, coloreValore, unitaCampo } from './etichette-campi.js';
import { t as tr, tl } from './i18n.js';

function selezione(testo, nome, opzioni) {
  const riga = document.createElement('label');
  riga.className = 'tema-riga';
  const t = document.createElement('span');
  t.textContent = testo;
  const s = document.createElement('select');
  s.dataset.attributo = nome;
  for (const [valore, etichetta] of opzioni) s.append(new Option(etichetta, valore));
  riga.append(t, s);
  return { riga, select: s };
}

// `leggi()` dà l'attributo corrente (o null), `cambia(attributo|null)` lo registra e ridisegna; `layers()` gli id dei layer da interrogare.
export function creaSezioneAttributo({ map, layers, leggi, cambia }) {
  const el = document.createElement('div');
  el.className = 'tema-attributo';
  const titolo = document.createElement('strong');
  titolo.textContent = tr('attributo.titolo');
  const campo = selezione(tr('attributo.campo'), 'campo', [['', tr('attributo.nessuno')]]);
  const modo = selezione(tr('attributo.tipo'), 'tipo', [['categorie', tr('attributo.categorie')], ['graduata', tr('attributo.graduata')]]);
  const classi = selezione(tr('attributo.classi'), 'classi', Array.from({ length: 7 }, (_, i) => [String(i + 3), String(i + 3)]));
  const metodo = selezione(tr('attributo.metodo'), 'metodo', [['quantili', tr('attributo.quantili')], ['intervalli', tr('attributo.intervalli')]]);
  const rampa = selezione(tr('attributo.rampa'), 'rampa', []);
  rampa.select.append(...GRUPPI_RAMPE.flatMap(([, rampe]) => rampe).map(n => new Option(tl(n), n)));
  rampa.select.value = 'Blu'; // i18n-ok: chiave della rampa di colori
  const inverti = document.createElement('label');
  inverti.className = 'rampa-inverti';
  const invertiCasella = document.createElement('input');
  invertiCasella.type = 'checkbox';
  invertiCasella.dataset.ruolo = 'inverti';
  inverti.append(invertiCasella, tr('attributo.inverti'));
  // Il <select> nativo non può mostrare i colori: resta nascosto come sede del valore e al suo posto c'è un elenco
  // con la barra di colori accanto a ogni nome (stesso valore, stesso evento `change`).
  const sfumatura = nome => `linear-gradient(to right, ${RAMPE[nome].join(', ')})`;
  rampa.select.hidden = true;
  const scelta = document.createElement('button');
  scelta.type = 'button';
  scelta.className = 'rampa-scelta';
  scelta.setAttribute('aria-haspopup', 'listbox');
  scelta.setAttribute('aria-expanded', 'false');
  const elenco = document.createElement('div');
  elenco.className = 'rampa-elenco';
  elenco.setAttribute('role', 'listbox');
  elenco.hidden = true;
  const voceRampa = (nome, ruolo = 'option') => {
    const v = document.createElement(ruolo === 'option' ? 'button' : 'span');
    if (ruolo === 'option') { v.type = 'button'; v.setAttribute('role', 'option'); v.dataset.rampa = nome; }
    const t = document.createElement('span');
    t.textContent = tl(nome);
    const barra = document.createElement('i');
    barra.style.background = sfumatura(nome);
    v.append(t, barra);
    return v;
  };
  for (const [gruppo, rampe] of GRUPPI_RAMPE) {
    const g = document.createElement('strong');
    g.textContent = gruppo;
    elenco.append(g, ...rampe.map(n => voceRampa(n)));
  }
  const chiudi = () => { elenco.hidden = true; scelta.setAttribute('aria-expanded', 'false'); };
  const disegnaAnteprima = () => {
    scelta.replaceChildren(...voceRampa(rampa.select.value, 'testo').childNodes);
    for (const o of elenco.querySelectorAll('[role=option]')) o.setAttribute('aria-selected', String(o.dataset.rampa === rampa.select.value));
  };
  scelta.addEventListener('click', () => {
    elenco.hidden = !elenco.hidden;
    scelta.setAttribute('aria-expanded', String(!elenco.hidden));
    if (!elenco.hidden) elenco.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  });
  elenco.addEventListener('click', e => {
    const o = e.target.closest('[role=option]');
    if (!o) return;
    rampa.select.value = o.dataset.rampa;
    rampa.select.dispatchEvent(new Event('change'));
    chiudi();
    scelta.focus();
  });
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !elenco.hidden) { chiudi(); scelta.focus(); } });
  document.addEventListener('click', e => { if (!rampa.riga.contains(e.target)) chiudi(); });
  rampa.riga.append(scelta, elenco);
  rampa.riga.classList.add('rampa-riga');
  classi.select.value = '5';
  const aggiorna = document.createElement('button');
  aggiorna.type = 'button';
  aggiorna.className = 'strato-strumento';
  aggiorna.dataset.azione = 'attributo-rileva';
  aggiorna.textContent = tr('attributo.rileva');
  const voci = document.createElement('div');
  voci.className = 'tema-categorie';
  const msg = document.createElement('p');
  msg.className = 'tema-msg';
  msg.setAttribute('role', 'status');
  el.append(titolo, campo.riga, modo.riga, classi.riga, metodo.riga, rampa.riga, inverti, aggiorna, voci, msg);

  let campi = new Map(); // campo → { valori, numeri, numerico } letto dalle feature in vista
  let ultimo = ''; // attributo mostrato nella lista, per non ricostruirla a ogni modifica
  const attivo = () => campo.select.value;

  const rileva = () => {
    const ids = layers().filter(id => map.getLayer(id));
    let feature = [];
    try { feature = ids.length ? map.queryRenderedFeatures({ layers: ids }) : []; } catch { feature = []; }
    campi = rilevaAttributi(feature);
    const corrente = leggi()?.campo ?? attivo();
    const nomi = new Set([...campi.keys(), ...(corrente ? [corrente] : [])]);
    campo.select.replaceChildren(new Option(tr('attributo.nessuno'), ''), ...[...nomi].sort((a, b) => a.localeCompare(b)).map(n => new Option(nomeCampo(tl(n)), n)));
    campo.select.value = corrente && nomi.has(corrente) ? corrente : '';
    msg.textContent = campi.size ? '' : tr('attributo.nessunaFeature');
  };

  const mostraLista = a => {
    ultimo = JSON.stringify(a);
    voci.replaceChildren();
    voci.hidden = !a;
    if (!a) return;
    if (a.tipo === 'categorie') {
      for (const [valore, colore] of Object.entries(a.colori)) {
        const riga = document.createElement('label');
        riga.className = 'tema-riga';
        const t = document.createElement('span');
        t.textContent = nomeValore(a.campo, valore);
        const i = document.createElement('input');
        i.type = 'color';
        i.value = comeEsadecimale(colore);
        i.dataset.valore = valore;
        i.addEventListener('input', () => {
          const nuovo = { ...a, colori: { ...a.colori, [valore]: i.value } };
          a = nuovo;
          ultimo = JSON.stringify(nuovo);
          cambia(nuovo);
        });
        riga.append(t, i);
        voci.append(riga);
      }
      return;
    }
    const colori = coloriRampa(a.rampa, a.soglie.length + 1, a.inverti);
    etichetteClassi(a.soglie, unitaCampo(a.campo)).forEach((et, i) => {
      const riga = document.createElement('div');
      riga.className = 'tema-riga tema-classe';
      const t = document.createElement('span');
      t.textContent = et;
      const s = document.createElement('span');
      s.className = 'tema-campione';
      s.style.background = colori[i];
      riga.append(t, s);
      voci.append(riga);
    });
  };

  // costruisce l'attributo dai controlli e lo registra
  const ricalcola = () => {
    const nome = attivo();
    const info = campi.get(nome);
    const prec = leggi();
    modo.select.querySelector('option[value=graduata]').disabled = !(info?.numerico);
    if (!nome) { msg.textContent = ''; cambia(null); return; }
    if (modo.select.value === 'graduata' && !info?.numerico) modo.select.value = 'categorie';
    let nuovo = null;
    if (modo.select.value === 'graduata') {
      const soglie = calcolaSoglie(info.numeri, Number(classi.select.value), metodo.select.value);
      if (soglie.length) nuovo = { campo: nome, tipo: 'graduata', rampa: rampa.select.value, ...(invertiCasella.checked && { inverti: true }), soglie };
      else msg.textContent = tr('attributo.simili');
    } else {
      const valori = [...(info?.valori ?? [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const vecchi = prec?.campo === nome && prec.tipo === 'categorie' ? prec.colori : {};
      const tutti = [...new Set([...Object.keys(vecchi), ...valori])];
      if (tutti.length > 200) msg.textContent = tr('attributo.troppi');
      else if (tutti.length) {
        nuovo = { campo: nome, tipo: 'categorie', colori: Object.fromEntries(tutti.map((v, i) => [v, vecchi[v] ?? coloreValore(nome, v) ?? TAVOLOZZA[i % TAVOLOZZA.length]])) };
      } else msg.textContent = tr('attributo.nessunValore');
    }
    if (nuovo) msg.textContent = '';
    cambia(nuovo);
  };

  campo.select.addEventListener('change', ricalcola);
  for (const s of [modo, classi, metodo, rampa]) s.select.addEventListener('change', ricalcola);
  invertiCasella.addEventListener('change', ricalcola);
  aggiorna.addEventListener('click', () => { rileva(); if (attivo()) ricalcola(); });

  // allinea i controlli al tema (caricamento, import, ripristino, o la modifica appena fatta)
  const sincronizza = () => {
    const a = leggi();
    if (JSON.stringify(a) !== ultimo) {
      if (!campi.size) rileva();
      if (!a) campo.select.value = '';
      else {
        if (![...campo.select.options].some(o => o.value === a.campo)) campo.select.append(new Option(a.campo, a.campo));
        campo.select.value = a.campo;
        modo.select.value = a.tipo;
        if (a.tipo === 'graduata') {
          rampa.select.value = a.rampa;
          invertiCasella.checked = a.inverti === true;
          const n = String(a.soglie.length + 1);
          if ([...classi.select.options].some(o => o.value === n)) classi.select.value = n;
        }
      }
      mostraLista(a);
    }
    classi.riga.hidden = metodo.riga.hidden = rampa.riga.hidden = inverti.hidden = modo.select.value !== 'graduata';
    disegnaAnteprima();
  };

  rileva();
  sincronizza();
  return { el, sincronizza, rileva };
}
