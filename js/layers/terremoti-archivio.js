// Pannello della legenda dello strato «Terremoti storici»: sceglie l'anno da mostrare in mappa e confronta due anni.
// Il confronto usa GET /terremoti/riepilogo (conteggi aggregati dal server), non gli eventi in mappa: resta corretto oltre il tetto di eventi della mappa.
import { t, localeIntl } from '../core/i18n.js';
import { CLASSI_MAG } from './scheda-terremoti.js';
import { ANNO_INIZIO, periodoAnno, periodoValido, confrontaPeriodi, giorniPeriodo, scaricaRiepilogo } from './scheda-archivio.js';

const MAGNITUDO_ARCHIVIO = [2, 3, 4, 5];
const MAG_PREDEFINITA = 3; // a M ≥ 2 anni come il 2016 superano il tetto di eventi della mappa
const nomeClasse = c => (c.a === Infinity ? `≥ ${c.da}` : `${c.da}–${c.a}`);

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function scelta(etichetta, valori, predefinito, testoValore = String) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const v of valori) {
    const o = el('option', null, testoValore(v));
    o.value = String(v);
    sel.append(o);
  }
  sel.value = String(predefinito);
  lab.append(el('span', null, etichetta), sel);
  return { nodo: lab, valore: () => Number(sel.value) };
}

const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });

// `caricaPeriodo(periodo, magMin)` e `tornaAlTempoReale()` arrivano // `carica(periodo, magMin)` mostra l'anno in mappa e risponde { n, troncato }; restituisce { nodo, annoMappa, magMappa }
export function pannelloArchivio({ carica, annoIniziale, magIniziale = MAG_PREDEFINITA }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const adesso = new Date().getUTCFullYear();
  const anni = Array.from({ length: adesso - ANNO_INIZIO + 1 }, (_, i) => adesso - i);
  const messaggio = el('p', 'uffici-nota');
  messaggio.setAttribute('role', 'status');
  const occupato = vero => nodo.querySelectorAll('button').forEach(b => { b.disabled = vero; });
  const eseguiGuarda = async (azione, riprova) => {
    occupato(true);
    messaggio.textContent = '';
    try { await azione(); } catch {
      messaggio.textContent = t('terremoti.arc.errore');
      const b = el('button', 'terremoti-archivio-btn secondario', t('terremoti.arc.riprova'));
      b.type = 'button';
      b.addEventListener('click', riprova);
      messaggio.append(' ', b);
    } finally { occupato(false); }
  };

  // --- mostra in mappa
  const annoMappa = scelta(t('terremoti.arc.anno'), anni, annoIniziale ?? adesso - 1);
  const magMappa = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, magIniziale, m => `≥ ${m}`);
  const mostra = el('button', 'terremoti-archivio-btn', t('terremoti.arc.mostraBtn'));
  mostra.type = 'button';
  const stato = el('p', 'uffici-nota');
  const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const vaiMostra = () => {
    const p = periodoAnno(annoMappa.valore());
    const errore = periodoValido(p);
    if (errore) { messaggio.textContent = t(errore); return; }
    const mag = magMappa.valore();
    eseguiGuarda(async () => {
      const r = await carica(p, mag);
      if (!r) return;
      stato.textContent = r.n
        ? [t('terremoti.arc.nota', { n: r.n, da: giorno(p.da), a: giorno(p.a), mag }), r.troncato ? t('terremoti.troncato', { n: r.n }) : ''].filter(Boolean).join(' ')
        : t('terremoti.arc.nessunEvento');
    }, vaiMostra);
  };
  mostra.addEventListener('click', vaiMostra);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(annoMappa.nodo, magMappa.nodo);

  // --- confronto
  const annoA = scelta(t('terremoti.arc.periodoA'), anni, adesso - 2);
  const annoB = scelta(t('terremoti.arc.periodoB'), anni, adesso - 1);
  const magConfronto = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, MAG_PREDEFINITA, m => `≥ ${m}`);
  const confronta = el('button', 'terremoti-archivio-btn', t('terremoti.arc.confronta'));
  confronta.type = 'button';
  const esito = el('div', 'terremoti-archivio-esito');
  const vaiConfronta = () => {
    const pa = periodoAnno(annoA.valore()), pb = periodoAnno(annoB.valore());
    const mag = magConfronto.valore();
    eseguiGuarda(async () => {
      const [ra, rb] = await Promise.all([scaricaRiepilogo(pa, mag), scaricaRiepilogo(pb, mag)]);
      esito.replaceChildren(...disegnaConfronto(confrontaPeriodi(ra, rb, giorniPeriodo(pa), giorniPeriodo(pb)), annoA.valore(), annoB.valore(), adesso));
    }, vaiConfronta);
  };
  confronta.addEventListener('click', vaiConfronta);
  const filtriConfronto = el('div', 'terremoti-filtri');
  magConfronto.nodo.classList.add('terremoti-archivio-larga');
  filtriConfronto.append(annoA.nodo, annoB.nodo, magConfronto.nodo);

  nodo.append(el('strong', null, t('terremoti.arc.mostra')), filtri, mostra, stato, el('strong', null, t('terremoti.arc.confrontaTitolo')), filtriConfronto, confronta, messaggio, esito, el('p', 'uffici-nota', t('terremoti.arc.utc')));
  return { nodo, mostra: vaiMostra };
}

// Differenza con segno; un valore che arrotondato è zero si scrive «0», mai «-0.0»
const segno = (n, d = 0) => {
  const r = Number(n.toFixed(d));
  return `${r > 0 ? '+' : ''}${numero(r === 0 ? 0 : r, d)}`;
};

// Tabella dei due anni e due istogrammi affiancati per classe di magnitudo (stessa scala)
export function disegnaConfronto(c, annoA, annoB, annoCorrente) {
  if (!c.a.n && !c.b.n) return [el('p', 'uffici-nota', t('terremoti.arc.nessunEvento'))];
  const tabella = el('table', 'terremoti-archivio-tabella');
  const nome = anno => (anno === annoCorrente ? `${anno} (${t('terremoti.arc.parziale')})` : String(anno));
  const riga = (etichetta, a, b, d) => {
    const tr = el('tr');
    tr.append(el('th', null, etichetta), el('td', null, a), el('td', null, b), el('td', null, d));
    return tr;
  };
  const intestazione = el('tr');
  intestazione.append(el('th'), el('th', null, nome(annoA)), el('th', null, nome(annoB)), el('th', null, t('terremoti.arc.differenza')));
  const dif = c.differenza;
  const magTesto = m => (m == null ? '–' : numero(m, 1));
  tabella.append(
    intestazione,
    riga(t('terremoti.arc.eventi'), numero(c.a.n), numero(c.b.n), dif.nPercento == null ? segno(dif.n) : `${segno(dif.n)} (${segno(dif.nPercento)}%)`),
    riga(t('terremoti.arc.alGiorno'), numero(c.a.perGiorno, 2), numero(c.b.perGiorno, 2), dif.perGiorno == null ? '–' : segno(dif.perGiorno, 2)),
    riga(t('terremoti.arc.magMax'), magTesto(c.a.magMax), magTesto(c.b.magMax), dif.magMax == null ? '–' : segno(dif.magMax, 1)),
    riga(t('terremoti.arc.magEquivalente'), magTesto(c.a.magEquivalente), magTesto(c.b.magEquivalente), '–'),
  );
  const max = Math.max(1, ...c.a.perClasse, ...c.b.perClasse);
  const istogramma = el('div', 'terremoti-archivio-istogramma');
  CLASSI_MAG.forEach((classe, i) => {
    const gruppo = el('div');
    const barre = el('div', 'terremoti-archivio-barre');
    for (const [lato, anno, n] of [['a', annoA, c.a.perClasse[i]], ['b', annoB, c.b.perClasse[i]]]) {
      const b = el('i', `terremoti-archivio-${lato}`);
      b.style.height = `${n ? Math.max(4, n / max * 100) : 0}%`;
      b.title = `${anno}: ${numero(n)}`;
      barre.append(b);
    }
    gruppo.append(barre, el('span', null, nomeClasse(classe)));
    istogramma.append(gruppo);
  });
  return [tabella, el('p', 'uffici-nota', t('terremoti.arc.classi')), istogramma];
}
