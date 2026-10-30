import { t, tn, localeIntl } from './i18n.js';
import { svgIcona } from './icone.js';
import { caricaTerritorio } from './territorio-eventi.js';

// Tabella dei dati: cassetto in basso con le righe degli strati accesi, la selezione di righe e colonne
// e l'esportazione in CSV e JSON. La posizione orizzontale è affidata al CSS: #tabella-dati sta tra
// --sx (barra/pannello di sinistra) e --scheda-l (scheda e rail di destra), così segue i due pannelli.
// EVENTO_TABELLA: i moduli dei dati lo emettono quando cambiano righe o filtri, e la tabella si ridisegna.
export const EVENTO_TABELLA = 'tabella:aggiorna';
export const MAX_RIGHE = 500;

const CHIAVE_ALTEZZA = 'dt-tabella-altezza';
const ALTEZZA_INIZIALE = 360;
const ALTEZZA_MINIMA = 160;
const LARGHEZZA_MENU = 250;

const ICONA_SCARICA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
const ICONA_COLONNE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4 5h16v14H4V5zm2 2v2h5V7H6zm7 0v2h5V7h-5zM6 11v6h5v-6H6zm7 0v6h5v-6h-5z"/></svg>';

const el = (tag, classe, testo) => {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (testo != null) n.textContent = testo;
  return n;
};

const bottone = (classe, html, etichetta) => {
  const b = el('button', classe);
  b.type = 'button';
  if (html) b.innerHTML = html;
  if (etichetta) b.setAttribute('aria-label', etichetta);
  return b;
};

const valore = (colonna, riga) => {
  try {
    return colonna.valore ? colonna.valore(riga) : null;
  } catch {
    return null;
  }
};

const testo = (colonna, riga) => {
  try {
    const v = colonna.testo ? colonna.testo(riga) : valore(colonna, riga);
    return v == null ? '' : String(v);
  } catch {
    return '';
  }
};

// `display` serve alla tabella (trattino per i dati mancanti); `testo` resta per CSV e filtro.
const mostra = (colonna, riga) => {
  try {
    const v = colonna.display ? colonna.display(riga) : testo(colonna, riga);
    return v == null ? '' : String(v);
  } catch {
    return '';
  }
};

const chiaveRiga = riga => {
  const k = riga?.id ?? riga?.chiave ?? [riga?.ts, riga?.lat, riga?.lon].filter(v => v != null).join('|');
  return k == null || k === '' ? JSON.stringify(riga) : String(k);
};

const etichettaDi = f => (typeof f.etichetta === 'function' ? f.etichetta() : f.etichetta) || '';
const fonteDi = f => (typeof f.fonte === 'function' ? f.fonte() : f.fonte) || '';
const licenzaDi = f => (typeof f.licenza === 'function' ? f.licenza() : f.licenza) || '';

// Le colonne sono descrittori del fornitore: id stabile, etichetta, valore per ordinare e per il JSON,
// testo per la tabella e il CSV. visibile/esporta sono le scelte iniziali.
function statoProvider(stato, f) {
  let s = stato.get(f.id);
  if (s) return s;
  const colonne = f.colonne();
  const visibili = new Set(colonne.filter(c => c.visibile !== false).map(c => c.id));
  s = {
    filtro: '',
    selezione: new Set(),
    visibili,
    esporta: new Set(colonne.filter(c => c.esporta !== false && visibili.has(c.id)).map(c => c.id)),
    ordine: colonne.map(c => c.id),
    colonne,
    sort: f.ordina ? { ...f.ordina } : null,
    filtrate: [],
    mostrate: [],
    corrente: null,
  };
  stato.set(f.id, s);
  return s;
}

function sincronizzaColonne(f, s) {
  const colonne = f.colonne();
  const ids = new Set(colonne.map(c => c.id));
  s.ordine = s.ordine.filter(id => ids.has(id));
  for (const id of [...s.visibili]) if (!ids.has(id)) s.visibili.delete(id);
  for (const id of [...s.esporta]) if (!ids.has(id)) s.esporta.delete(id);
  for (const c of colonne) {
    if (!s.ordine.includes(c.id)) {
      s.ordine.push(c.id);
      if (c.visibile !== false) s.visibili.add(c.id);
      if (c.visibile !== false) s.esporta.add(c.id);
    }
  }
  s.colonne = colonne;
}

function colonneOrdinate(s) {
  const perId = new Map(s.colonne.map(c => [c.id, c]));
  return s.ordine.map(id => perId.get(id)).filter(Boolean);
}

function ordinaRighe(righe, colonna, direzione) {
  const segno = direzione === 'desc' ? -1 : 1;
  return righe.sort((a, b) => {
    const va = valore(colonna, a);
    const vb = valore(colonna, b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
    return r * segno;
  });
}

function righeDi(f) {
  try {
    return (f.righe() ?? []).filter(Boolean);
  } catch {
    return [];
  }
}

// Virgola decimale italiana e punto e virgola come separatore: il CSV si apre bene in Excel in entrambe le lingue.
const separatoreCsv = () => (localeIntl() === 'it-IT' ? ';' : ',');

function cellaCsv(v, separatore = ',') {
  const s = v == null ? '' : String(v);
  const speciale = separatore === ';' ? /[;"\r\n]/ : /[",\r\n]/;
  return speciale.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function nomeFile(f, estensione) {
  const base = etichettaDi(f).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tabella';
  return `${base}-${new Date().toISOString().slice(0, 10)}.${estensione}`;
}

function scarica(contenuto, nome, tipo) {
  const blob = new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function collegaTabellaDati({ bottone: comando, fornitori = [] } = {}) {
  if (!comando) return null;
  fornitori = fornitori.filter(f => f && typeof f.righe === 'function' && typeof f.colonne === 'function');
  if (!fornitori.length) return null;

  const stato = new Map();
  const statoDi = f => statoProvider(stato, f);
  const radice = el('section');
  radice.id = 'tabella-dati';
  radice.hidden = true;
  radice.tabIndex = -1;
  radice.setAttribute('role', 'region');
  radice.setAttribute('aria-label', t('tabella.titolo'));

  const maniglia = bottone('tabella-maniglia', '', t('tabella.maniglia'));
  maniglia.setAttribute('aria-label', t('tabella.maniglia'));

  const testata = el('div', 'tabella-testata');
  const titolo = el('strong', 'tabella-titolo', t('tabella.titolo'));
  const conta = el('span', 'tabella-conta');
  conta.setAttribute('aria-live', 'polite');
  const bottoneChiudi = bottone('tabella-chiudi', svgIcona('chiudi', 16), t('tabella.chiudi'));
  testata.append(titolo, conta, bottoneChiudi);

  const schede = el('div', 'tabella-schede');
  schede.hidden = true;
  schede.setAttribute('role', 'tablist');
  schede.setAttribute('aria-label', t('tabella.titolo'));

  const barra = el('div', 'tabella-barra');
  const filtro = el('input', 'tabella-filtro');
  filtro.type = 'search';
  filtro.autocomplete = 'off';
  filtro.spellcheck = false;
  filtro.placeholder = t('tabella.filtro.placeholder');
  filtro.setAttribute('aria-label', t('tabella.filtro'));

  const azioni = el('div', 'tabella-azioni-righe');
  const inverti = bottone('tabella-azione', '', t('tabella.inverti'));
  inverti.textContent = t('tabella.inverti');
  const svuota = bottone('tabella-azione', '', t('tabella.svuota'));
  svuota.textContent = t('tabella.svuota');
  azioni.append(inverti, svuota);

  const gruppoColonne = el('div', 'tabella-colonne');
  const bottoneColonne = bottone('tabella-strumento', `${ICONA_COLONNE}<span>${t('tabella.colonne')}</span>`, t('tabella.colonne'));
  bottoneColonne.setAttribute('aria-expanded', 'false');
  bottoneColonne.setAttribute('aria-controls', 'tabella-colonne-elenco');
  const elencoColonne = el('div', 'tabella-colonne-elenco');
  elencoColonne.id = 'tabella-colonne-elenco';
  elencoColonne.hidden = true;
  elencoColonne.setAttribute('role', 'group');
  elencoColonne.setAttribute('aria-label', t('tabella.colonne'));
  gruppoColonne.append(bottoneColonne, elencoColonne);

  const esporti = el('div', 'tabella-esporti');
  const esportaCsv = bottone('tabella-esporta', `${ICONA_SCARICA}<span class="tabella-esporta-nome">${t('tabella.csv')}</span><span class="tabella-esporta-n">0 × 0</span>`);
  esportaCsv.dataset.formato = 'csv';
  const esportaJson = bottone('tabella-esporta', `${ICONA_SCARICA}<span class="tabella-esporta-nome">${t('tabella.json')}</span><span class="tabella-esporta-n">0 × 0</span>`);
  esportaJson.dataset.formato = 'json';
  esporti.append(esportaCsv, esportaJson);

  barra.append(filtro, azioni, gruppoColonne, esporti);

  const nota = el('p', 'tabella-nota');
  const corpo = el('div', 'tabella-corpo');
  corpo.id = 'tabella-corpo';
  corpo.setAttribute('role', 'tabpanel');
  corpo.setAttribute('aria-label', t('tabella.titolo'));

  radice.append(maniglia, testata, schede, barra, nota, corpo);
  document.body.append(radice);

  let corrente = null;
  let menuDi = null;
  let attesa = 0;

  const attivi = () => fornitori.filter(f => {
    try {
      return f.attivo ? Boolean(f.attivo()) : true;
    } catch {
      return false;
    }
  });

  const fCorrente = () => fornitori.find(f => f.id === corrente) ?? null;

  function messaggioVuoto(testoMessaggio) {
    corpo.replaceChildren(el('p', 'tabella-vuota', testoMessaggio));
  }

  function candidati(s) {
    return s.selezione.size ? s.filtrate.filter(r => s.selezione.has(chiaveRiga(r))) : s.filtrate;
  }

  function colonneEsporta(s) {
    return colonneOrdinate(s).filter(c => s.esporta.has(c.id));
  }

  function aggiornaBarra(f, s) {
    const nRighe = s.filtrate.length;
    const selezionate = s.filtrate.filter(r => s.selezione.has(chiaveRiga(r))).length;
    conta.textContent = nRighe ? `${tn('tabella.righe', nRighe)} · ${tn('tabella.selezionate', selezionate)}` : '';
    inverti.disabled = s.selezione.size === 0;
    svuota.disabled = s.selezione.size === 0;
    const colonne = colonneEsporta(s);
    const righe = candidati(s);
    for (const b of [esportaCsv, esportaJson]) {
      const formato = b.dataset.formato === 'csv' ? t('tabella.csv') : t('tabella.json');
      const etichetta = t('tabella.esporta', { formato, righe: righe.length, colonne: colonne.length });
      b.setAttribute('aria-label', etichetta);
      b.title = etichetta;
      b.querySelector('.tabella-esporta-n').textContent = `${righe.length} × ${colonne.length}`;
      b.disabled = righe.length === 0 || colonne.length === 0;
    }
    const resto = [t('tabella.nota.territorio'), nRighe > MAX_RIGHE ? t('tabella.mostrate', { n: MAX_RIGHE }) : ''].filter(Boolean).join(' · ');
    nota.replaceChildren(`${t('tabella.nota')} `, el('strong', null, t('tabella.nota.clic')), ` · ${resto}`);
    nota.title = nota.textContent;
    return { righe, colonne };
  }

  function aggiornaTutte(f, s) {
    const tutte = s.filtrate;
    const casella = corpo.querySelector('thead .tabella-casella input');
    if (!casella) return;
    const scelte = tutte.filter(r => s.selezione.has(chiaveRiga(r))).length;
    casella.checked = tutte.length > 0 && scelte === tutte.length;
    casella.indeterminate = scelte > 0 && scelte < tutte.length;
    casella.disabled = tutte.length === 0;
  }

  function disegnaTabella(f, s) {
    const colonne = colonneOrdinate(s).filter(c => s.visibili.has(c.id));
    const righe = righeDi(f);
    const cerca = s.filtro.trim().toLowerCase();
    const tutteLeColonne = colonneOrdinate(s);
    let filtrate = cerca
      ? righe.filter(r => tutteLeColonne.some(c => mostra(c, r).toLowerCase().includes(cerca)))
      : [...righe];
    if (s.sort) {
      const colonna = tutteLeColonne.find(c => c.id === s.sort.id);
      if (colonna) filtrate = ordinaRighe(filtrate, colonna, s.sort.dir);
    }
    s.filtrate = filtrate;
    s.mostrate = filtrate.slice(0, MAX_RIGHE);

    if (!colonne.length) {
      messaggioVuoto(t('tabella.nessunaColonna'));
      aggiornaBarra(f, s);
      return;
    }
    if (!s.mostrate.length) {
      messaggioVuoto(righe.length ? t('tabella.nessunRisultato') : (f.vuoto ?? t('tabella.nessunRisultato')));
      aggiornaBarra(f, s);
      return;
    }

    const tabella = el('table', 'tabella-griglia');
    const thead = document.createElement('thead');
    const trTesta = document.createElement('tr');
    const thTutte = el('th', 'tabella-casella');
    thTutte.scope = 'col';
    const tutte = Object.assign(document.createElement('input'), { type: 'checkbox' });
    tutte.setAttribute('aria-label', t('tabella.riga.tutte'));
    tutte.title = t('tabella.riga.tutte');
    tutte.addEventListener('change', () => {
      for (const r of s.filtrate) {
        if (tutte.checked) s.selezione.add(chiaveRiga(r));
        else s.selezione.delete(chiaveRiga(r));
      }
      disegnaTabella(f, s);
    });
    thTutte.append(tutte);
    trTesta.append(thTutte);

    for (const c of colonne) {
      const th = el('th', c.numerica ? 'tabella-num' : null);
      th.scope = 'col';
      if (s.sort?.id === c.id) th.setAttribute('aria-sort', s.sort.dir === 'asc' ? 'ascending' : 'descending');
      const ordina = bottone('tabella-ordina', '', t('tabella.ordina', { nome: c.etichetta }));
      ordina.textContent = `${c.etichetta}${s.sort?.id === c.id ? (s.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}`;
      ordina.addEventListener('click', () => {
        s.sort = s.sort?.id === c.id ? { id: c.id, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: 'asc' };
        disegnaTabella(f, s);
      });
      th.append(ordina);
      trTesta.append(th);
    }
    thead.append(trTesta);
    tabella.append(thead);

    const tbody = document.createElement('tbody');
    const frammento = document.createDocumentFragment();
    for (const riga of s.mostrate) {
      const k = chiaveRiga(riga);
      const tr = document.createElement('tr');
      tr.dataset.chiave = k;
      tr.tabIndex = 0;
      tr.setAttribute('aria-selected', String(s.selezione.has(k)));
      if (s.corrente === k) tr.setAttribute('aria-current', 'true');
      if (f.apri) tr.title = t('tabella.apri');
      const tdCasella = el('td', 'tabella-casella');
      const casella = Object.assign(document.createElement('input'), { type: 'checkbox', checked: s.selezione.has(k) });
      casella.setAttribute('aria-label', t('tabella.riga.seleziona'));
      casella.addEventListener('change', () => {
        if (casella.checked) s.selezione.add(k);
        else s.selezione.delete(k);
        tr.setAttribute('aria-selected', String(casella.checked));
        aggiornaBarra(f, s);
        aggiornaTutte(f, s);
      });
      tdCasella.append(casella);
      tr.append(tdCasella);
      for (const c of colonne) {
        const td = el('td', c.numerica ? 'tabella-num' : null, mostra(c, riga));
        if (c.numerica) td.title = mostra(c, riga);
        if (c.evidenza?.(riga)) tr.classList.add('tabella-evidenza');
        tr.append(td);
      }
      const apri = () => {
        if (typeof f.apri !== 'function') return;
        for (const altro of tbody.querySelectorAll('tr[aria-current="true"]')) altro.removeAttribute('aria-current');
        tr.setAttribute('aria-current', 'true');
        s.corrente = k;
        f.apri(riga);
      };
      tr.addEventListener('click', e => {
        if (e.target.closest('input,button,a,label')) return;
        apri();
      });
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); apri(); }
      });
      frammento.append(tr);
    }
    tbody.append(frammento);
    tabella.append(tbody);
    corpo.replaceChildren(tabella);
    aggiornaTutte(f, s);
    aggiornaBarra(f, s);
  }

  function disegnaElencoColonne(f, s) {
    elencoColonne.replaceChildren();
    const colonne = colonneOrdinate(s);
    colonne.forEach((c, i) => {
      const li = document.createElement('li');
      const visibile = Object.assign(document.createElement('input'), { type: 'checkbox', checked: s.visibili.has(c.id) });
      visibile.setAttribute('aria-label', t('tabella.colonna.visibile', { nome: c.etichetta }));
      visibile.title = t('tabella.colonna.visibile', { nome: c.etichetta });
      visibile.addEventListener('change', () => {
        if (visibile.checked) {
          s.visibili.add(c.id);
          s.esporta.add(c.id);
        } else if (s.visibili.size > 1) {
          s.visibili.delete(c.id);
          s.esporta.delete(c.id);
        } else {
          visibile.checked = true;
        }
        disegnaTabella(f, s);
      });
      const nome = el('span', 'tabella-colonna-nome', c.etichetta);
      const etichettaVisibile = document.createElement('label');
      etichettaVisibile.className = 'tabella-colonna-etichetta';
      etichettaVisibile.title = t('tabella.colonna.visibile', { nome: c.etichetta });
      etichettaVisibile.append(visibile, nome);
      const su = bottone('tabella-sposta', '↑', t('tabella.colonna.su', { nome: c.etichetta }));
      const giu = bottone('tabella-sposta', '↓', t('tabella.colonna.giu', { nome: c.etichetta }));
      su.disabled = i === 0;
      giu.disabled = i === colonne.length - 1;
      su.addEventListener('click', () => {
        [s.ordine[i - 1], s.ordine[i]] = [s.ordine[i], s.ordine[i - 1]];
        disegnaElencoColonne(f, s);
        disegnaTabella(f, s);
      });
      giu.addEventListener('click', () => {
        [s.ordine[i + 1], s.ordine[i]] = [s.ordine[i], s.ordine[i + 1]];
        disegnaElencoColonne(f, s);
        disegnaTabella(f, s);
      });
      li.append(etichettaVisibile, su, giu);
      elencoColonne.append(li);
    });
  }

  function disegnaSchede(attive, f) {
    if (attive.length < 2) {
      schede.hidden = true;
      schede.replaceChildren();
      return;
    }
    schede.hidden = false;
    schede.replaceChildren(...attive.map(p => {
      const b = bottone('tabella-scheda', '', etichettaDi(p));
      b.textContent = etichettaDi(p);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'tabella-corpo');
      b.setAttribute('aria-selected', String(p.id === f.id));
      b.tabIndex = p.id === f.id ? 0 : -1;
      b.addEventListener('click', () => {
        corrente = p.id;
        disegna();
      });
      b.addEventListener('keydown', e => {
        const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!passo) return;
        e.preventDefault();
        const i = attive.indexOf(p);
        const prossimo = attive[(i + passo + attive.length) % attive.length];
        corrente = prossimo.id;
        disegna();
        schede.querySelector(`[aria-selected="true"]`)?.focus();
      });
      return b;
    }));
  }

  function vuotoSenzaLayer() {
    schede.hidden = true;
    schede.replaceChildren();
    titolo.textContent = t('tabella.titolo');
    conta.textContent = '';
    filtro.value = '';
    filtro.disabled = true;
    inverti.disabled = true;
    svuota.disabled = true;
    bottoneColonne.disabled = true;
    elencoColonne.hidden = true;
    bottoneColonne.setAttribute('aria-expanded', 'false');
    for (const b of [esportaCsv, esportaJson]) {
      b.disabled = true;
      b.querySelector('.tabella-esporta-n').textContent = '0 × 0';
    }
    nota.textContent = '';
    messaggioVuoto(t('tabella.nessunLayer'));
  }

  function disegna() {
    const attive = attivi();
    if (!attive.length) {
      corrente = null;
      vuotoSenzaLayer();
      return;
    }
    if (!attive.some(f => f.id === corrente)) corrente = attive[0].id;
    const f = attive.find(p => p.id === corrente);
    const s = statoDi(f);
    sincronizzaColonne(f, s);
    if (!s.visibili.size) s.visibili.add(s.ordine[0]);
    if (!s.esporta.size) s.esporta.add(s.ordine[0]);

    disegnaSchede(attive, f);
    titolo.textContent = attive.length > 1 ? t('tabella.titolo') : `${t('tabella.titolo')} · ${etichettaDi(f)}`;
    filtro.disabled = false;
    filtro.value = s.filtro;
    bottoneColonne.disabled = false;
    if (menuDi !== f.id) {
      menuDi = f.id;
      disegnaElencoColonne(f, s);
    }
    disegnaTabella(f, s);
  }

  function aggiornaAltezza() {
    if (radice.hidden) {
      document.body.style.setProperty('--tabella-h', '0px');
      return;
    }
    document.body.style.setProperty('--tabella-h', `${Math.round(radice.getBoundingClientRect().height)}px`);
  }

  // Sul telefono la tabella non deve coprire la ricerca: la colonna degli strumenti, a tabella aperta,
  // è nascosta dal CSS e lascia il posto al cassetto.
  function altezzaMassimaMobile() {
    if (!window.matchMedia?.('(max-width: 720px)').matches) return Infinity;
    const ricerca = document.getElementById('area-ricerca')?.getBoundingClientRect().bottom ?? 0;
    const strumenti = document.getElementById('barra-strumenti');
    const fondoStrumenti = strumenti && getComputedStyle(strumenti).display !== 'none'
      ? strumenti.getBoundingClientRect().bottom : 0;
    const sopra = Math.max(ricerca, fondoStrumenti);
    const sotto = document.getElementById('barra-tab')?.getBoundingClientRect().height ?? 0;
    return Math.max(ALTEZZA_MINIMA, window.innerHeight - sopra - sotto - 12);
  }

  function limitaAltezza() {
    const massimo = altezzaMassimaMobile();
    if (!Number.isFinite(massimo)) return;
    if (radice.getBoundingClientRect().height > massimo + 1) {
      radice.style.height = `${Math.round(massimo)}px`;
      aggiornaAltezza();
    }
  }

  function apri() {
    if (!radice.style.height) {
      let altezza = Math.min(ALTEZZA_INIZIALE, Math.round(window.innerHeight * 0.45));
      try {
        const salvata = Number(localStorage.getItem(CHIAVE_ALTEZZA));
        if (Number.isFinite(salvata) && salvata >= ALTEZZA_MINIMA) altezza = salvata;
      } catch { /* storage bloccato */ }
      radice.style.height = `${Math.round(altezza)}px`;
    }
    radice.hidden = false;
    comando.setAttribute('aria-pressed', 'true');
    disegna();
    // l'indice comuni serve alle colonne regione/provincia/comune/ISTAT: al primo caricamento si ridisegna
    caricaTerritorio().then(() => { if (!radice.hidden) disegna(); });
    limitaAltezza();
    requestAnimationFrame(() => {
      limitaAltezza();
      aggiornaAltezza();
      radice.focus({ preventScroll: true });
    });
  }

  function chiudi() {
    radice.hidden = true;
    comando.setAttribute('aria-pressed', 'false');
    elencoColonne.hidden = true;
    bottoneColonne.setAttribute('aria-expanded', 'false');
    aggiornaAltezza();
    comando.focus({ preventScroll: true });
  }

  function posizionaElenco() {
    const r = bottoneColonne.getBoundingClientRect();
    const larghezza = Math.min(LARGHEZZA_MENU, window.innerWidth - 16);
    const altezzaMax = Math.min(240, window.innerHeight - 16);
    const fondo = Math.min(window.innerHeight, radice.getBoundingClientRect().bottom) - 8;
    const top = r.bottom + 6;
    const disponibile = fondo - top;
    elencoColonne.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - larghezza - 8))}px`;
    elencoColonne.style.top = `${top}px`;
    elencoColonne.style.maxHeight = `${Math.max(96, Math.min(altezzaMax, disponibile))}px`;
  }

  const commuta = () => (radice.hidden ? apri() : chiudi());

  function programma() {
    if (radice.hidden) return;
    clearTimeout(attesa);
    attesa = setTimeout(() => { if (!radice.hidden) disegna(); }, 60);
  }

  function esporta(formato) {
    const f = fCorrente();
    if (!f) return;
    const s = statoDi(f);
    const colonne = colonneEsporta(s);
    const righe = candidati(s);
    if (!righe.length || !colonne.length) return;
    if (formato === 'csv') {
      const separatore = separatoreCsv();
      const testa = [
        `# ${t('tabella.titolo')} — ${etichettaDi(f)}`,
        `# ${t('tabella.meta.fonte')}: ${fonteDi(f)}`,
        ...(licenzaDi(f) ? [`# ${t('tabella.licenza')}: ${licenzaDi(f)}`] : []),
        `# ${t('tabella.meta.esportato')}: ${new Date().toISOString()}`,
        `# ${t('tabella.meta.righe')}: ${righe.length} · ${t('tabella.meta.colonne')}: ${colonne.length}`,
      ];
      const corpoCsv = righe.map(r => colonne.map(c => cellaCsv(testo(c, r), separatore)).join(separatore));
      scarica(`\uFEFF${[...testa, colonne.map(c => cellaCsv(c.etichetta, separatore)).join(separatore), ...corpoCsv].join('\r\n')}\r\n`, nomeFile(f, 'csv'), 'text/csv;charset=utf-8');
      return;
    }
    const dati = righe.map(r => Object.fromEntries(colonne.map(c => [c.id, c.json ? c.json(r) : valore(c, r)])));
    const uscita = {
      dataset: etichettaDi(f),
      fonte: fonteDi(f),
      ...(licenzaDi(f) ? { licenza: licenzaDi(f) } : {}),
      esportato: new Date().toISOString(),
      righe: dati.length,
      colonne: colonne.map(c => ({ id: c.id, etichetta: c.etichetta })),
      dati,
    };
    scarica(JSON.stringify(uscita, null, 2), nomeFile(f, 'json'), 'application/json;charset=utf-8');
  }

  comando.addEventListener('click', commuta);
  bottoneChiudi.addEventListener('click', chiudi);
  filtro.addEventListener('input', () => {
    const f = fCorrente();
    if (!f) return;
    const s = statoDi(f);
    s.filtro = filtro.value;
    disegnaTabella(f, s);
  });
  inverti.addEventListener('click', () => {
    const f = fCorrente();
    if (!f) return;
    const s = statoDi(f);
    for (const r of s.filtrate) {
      const k = chiaveRiga(r);
      if (s.selezione.has(k)) s.selezione.delete(k);
      else s.selezione.add(k);
    }
    disegnaTabella(f, s);
  });
  svuota.addEventListener('click', () => {
    const f = fCorrente();
    if (!f) return;
    statoDi(f).selezione.clear();
    disegnaTabella(f, statoDi(f));
  });
  bottoneColonne.addEventListener('click', () => {
    const apriMenu = elencoColonne.hidden;
    elencoColonne.hidden = !apriMenu;
    bottoneColonne.setAttribute('aria-expanded', String(apriMenu));
    if (apriMenu) {
      posizionaElenco();
      elencoColonne.querySelector('input')?.focus();
    }
  });
  for (const b of [esportaCsv, esportaJson]) {
    b.addEventListener('click', () => esporta(b.dataset.formato));
  }

  radice.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!elencoColonne.hidden) {
      elencoColonne.hidden = true;
      bottoneColonne.setAttribute('aria-expanded', 'false');
      bottoneColonne.focus();
      return;
    }
    chiudi();
  });

  document.addEventListener('pointerdown', e => {
    if (elencoColonne.hidden) return;
    if (elencoColonne.contains(e.target) || bottoneColonne.contains(e.target)) return;
    elencoColonne.hidden = true;
    bottoneColonne.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener(EVENTO_TABELLA, programma);
  document.addEventListener('change', e => {
    if (e.target.closest?.('#pannello')) programma();
  });
  window.addEventListener('resize', () => {
    limitaAltezza();
    if (!radice.hidden) aggiornaAltezza();
    if (!elencoColonne.hidden) posizionaElenco();
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(aggiornaAltezza).observe(radice);
  }

  // trascinamento della maniglia: la tabella sale e scende; l'altezza resta per la sessione successiva
  maniglia.addEventListener('pointerdown', e => {
    e.preventDefault();
    const partenzaY = e.clientY;
    const partenzaH = radice.getBoundingClientRect().height;
    const massimo = Math.max(ALTEZZA_MINIMA, Math.min(window.innerHeight - 120, altezzaMassimaMobile()));
    const muovi = ev => {
      const altezza = Math.max(ALTEZZA_MINIMA, Math.min(massimo, partenzaH + partenzaY - ev.clientY));
      radice.style.height = `${Math.round(altezza)}px`;
      aggiornaAltezza();
    };
    const fine = ev => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', fine);
      window.removeEventListener('pointercancel', fine);
      try { localStorage.setItem(CHIAVE_ALTEZZA, String(Math.round(radice.getBoundingClientRect().height))); } catch { /* storage bloccato */ }
      ev.preventDefault?.();
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', fine);
    window.addEventListener('pointercancel', fine);
  });
  maniglia.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const massimo = Math.max(ALTEZZA_MINIMA, Math.min(window.innerHeight - 120, altezzaMassimaMobile()));
    const altezza = radice.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 24 : -24);
    radice.style.height = `${Math.round(Math.max(ALTEZZA_MINIMA, Math.min(massimo, altezza)))}px`;
    aggiornaAltezza();
  });

  return {
    apri,
    chiudi,
    commuta,
    aggiorna: disegna,
    esporta,
    nodo: radice,
  };
}
