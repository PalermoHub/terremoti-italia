// Pannello della legenda dello strato «Terremoti storici»: sceglie l'anno (o un periodo personalizzato) da mostrare
// in mappa e confronta due anni interi oppure due intervalli di date.
// Il confronto usa GET /terremoti/riepilogo (conteggi aggregati dal server), non gli eventi in mappa: resta corretto oltre il tetto di eventi della mappa.
import { t, localeIntl } from '../core/i18n.js';
import { titoloConInfo, apriGrande } from '../core/info-grafico.js';
import { zoomGrafico } from '../core/zoom-grafico.js';
import { CLASSI_MAG, PROFONDITA } from './scheda-terremoti.js';
import { apriDialogoPeriodo, creaInterazione, rendiGruppo } from './scheda-terremoti-dom.js';
import { ANNO_INIZIO, periodoAnno, periodoAnnoIntero, periodoValido, annoDi, etichettaPeriodo, avvisoCompletezza, confrontaPeriodi, giorniPeriodo, scaricaRiepilogo, riepilogoDaEventi, serieAnnuale, grigliaDensita, conclusioniConfronto, quoteEnergiaClassi, riferimentoAnnuale, posizioneAnnuale, frequenzaCumulata, valoreB, serieGiornaliera, eventiPerEnergia, eventiMagMax, eventiDelMese } from './scheda-archivio.js';

const MAGNITUDO_ARCHIVIO = [2, 2.5, 3, 4, 5];
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
  return { nodo: lab, valore: () => Number(sel.value), imposta: v => { if ([...sel.options].some(o => o.value === String(v))) sel.value = String(v); } };
}

// Scelta dell'anno o di un periodo personalizzato (stesso calendario degli altri filtri): valore = { da, a } in UTC.
function sceltaPeriodo(etichetta, anni, predefinito) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  for (const a of anni) {
    const o = el('option', null, String(a));
    o.value = String(a);
    sel.append(o);
  }
  const personalizzato = el('option', null, t('terremoti.periodoPersonalizzato'));
  personalizzato.value = 'personalizzato';
  sel.append(personalizzato);
  const nota = el('small', 'terremoti-periodo-nota');
  let periodo = periodoAnno(predefinito);
  let custom = false;
  const allinea = () => {
    sel.value = custom ? 'personalizzato' : String(annoDi(periodo));
    nota.hidden = !custom;
    nota.textContent = custom ? etichettaPeriodo(periodo) : '';
  };
  sel.addEventListener('change', () => {
    if (sel.value === 'personalizzato') {
      apriDialogoPeriodo({
        da: periodo.da,
        a: periodo.a,
        utc: true,
        alApplica: p => { periodo = p; custom = true; allinea(); },
        alChiudi: allinea,
      });
      return;
    }
    periodo = periodoAnno(Number(sel.value));
    custom = false;
    allinea();
  });
  allinea();
  lab.append(el('span', null, etichetta), sel, nota);
  return { nodo: lab, valore: () => periodo, personalizzato: () => custom, imposta: p => { periodo = p; custom = !periodoAnnoIntero(p); allinea(); } };
}

// Scelta della classe di profondità: valore = { chiave, min, max } (min/max null = nessun limite)
function sceltaProfondita(etichetta, predefinito = 0) {
  const lab = el('label', 'terremoti-filtro');
  const sel = el('select');
  PROFONDITA.forEach((p, i) => {
    const o = el('option', null, t(`terremoti.arc.prof.${p.chiave}`));
    o.value = String(i);
    sel.append(o);
  });
  sel.value = String(predefinito);
  lab.append(el('span', null, etichetta), sel);
  return { nodo: lab, valore: () => PROFONDITA[Number(sel.value)] ?? PROFONDITA[0], imposta: chiave => { const i = PROFONDITA.findIndex(p => p.chiave === chiave); if (i >= 0) sel.value = String(i); } };
}

const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
// Magnitudo nelle etichette: «2» e «2,5» in italiano, mai «2.5»
const magnitudo = m => m.toLocaleString(localeIntl(), { maximumFractionDigits: 1 });

// Stato di un pannello: bottoni occupati durante lo scarico e, se l'archivio non risponde, errore con «Riprova»
function stato() {
  const messaggio = el('p', 'uffici-nota');
  messaggio.setAttribute('role', 'status');
  const esegui = async (nodo, azione, riprova) => {
    const bottoni = nodo.querySelectorAll('button');
    bottoni.forEach(b => { b.disabled = true; });
    messaggio.textContent = '';
    try { await azione(); } catch {
      messaggio.textContent = t('terremoti.arc.errore');
      const b = el('button', 'terremoti-archivio-btn secondario', t('terremoti.arc.riprova'));
      b.type = 'button';
      b.addEventListener('click', riprova);
      messaggio.append(' ', b);
    } finally { nodo.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
  };
  return { messaggio, esegui };
}

const anniArchivio = () => {
  const adesso = new Date().getUTCFullYear();
  return { adesso, anni: Array.from({ length: adesso - ANNO_INIZIO + 1 }, (_, i) => adesso - i) };
};
const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Strato «Terremoti storici»: `carica(periodo, magMin, profondita)` mostra l'anno in mappa e risponde { n, troncato } (null se superata da una richiesta più recente)
export function pannelloArchivio({ carica, annoIniziale, magIniziale = MAG_PREDEFINITA }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const { adesso, anni } = anniArchivio();
  const { messaggio, esegui } = stato();
  const periodoMappa = sceltaPeriodo(t('terremoti.arc.anno'), anni, annoIniziale ?? adesso - 1);
  const magMappa = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, magIniziale, m => `≥ ${magnitudo(m)}`);
  const profMappa = sceltaProfondita(t('terremoti.arc.prof'));
  const mostra = el('button', 'terremoti-archivio-btn', t('terremoti.arc.mostraBtn'));
  mostra.type = 'button';
  const nota = el('p', 'uffici-nota');
  const vaiMostra = () => {
    const p = periodoMappa.valore();
    const errore = periodoValido(p);
    if (errore) { messaggio.textContent = t(errore); return; }
    const mag = magMappa.valore();
    const prof = profMappa.valore();
    esegui(nodo, async () => {
      const r = await carica(p, mag, prof);
      if (!r) return;
      const base = t(prof.chiave === 'tutte' ? 'terremoti.arc.nota' : 'terremoti.arc.notaProf', { n: r.n, da: giorno(p.da), a: giorno(p.a), mag: magnitudo(mag), prof: t(`terremoti.arc.prof.${prof.chiave}`) });
      nota.textContent = r.n
        ? [base, r.troncato ? t('terremoti.troncato', { n: r.n }) : ''].filter(Boolean).join(' ')
        : t('terremoti.arc.nessunEvento');
    }, vaiMostra);
  };
  mostra.addEventListener('click', vaiMostra);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(periodoMappa.nodo, magMappa.nodo, profMappa.nodo);
  nodo.append(el('strong', null, t('terremoti.arc.mostra')), filtri, mostra, nota, messaggio, el('p', 'uffici-nota', t('terremoti.arc.utc')));
  return { nodo, mostra: vaiMostra };
}

// Riepiloghi dell'intera storia per magnitudo minima: il grafico degli anni li carica una volta e li tiene per la sessione.
const riepiloghiStorici = new Map();
function riepilogoStorico(magMin) {
  if (!riepiloghiStorici.has(magMin)) {
    const promessa = scaricaRiepilogo({ da: periodoAnno(ANNO_INIZIO).da, a: Date.now() }, magMin).catch(e => {
      riepiloghiStorici.delete(magMin);
      throw e;
    });
    riepiloghiStorici.set(magMin, promessa);
  }
  return riepiloghiStorici.get(magMin);
}

// Strato «Confronto»: `carica(periodoA, periodoB, magMin, area, profondita)` mette in mappa gli eventi dei due anni e risponde { a, b } con { n, troncato, eventi } (null se superata).
// `territorio` (opzionale, da creaFiltroTerritorio) restringe entrambi gli anni allo stesso territorio; magnitudo e profondità
// possono restringerlo ancora: con un territorio o una profondità i conteggi vengono da tutti gli eventi, non dal riepilogo del server.
// `griglia` (opzionale) riceve la differenza di densità in celle esagonali da mostrare in mappa, o null per toglierla.
export function pannelloConfronto({ carica, territorio = null, griglia = null, evidenzia = null, nascondi = null }) {
  const nodo = el('div', 'terremoti-pannello terremoti-archivio');
  const interazione = creaInterazione({ evidenzia, nascondi });
  const { adesso, anni } = anniArchivio();
  const ora = Date.now(); // `adesso` è l'anno per i menu; i grafici vogliono il momento
  const { messaggio, esegui } = stato();
  const periodoA = sceltaPeriodo(t('terremoti.arc.periodoA'), anni, adesso - 2);
  const periodoB = sceltaPeriodo(t('terremoti.arc.periodoB'), anni, adesso - 1);
  const mag = scelta(t('terremoti.arc.magMin'), MAGNITUDO_ARCHIVIO, MAG_PREDEFINITA, m => `≥ ${magnitudo(m)}`);
  const prof = sceltaProfondita(t('terremoti.arc.prof'));
  const confronta = el('button', 'terremoti-archivio-btn', t('terremoti.arc.confronta'));
  confronta.type = 'button';
  const nota = el('p', 'uffici-nota');
  const esito = el('div', 'terremoti-archivio-esito');
  // Differenza di densità in mappa: spenta all'inizio, si accende dopo il primo confronto
  const casella = el('label', 'terremoti-archivio-griglia');
  const interruttore = el('input');
  interruttore.type = 'checkbox';
  interruttore.disabled = true;
  casella.append(interruttore, el('span', null, t('terremoti.arc.griglia')));
  const notaGriglia = el('p', 'uffici-nota');
  notaGriglia.textContent = t('terremoti.arc.grigliaNota');
  notaGriglia.hidden = true;
  let ultimo = null;
  const disegnaGriglia = () => {
    if (!griglia) return;
    griglia(interruttore.checked && ultimo ? grigliaDensita(ultimo.a, ultimo.b) : null);
    notaGriglia.hidden = !(interruttore.checked && ultimo);
  };
  interruttore.addEventListener('change', disegnaGriglia);
  let eseguito = false; // il link condiviso porta il confronto solo se è stato lanciato
  const vaiConfronta = () => {
    eseguito = true;
    const pa = periodoA.valore(), pb = periodoB.valore();
    const soloAnni = periodoAnnoIntero(pa) && periodoAnnoIntero(pb);
    const m = mag.valore();
    const p = prof.valore();
    ultimo = null;
    interruttore.disabled = true;
    if (griglia) { griglia(null); notaGriglia.hidden = true; }
    return esegui(nodo, async () => {
      let area = null;
      if (territorio?.attivo()) {
        try { area = await territorio.prepara(); } catch { messaggio.textContent = t('terremoti.arc.territorioErrore'); }
      }
      // con un territorio o una profondità scelta i conteggi vengono da tutti gli eventi (oltre il tetto della mappa);
      // senza, dal riepilogo del server (esatto anche oltre il tetto) e dagli eventi in mappa, insieme.
      const conEventi = Boolean(area) || p.min != null;
      let [ra, rb, mappa] = conEventi
        ? await carica(pa, pb, m, area, p).then(r => [r && riepilogoDaEventi(r.a.eventi), r && riepilogoDaEventi(r.b.eventi), r])
        : await Promise.all([scaricaRiepilogo(pa, m), scaricaRiepilogo(pb, m), carica(pa, pb, m, null, p)]);
      if (!mappa) return;
      // Senza server i riepiloghi statici hanno le magnitudo di tutta la storia, non del periodo: magnitudo massima, energia e classi
      // verrebbero uguali per A e B. Con gli eventi del periodo al completo la distribuzione per magnitudo si ricalcola da lì.
      const delPeriodo = (r, lato) => (!conEventi && r && !lato.incompleto ? { ...r, perMagnitudo: riepilogoDaEventi(lato.eventi).perMagnitudo } : r);
      ra = delPeriodo(ra, mappa.a);
      rb = delPeriodo(rb, mappa.b);
      ultimo = { a: mappa.a.eventi, b: mappa.b.eventi };
      const eventiA = ultimo.a, eventiB = ultimo.b; // gruppi da evidenziare in mappa dai grafici del confronto
      interruttore.disabled = false;
      // Le condizioni scritte sopra la tabella: senza, un confronto copiato o fotografato non dice a quali dati si riferisce
      const condizioni = t(area ? 'terremoti.arc.condizioniTerritorio' : 'terremoti.arc.condizioni', { mag: magnitudo(m), prof: t(`terremoti.arc.prof.${p.chiave}`) });
      const avviso = avvisoCompletezza(annoDi(pa), annoDi(pb), m);
      const c = confrontaPeriodi(ra, rb, giorniPeriodo(pa), giorniPeriodo(pb));
      // I grafici per anno e la cumulata mese per mese hanno senso solo con due anni interi: con un periodo
      // personalizzato restano la tabella, le classi di magnitudo e la mappa.
      const grafici = soloAnni ? el('div', 'terremoti-confronto-grafici') : null;
      const cumulata = grafici ? graficoCumulata(c, annoDi(pa), annoDi(pb), ora, false, null, null, eventiA, eventiB, interazione) : null;
      if (grafici && cumulata) grafici.append(cumulata);
      const giorni = grafici ? graficoGiorni(eventiA, eventiB, annoDi(pa), annoDi(pb), false, null, null, interazione) : null;
      if (grafici && giorni) grafici.append(giorni);
      esito.replaceChildren(...disegnaConfronto(c, pa, pb, adesso, condizioni, avviso, grafici, soloAnni, eventiA, eventiB, interazione, m));
      nota.textContent = mappa.a.troncato || mappa.b.troncato ? t('terremoti.arc.troncatoConfronto', { n: Math.max(mappa.a.n, mappa.b.n) }) : '';
      disegnaGriglia();
      // il grafico degli anni arriva dopo la tabella, così il confronto non aspetta una seconda richiesta
      if (soloAnni) riepilogoStorico(m).then(storico => {
        const serie = serieAnnuale(storico.perMese, ora);
        const grafico = graficoAnni(serie, annoDi(pa), annoDi(pb), m, false, null, null, eventiA, eventiB, interazione);
        if (grafico) grafici.prepend(grafico);
        // dove cadono A e B rispetto agli altri anni: a parole, perché le barre da sole non danno il posto in classifica
        const posizioni = [...new Set([annoDi(pa), annoDi(pb)])].map(anno => posizioneAnnuale(serie, anno, m, ora)).filter(Boolean);
        if (grafico && posizioni.length) grafico.after(el('p', 'terremoti-sintesi', posizioni.map(p => t('terremoti.arc.posizioneAnno', {
          anno: p.anno, n: numero(p.n), x: numero(p.volte, p.volte < 10 ? 1 : 0), mediana: numero(p.mediana), da: p.da, a: p.a, posto: p.posto, su: p.su,
        })).join(' ')));
      }).catch(() => { /* il grafico storico è un di più: senza, la tabella resta */ });
    }, vaiConfronta);
  };
  confronta.addEventListener('click', vaiConfronta);
  const filtri = el('div', 'terremoti-filtri');
  filtri.append(periodoA.nodo, periodoB.nodo, mag.nodo, prof.nodo);
  if (territorio) filtri.append(territorio.nodo);
  nodo.append(el('strong', null, t('terremoti.arc.confrontaTitolo')), filtri, confronta);
  if (griglia) nodo.append(casella, notaGriglia);
  if (interazione) nodo.append(el('p', 'scheda-nota terremoti-grafici-aiuto', t('terremoti.grafici.aiuto')));
  nodo.append(nota, messaggio, esito, el('p', 'uffici-nota', t('terremoti.arc.utc')));
  return {
    nodo,
    confronta: vaiConfronta,
    // scelte del confronto lanciato (per il link condiviso), o null se non ce n'è uno
    stato: () => (eseguito ? { a: periodoA.valore(), b: periodoB.valore(), mag: mag.valore(), prof: prof.valore().chiave, territorio: territorio?.stato() ?? null } : null),
    async imposta(s) {
      periodoA.imposta(s.a);
      periodoB.imposta(s.b);
      mag.imposta(s.mag);
      prof.imposta(s.prof);
      if (territorio && s.territorio) await territorio.imposta(s.territorio);
      await vaiConfronta();
    },
  };
}

// Differenza con segno; un valore che arrotondato è zero si scrive «0», mai «-0.0»
const segno = (n, d = 0) => {
  const r = Number(n.toFixed(d));
  return `${r > 0 ? '+' : ''}${numero(r === 0 ? 0 : r, d)}`;
};

const APICI = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// Energia come somma dei momenti sismici (N·m): cresce di ~32 volte per unità di magnitudo, quindi la dominano i terremoti forti
const energiaTesto = j => {
  if (!j) return '–';
  const esponente = Math.floor(Math.log10(j));
  return `${numero(j / 10 ** esponente, 1)} × 10${String(esponente).split('').map(c => APICI[c] ?? c).join('')}`;
};

const meseBreve = mese => new Date(`${mese}-01T00:00:00Z`).toLocaleDateString(localeIntl(), { month: 'short', timeZone: 'UTC' });
// Quanto pesa il mese più attivo: se pesa molto, il conteggio dell'anno è trascinato dalle repliche di una sequenza
const meseTesto = m => (m ? `${meseBreve(m.mese)} · ${numero(m.quota, m.quota < 10 ? 1 : 0)}%` : '–');
const titoloMese = m => (m ? `${meseBreve(m.mese)} ${m.mese.slice(0, 4)}: ${numero(m.n)}` : null);

// Le frasi del modello (conclusioniConfronto) in una sola riga di testo; `a` e `b` sono i nomi dei periodi
function testoConclusioni(frasi, a, b) {
  if (!frasi) return null;
  const perc = n => numero(n, n < 10 ? 1 : 0);
  return frasi.map(f => t(`terremoti.arc.concl.${f.chiave}`, {
    a, b,
    perc: f.perc == null ? '' : perc(f.perc),
    volte: f.volte == null ? '' : numero(f.volte, f.volte < 10 ? 1 : 0),
    quota: f.quota == null ? '' : perc(f.quota),
    periodo: f.lato === 'a' ? a : b,
    mese: f.mese ? meseBreve(f.mese) : '',
  })).join(' ');
}

// Tabella dei due periodi e un istogramma con due barre per classe di magnitudo (stessa scala).
// `condizioni` (magnitudo minima, profondità, territorio) e `avviso` (completezza del catalogo) sono le due righe sopra la tabella.
export function disegnaConfronto(c, periodoA, periodoB, adesso, condizioni = null, avviso = null, grafici = null, soloAnni = true, eventiA = [], eventiB = [], interazione = null, magMin = null) {
  if (!c.a.n && !c.b.n) return [el('p', 'uffici-nota', t('terremoti.arc.nessunEvento'))];
  const elementi = [];
  if (condizioni) elementi.push(el('p', 'uffici-nota', condizioni));
  if (avviso) elementi.push(el('p', 'uffici-nota terremoti-archivio-avviso', t(avviso)));
  if (!soloAnni) elementi.push(el('p', 'uffici-nota', t('terremoti.arc.soloTabella')));
  const tabella = el('table', 'terremoti-archivio-tabella');
  const annoCorrente = new Date(adesso).getUTCFullYear();
  const nome = p => {
    if (!periodoAnnoIntero(p)) return etichettaPeriodo(p);
    const anno = annoDi(p);
    return anno === annoCorrente ? `${anno} (${t('terremoti.arc.parziale')})` : String(anno);
  };
  // `gruppoA`/`gruppoB` = eventi che la cella rappresenta: sotto il mouse (o con il focus) si accendono in mappa, come le barre dei grafici
  const riga = (etichetta, a, b, d, titoloA = null, titoloB = null, gruppoA = null, gruppoB = null) => {
    const tr = el('tr');
    const cellaA = el('td', null, a), cellaB = el('td', null, b);
    if (titoloA) cellaA.title = titoloA;
    if (titoloB) cellaB.title = titoloB;
    rendiGruppo(cellaA, gruppoA, interazione, titoloA);
    rendiGruppo(cellaB, gruppoB, interazione, titoloB);
    tr.append(el('th', null, etichetta), cellaA, cellaB, el('td', null, d));
    return tr;
  };
  const conclusione = testoConclusioni(conclusioniConfronto(c), nome(periodoA), nome(periodoB));
  if (conclusione) elementi.push(el('p', 'terremoti-sintesi', conclusione)); // prima della tabella: dice cosa significano i numeri
  const intestazione = el('tr');
  intestazione.append(el('th'), el('th', null, nome(periodoA)), el('th', null, nome(periodoB)), el('th', null, t('terremoti.arc.differenza')));
  const dif = c.differenza;
  const magTesto = m => (m == null ? '–' : numero(m, 1));
  const forti = [eventiPerEnergia(eventiA), eventiPerEnergia(eventiB)];
  const magMaxA = eventiMagMax(eventiA, c.a.magMax), magMaxB = eventiMagMax(eventiB, c.b.magMax);
  const meseA = eventiDelMese(eventiA, c.a.meseMax?.mese), meseB = eventiDelMese(eventiB, c.b.meseMax?.mese);
  const suggerimento = (gruppo, chiave, valori = {}) => (gruppo.length ? t(chiave, valori) : null);
  tabella.append(
    intestazione,
    riga(t('terremoti.arc.eventi'), numero(c.a.n), numero(c.b.n), dif.nPercento == null ? segno(dif.n) : `${segno(dif.n)} (${segno(dif.nPercento)}%)`,
      suggerimento(eventiA, 'terremoti.arc.evidTutti'), suggerimento(eventiB, 'terremoti.arc.evidTutti'), eventiA, eventiB),
    riga(t('terremoti.arc.alGiorno'), numero(c.a.perGiorno, 2), numero(c.b.perGiorno, 2), dif.perGiorno == null ? '–' : segno(dif.perGiorno, 2)),
    riga(t('terremoti.arc.magMax'), magTesto(c.a.magMax), magTesto(c.b.magMax), dif.magMax == null ? '–' : segno(dif.magMax, 1),
      suggerimento(magMaxA, 'terremoti.arc.evidMagMax'), suggerimento(magMaxB, 'terremoti.arc.evidMagMax'), magMaxA, magMaxB),
    riga(t('terremoti.arc.magEquivalente'), magTesto(c.a.magEquivalente), magTesto(c.b.magEquivalente), dif.magEquivalente == null ? '–' : segno(dif.magEquivalente, 1)),
    riga(t('terremoti.arc.energia'), energiaTesto(c.a.energia), energiaTesto(c.b.energia), dif.energia == null ? '–' : `×${numero(dif.energia, 1)}`,
      suggerimento(forti[0], 'terremoti.arc.evidEnergia', { n: numero(forti[0].length) }), suggerimento(forti[1], 'terremoti.arc.evidEnergia', { n: numero(forti[1].length) }), forti[0], forti[1]),
    riga(t('terremoti.arc.meseMax'), meseTesto(c.a.meseMax), meseTesto(c.b.meseMax), '–', titoloMese(c.a.meseMax), titoloMese(c.b.meseMax), meseA, meseB),
  );
  elementi.push(tabella);
  if (dif.energia != null) elementi.push(el('p', 'uffici-nota', t('terremoti.arc.rapporto')));
  elementi.push(el('p', 'uffici-nota', t('terremoti.arc.lettura')));
  if (grafici) elementi.push(grafici);
  elementi.push(graficoClassi(c, periodoA, periodoB, false, eventiA, eventiB, interazione));
  const gr = graficoFrequenza(c, periodoA, periodoB, magMin ?? 0, false, null, null, eventiA, eventiB, interazione);
  if (gr) elementi.push(gr);
  return elementi;
}

// ---- Grafici del confronto (SVG disegnato a mano, come il resto dell'app: nessuna libreria) ----
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORE_A = '#0ea5e9';
const COLORE_B = '#f97316';

// viewBox (L × A) e margini (sinistro, destro, alto, basso): piccolo nella scheda, grande nel popup
const DIM_ANNI = { L: 400, A: 172, MS: 32, MD: 26, MA: 10, MB: 26 };
const DIM_ANNI_GRANDE = { L: 900, A: 420, MS: 58, MD: 46, MA: 22, MB: 54 };
const DIM_CUM = { L: 400, A: 150, MS: 36, MD: 10, MA: 10, MB: 24 };
const DIM_CUM_GRANDE = { L: 900, A: 420, MS: 62, MD: 22, MA: 22, MB: 54 };

function nodoSvg(tag, attributi = {}) {
  const nodo = document.createElementNS(SVG_NS, tag);
  for (const [chiave, valore] of Object.entries(attributi)) nodo.setAttribute(chiave, valore);
  return nodo;
}
function testoSvg(x, y, testo, attributi = {}) {
  const nodo = nodoSvg('text', { x, y, ...attributi });
  nodo.textContent = testo;
  return nodo;
}
// Titolo di un asse, solo nel popup grande: orizzontale in basso, verticale a sinistra o a destra
function titoloAsse(svg, testo, x, y, ruota = false) {
  const nodo = ruota
    ? nodoSvg('text', { transform: `translate(${x} ${y}) rotate(-90)`, 'text-anchor': 'middle', class: 'et asse-titolo' })
    : testoSvg(x, y, testo, { 'text-anchor': 'middle', class: 'et asse-titolo' });
  if (ruota) nodo.textContent = testo;
  svg.append(nodo);
}
const compatto = n => (n >= 1000 ? `${n / 1000}k` : String(n));
const meseCorto = m => new Date(Date.UTC(2020, m - 1, 1)).toLocaleDateString(localeIntl(), { month: 'short', timeZone: 'UTC' });
const annoBarra = b => new Date(b.da).getFullYear();

// ---- Tooltip dei grafici: un riquadro HTML che segue il puntatore; il testo sta in `data-tip` ----
let tooltipGrafico = null;
let tooltipCollegato = false;

function nascondiTooltip() {
  if (tooltipGrafico) tooltipGrafico.hidden = true;
}

function posizionaTooltip(x, y) {
  const r = tooltipGrafico.getBoundingClientRect();
  tooltipGrafico.style.left = `${Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8)}px`;
  tooltipGrafico.style.top = `${Math.min(Math.max(8, y + 14), window.innerHeight - r.height - 8)}px`;
}

function mostraTooltip(testo, x, y, nodo) {
  const ospite = nodo.closest?.('dialog') ?? document.body; // dentro un popup va nel popup, sopra il resto
  if (!tooltipGrafico || !tooltipGrafico.isConnected) {
    tooltipGrafico = document.createElement('div');
    tooltipGrafico.className = 'grafico-tooltip';
    tooltipGrafico.setAttribute('role', 'tooltip');
    tooltipGrafico.hidden = true;
  }
  if (tooltipGrafico.parentNode !== ospite) ospite.append(tooltipGrafico);
  tooltipGrafico.textContent = testo;
  tooltipGrafico.hidden = false;
  posizionaTooltip(x, y);
}

function collegaTooltip(blocco) {
  if (!tooltipCollegato) {
    tooltipCollegato = true;
    window.addEventListener('scroll', nascondiTooltip, { passive: true, capture: true });
    window.addEventListener('resize', nascondiTooltip);
    document.addEventListener('close', nascondiTooltip, true); // dialogo chiuso: via anche il tooltip
    document.addEventListener('pointerdown', nascondiTooltip, true); // un clic altrove non lascia il riquadro appeso
  }
  blocco.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch' || ev.buttons) { nascondiTooltip(); return; } // niente tooltip mentre si trascina
    const nodo = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    if (!nodo) { nascondiTooltip(); return; }
    mostraTooltip(nodo.getAttribute('data-tip'), ev.clientX, ev.clientY, nodo);
  });
  blocco.addEventListener('pointerleave', nascondiTooltip);
  blocco.addEventListener('pointerdown', nascondiTooltip);
  blocco.addEventListener('wheel', nascondiTooltip, { passive: true });
}

// Istogramma per classe di magnitudo: due barre affiancate (periodo A e B) sulla stessa scala; nel popup i valori stanno sopra ogni barra.
// `vista` = { energia, log }: barre per numero di eventi o per quota dell'energia del periodo, in scala lineare o logaritmica.
// È condivisa con il popup, così l'ingrandimento mostra ciò che si stava guardando.
function graficoClassi(c, periodoA, periodoB, grande = false, eventiA = [], eventiB = [], interazione = null, vista = { energia: false, log: false }) {
  const eventi = t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl());
  const titolo = t('terremoti.arc.classi');
  const quote = { a: quoteEnergiaClassi(c.a), b: quoteEnergiaClassi(c.b) };
  const blocco = el('div', `terremoti-serie terremoti-archivio-classi${grande ? ' grande' : ''}`);
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'confronto-classi', grande ? null : () => apriGrande(titolo, () => graficoClassi(c, periodoA, periodoB, true, eventiA, eventiB, interazione, vista))));
  const chiave = el('div', 'terremoti-confronto-chiave');
  for (const [periodo, colore] of [[periodoA, COLORE_A], [periodoB, COLORE_B]]) {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = colore;
    voce.append(pallino, el('span', null, etichettaPeriodo(periodo)));
    chiave.append(voce);
  }
  const istogramma = el('div', 'terremoti-archivio-istogramma');
  const colonne = []; // { b, conteggio, periodo, classe, n, quota }
  CLASSI_MAG.forEach((classe, i) => {
    const gruppo = el('div');
    const barre = el('div', 'terremoti-archivio-barre');
    for (const [lato, periodo, n, delPeriodo] of [['a', periodoA, c.a.perClasse[i], eventiA], ['b', periodoB, c.b.perClasse[i], eventiB]]) {
      const colonna = el('div', 'terremoti-archivio-colonna');
      const b = el('i', `terremoti-archivio-${lato}`);
      const conteggio = grande ? el('b', 'terremoti-archivio-conteggio') : null; // sopra la barra, anche quando è a zero
      if (conteggio) b.append(conteggio);
      colonne.push({ b, conteggio, periodo, classe, n, quota: quote[lato][i] });
      // la barra è la classe di magnitudo di un periodo: sotto il mouse si accendono i suoi eventi in mappa
      rendiGruppo(b, delPeriodo.filter(e => e.mag >= classe.da && e.mag < classe.a), interazione);
      colonna.append(b);
      barre.append(colonna);
    }
    gruppo.append(barre, el('span', null, nomeClasse(classe)));
    istogramma.append(gruppo);
  });

  const percento = q => `${numero(q * 100, q > 0 && q < 0.1 ? 1 : 0)}%`;
  const nota = el('p', 'scheda-nota');
  const aggiorna = () => {
    const valore = k => (vista.energia ? k.quota * 100 : k.n);
    const max = Math.max(1e-9, ...colonne.map(valore));
    const scala = v => (vista.log ? Math.log10(1 + v) / Math.log10(1 + max) : v / max) * 100;
    for (const k of colonne) {
      const v = valore(k);
      k.b.style.height = `${v ? Math.max(4, scala(v)) : 0}%`;
      const dettaglio = vista.energia ? `${percento(k.quota)} ${t('terremoti.arc.dellEnergia')} (${numero(k.n)} ${eventi})` : `${numero(k.n)} ${eventi}`;
      k.b.dataset.tip = `${etichettaPeriodo(k.periodo)} · ${nomeClasse(k.classe)}: ${dettaglio}`;
      if (k.b.classList.contains('interattivo')) k.b.setAttribute('aria-label', k.b.dataset.tip);
      if (k.conteggio) k.conteggio.textContent = vista.energia ? percento(k.quota) : numero(k.n);
    }
    nota.textContent = [vista.energia ? t('terremoti.arc.classiNotaEnergia') : '', vista.log ? t('terremoti.arc.classiNotaLog') : ''].filter(Boolean).join(' ');
    nota.hidden = !nota.textContent;
  };

  const comandi = el('div', 'terremoti-classi-comandi');
  const gruppoVista = el('div', 'terremoti-vista');
  gruppoVista.setAttribute('role', 'group');
  gruppoVista.setAttribute('aria-label', t('terremoti.arc.vistaClassi'));
  const bottoni = [[false, 'terremoti.arc.vistaEventi'], [true, 'terremoti.arc.vistaEnergia']].map(([energia, testo]) => {
    const bottone = el('button', null, t(testo));
    bottone.type = 'button';
    bottone.addEventListener('click', () => { vista.energia = energia; allinea(); aggiorna(); });
    return [energia, bottone];
  });
  const allinea = () => bottoni.forEach(([energia, bottone]) => {
    bottone.setAttribute('aria-pressed', String(energia === vista.energia));
    bottone.classList.toggle('attivo', energia === vista.energia);
  });
  gruppoVista.append(...bottoni.map(([, bottone]) => bottone));
  const scala = el('label', 'terremoti-pf-scala');
  const casella = el('input');
  casella.type = 'checkbox';
  casella.checked = vista.log;
  casella.addEventListener('change', () => { vista.log = casella.checked; aggiorna(); });
  scala.append(casella, el('span', null, t('terremoti.pf.logaritmica')));
  comandi.append(gruppoVista, scala);
  allinea();
  aggiorna();

  blocco.append(chiave, comandi, istogramma, nota);
  collegaTooltip(blocco);
  return blocco;
}

// Barre degli eventi per anno dal 1985 (scala logaritmica) e linea della magnitudo massima; gli anni A e B sono colorati.
// `dominio` = intervallo di anni mostrato (per lo zoom), `origine` = tutti gli anni (per tornare a tutto).
function graficoAnni(serie, annoA, annoB, magMin, grande = false, dominio = null, origine = null, eventiA = [], eventiB = [], interazione = null) {
  const eventi = t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl());
  const barre = serie.barre;
  const massimo = Math.max(0, ...barre.map(b => b.n));
  if (!massimo) return null;
  const primo = annoBarra(barre[0]), ultimo = annoBarra(barre.at(-1));
  const intero = origine ?? { da: primo, a: ultimo + 1 };
  // gli anni sono interi: lo zoom si aggancia all'anno, senza mostrare mezze barre
  const da = Math.max(intero.da, Math.min(Math.round(dominio?.da ?? intero.da), intero.a - 1));
  const a = Math.min(intero.a, Math.max(Math.round(dominio?.a ?? intero.a), da + 1));
  const dim = grande ? DIM_ANNI_GRANDE : DIM_ANNI;
  const { L, A, MS, MD, MA, MB } = dim;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const larghezzaArea = destra - sinistra;
  const logMax = Math.max(1, Math.log10(massimo));
  const yConteggio = n => (n <= 0 ? basso : basso - Math.log10(n) / logMax * (basso - alto));
  const yMagnitudo = m => basso - Math.min(5, Math.max(0, m - 2)) / 5 * (basso - alto);
  const x = anno => sinistra + (anno - da) / (a - da) * larghezzaArea;
  const titolo = t('terremoti.arc.graficoAnni');
  const blocco = el('div', `terremoti-serie terremoti-confronto-grafico${grande ? ' grande' : ''}`);
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'confronto-anni', grande ? null : () => apriGrande(titolo, () => graficoAnni(serie, annoA, annoB, magMin, true, null, null, eventiA, eventiB, interazione))));
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': titolo });
  if (grande) svg.classList.add('grafico-zoom');

  for (let k = 0; 10 ** k <= massimo; k++) {
    const y = yConteggio(10 ** k);
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y, y2: y, class: 'griglia' }));
    svg.append(testoSvg(sinistra - 4, y + 3, compatto(10 ** k), { 'text-anchor': 'end' }));
  }
  const passo = larghezzaArea / (a - da);
  const larghezza = Math.max(2, Math.min(grande ? 72 : Infinity, passo * 0.68));
  const centro = anno => x(anno + 0.5);
  // gli eventi dei due anni confrontati, già in memoria: le altre barre (1985+) non hanno eventi da mostrare
  const delAnno = anno => (anno === annoA ? eventiA : anno === annoB ? eventiB : null);
  const rif = riferimentoAnnuale(serie, magMin); // mediana degli anni confrontabili: dice se A e B sono anni fuori dall'ordinario
  barre.forEach(b => {
    const anno = annoBarra(b);
    if (anno + 1 <= da || anno >= a) return;
    const cx = centro(anno);
    if (cx < sinistra - larghezza || cx > destra + larghezza) return;
    const classe = anno === annoA ? 'barra-a' : anno === annoB ? 'barra-b' : 'barra-anno';
    const y = yConteggio(b.n);
    const rett = nodoSvg('rect', { x: cx - larghezza / 2, y, width: larghezza, height: Math.max(b.n ? 1 : 0, basso - y), class: classe });
    const sulla = rif && b.n && anno >= rif.da && anno <= rif.a ? ` · ${t('terremoti.arc.xMediana', { x: numero(b.n / rif.mediana, 1) })}` : '';
    const tip = `${anno}: ${numero(b.n)} ${eventi} · ${t('terremoti.arc.magMax')} ${b.magMax == null ? '–' : numero(b.magMax, 1)}${sulla}`;
    rett.setAttribute('data-tip', tip);
    rendiGruppo(rett, delAnno(anno), interazione, tip); // la barra dell'anno: sotto il mouse si accendono i suoi eventi
    svg.append(rett);
  });

  if (rif) {
    const yMediana = yConteggio(rif.mediana);
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: yMediana, y2: yMediana, class: 'linea-mediana' }));
    svg.append(testoSvg(sinistra + 3, yMediana - 3, t('terremoti.arc.mediana'), { 'text-anchor': 'start', class: 'et-mediana' }));
  }
  const punti = [];
  barre.forEach(b => {
    const anno = annoBarra(b);
    if (anno + 1 <= da || anno >= a || b.magMax == null) return;
    punti.push([centro(anno), yMagnitudo(b.magMax), anno, b.magMax]);
  });
  if (punti.length > 1) svg.append(nodoSvg('polyline', { points: punti.map(p => `${p[0]},${p[1]}`).join(' '), class: 'linea-mag' }));
  for (const [cx, cy, anno, mag] of punti) {
    svg.append(nodoSvg('circle', { cx, cy, r: grande ? 2.8 : 2.4, class: 'punto-mag' }));
    const tip = `${anno}: ${t('terremoti.arc.magMax')} ${numero(mag, 1)}`;
    const hit = nodoSvg('circle', { cx, cy, r: grande ? 7 : 6, class: 'punto-hit', 'data-tip': tip });
    rendiGruppo(hit, delAnno(anno), interazione, tip); // anche il punto della magnitudo massima apre lo stesso gruppo
    svg.append(hit);
  }

  // Anni A e B sempre scritti; le tacche ogni 5 anni (o più fitte da ingrandito) solo se non finiscono addosso a loro.
  // Se A e B sono due anni di fila, l'etichetta di B scende di una riga: così restano leggibili entrambe.
  const passoEtichette = a - da > 30 ? 5 : a - da > 14 ? 2 : 1;
  const distanzaMinima = grande ? 44 : 30;
  const etichette = [...new Set([annoA, annoB])].filter(anno => anno >= da && anno < a);
  for (let anno = Math.ceil(da); anno < a; anno++) {
    if (anno === annoA || anno === annoB || anno % passoEtichette !== 0) continue;
    const cx = centro(anno);
    if (cx < sinistra || cx > destra) continue;
    if ([annoA, annoB].some(x => Math.abs(centro(x) - cx) < distanzaMinima)) continue;
    if (etichette.some(x => Math.abs(centro(x) - cx) < distanzaMinima)) continue;
    etichette.push(anno);
  }
  etichette.sort((x, y) => x - y);
  const vicini = annoA !== annoB && etichette.includes(annoA) && etichette.includes(annoB) && Math.abs(centro(annoA) - centro(annoB)) < distanzaMinima;
  const yEtichette = grande ? basso + 22 : basso + 12;
  for (const anno of etichette) {
    const cx = centro(anno);
    const colore = anno === annoA ? COLORE_A : anno === annoB ? COLORE_B : null;
    const y = vicini && anno === annoB ? yEtichette + (grande ? 15 : 10) : yEtichette;
    svg.append(testoSvg(cx, y, String(anno), { 'text-anchor': 'middle', ...(colore ? { style: `fill:${colore};font-weight:700` } : {}) }));
    if (grande) svg.append(nodoSvg('line', { x1: cx, x2: cx, y1: alto, y2: basso, class: 'griglia' }));
  }
  for (const m of grande ? [2, 3, 4, 5, 6, 7] : [3, 5, 7]) svg.append(testoSvg(destra + (grande ? 8 : 3), yMagnitudo(m) + 3, String(m), { 'text-anchor': 'start' }));
  svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: basso, y2: basso, class: 'asse' }));
  svg.append(nodoSvg('line', { x1: destra, x2: destra, y1: alto, y2: basso, class: 'asse' }));
  if (grande) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: sinistra, y1: alto, y2: basso, class: 'asse' }));
    titoloAsse(svg, t('terremoti.asse.anno'), sinistra + larghezzaArea / 2, A - 4);
    titoloAsse(svg, t('terremoti.asse.eventiAnno'), 15, (alto + basso) / 2, true);
    titoloAsse(svg, t('terremoti.asse.magMax'), L - 8, (alto + basso) / 2, true);
  }
  blocco.append(svg, el('p', 'scheda-nota', [t('terremoti.arc.graficoAnniNota', { mag: magnitudo(magMin) }), rif && t('terremoti.arc.graficoAnniMediana', { n: numero(rif.mediana), da: rif.da, a: rif.a })].filter(Boolean).join(' ')));
  collegaTooltip(blocco);
  if (grande) {
    zoomGrafico({
      blocco, svg,
      dominio: { da, a },
      origine: intero,
      geometria: dim,
      minDurata: 2,
      formatta: (d0, d1) => `${Math.round(d0)} – ${Math.round(d1) - 1}`,
      ridisegna: d => graficoAnni(serie, annoA, annoB, magMin, true, d, intero, eventiA, eventiB, interazione),
    });
  }
  return blocco;
}

// Cumulata mese per mese dei due anni sulla stessa scala; per l'anno in corso la linea si ferma al mese di oggi.
// `dominio` = intervallo di mesi mostrato (per lo zoom), `origine` = tutto l'anno (per tornare a tutto).
function graficoCumulata(c, annoA, annoB, adesso, grande = false, dominio = null, origine = null, eventiA = [], eventiB = [], interazione = null) {
  if (!c.a.n && !c.b.n) return null;
  const eventi = t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl());
  const annoCorrente = new Date(adesso).getUTCFullYear();
  const fino = anno => (anno === annoCorrente ? new Date(adesso).getUTCMonth() + 1 : 12);
  const serieA = c.a.cumulata.slice(0, fino(annoA));
  const serieB = c.b.cumulata.slice(0, fino(annoB));
  const intero = origine ?? { da: 1, a: 12 };
  const da = Math.max(1, Math.min(Math.round(dominio?.da ?? 1), 11));
  const a = Math.min(12, Math.max(Math.round(dominio?.a ?? 12), da + 1));
  const dim = grande ? DIM_CUM_GRANDE : DIM_CUM;
  const { L, A, MS, MD, MA, MB } = dim;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;

  // Valore cumulato a un mese: interpolato tra due mesi, o l'ultimo disponibile
  const valore = (serie, mese) => {
    if (!serie.length) return null;
    if (mese <= serie[0].mese) return serie[0].cumulati;
    if (mese >= serie.at(-1).mese) return serie.at(-1).cumulati;
    for (let i = 1; i < serie.length; i++) {
      const p0 = serie[i - 1], p1 = serie[i];
      if (mese <= p1.mese) return p0.cumulati + (mese - p0.mese) / (p1.mese - p0.mese) * (p1.cumulati - p0.cumulati);
    }
    return serie.at(-1).cumulati;
  };
  const visibile = serie => serie.length > 0 && serie.at(-1).mese >= da && serie[0].mese <= a;
  const massimo = Math.max(1, ...[serieA, serieB].filter(visibile).map(s => valore(s, a)));
  const potenza = 10 ** Math.floor(Math.log10(massimo));
  const n = massimo / potenza;
  const cima = ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => s >= n) ?? 10) * potenza;
  const x = mese => sinistra + (mese - da) / (a - da) * (destra - sinistra);
  const y = v => basso - v / cima * (basso - alto);
  const titolo = t('terremoti.arc.graficoCumulata');
  const blocco = el('div', `terremoti-serie terremoti-confronto-grafico${grande ? ' grande' : ''}`);
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'confronto-cumulata', grande ? null : () => apriGrande(titolo, () => graficoCumulata(c, annoA, annoB, adesso, true, null, null, eventiA, eventiB, interazione))));
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': titolo });
  if (grande) svg.classList.add('grafico-zoom');

  const valori = grande ? [0, 0.25, 0.5, 0.75, 1].map(f => cima * f) : cima >= 4 ? [0, cima / 2, cima] : [0, cima];
  for (const v of valori) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y(v), y2: y(v), class: v ? 'griglia' : 'asse' }));
    svg.append(testoSvg(sinistra - 4, y(v) + 3, numero(Math.round(v)), { 'text-anchor': 'end' }));
  }
  const passoMesi = grande ? (a - da >= 9 ? 2 : 1) : 0;
  const mesi = grande ? Array.from({ length: a - da + 1 }, (_, i) => da + i).filter(m => m === da || m === a || m % passoMesi === 0) : [1, 3, 5, 7, 9, 11];
  for (const m of mesi) {
    if (m < da || m > a) continue;
    svg.append(testoSvg(x(m), grande ? basso + 22 : A - 6, meseCorto(m), { 'text-anchor': 'middle' }));
    if (grande) svg.append(nodoSvg('line', { x1: x(m), x2: x(m), y1: alto, y2: basso, class: 'griglia' }));
  }

  // Eventi di ogni mese dell'anno (mesi UTC, gli stessi della cumulata): il punto del mese accende il suo gruppo
  const perMese = (lista, anno) => {
    const mappa = new Map();
    for (const e of lista ?? []) {
      const d = new Date(e.ts);
      if (d.getUTCFullYear() !== anno) continue;
      const m = d.getUTCMonth() + 1;
      if (!mappa.has(m)) mappa.set(m, []);
      mappa.get(m).push(e);
    }
    return mappa;
  };
  const linea = (serie, classe, colore, anno, delPeriodo) => {
    if (!visibile(serie)) return;
    const eventiMese = perMese(delPeriodo, anno);
    const punti = [];
    for (const p of serie) if (p.mese >= da && p.mese <= a) punti.push({ mese: p.mese, v: p.cumulati });
    if (da > serie[0].mese && da <= serie.at(-1).mese && punti[0]?.mese !== da) punti.unshift({ mese: da, v: valore(serie, da) });
    if (a > serie[0].mese && a < serie.at(-1).mese && punti.at(-1)?.mese !== a) punti.push({ mese: a, v: valore(serie, a) });
    if (!punti.length) return;
    if (punti.length > 1) svg.append(nodoSvg('polyline', { points: punti.map(p => `${x(p.mese).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '), class: classe }));
    if (grande) {
      for (const p of serie) {
        if (p.mese < da || p.mese > a) continue;
        svg.append(nodoSvg('circle', { cx: x(p.mese), cy: y(p.cumulati), r: 3.2, fill: colore }));
      }
    }
    for (const p of serie) {
      if (p.mese < da || p.mese > a) continue;
      const tip = `${meseCorto(p.mese)} ${anno}: ${numero(p.cumulati)} ${eventi}`;
      const hit = nodoSvg('circle', { cx: x(p.mese), cy: y(p.cumulati), r: 7, class: 'punto-hit', 'data-tip': tip });
      rendiGruppo(hit, eventiMese.get(p.mese), interazione, tip); // il mese: sotto il mouse si accendono i suoi eventi
      svg.append(hit);
    }
    const fine = punti.at(-1);
    svg.append(nodoSvg('circle', { cx: x(fine.mese), cy: y(fine.v), r: grande ? 4 : 2.8, fill: colore }));
    const tipFine = `${anno}: ${numero(fine.v)} ${eventi}`;
    const hitFine = nodoSvg('circle', { cx: x(fine.mese), cy: y(fine.v), r: 7, class: 'punto-hit', 'data-tip': tipFine });
    rendiGruppo(hitFine, eventiMese.get(fine.mese), interazione, tipFine);
    svg.append(hitFine);
  };
  linea(serieA, 'linea-a', COLORE_A, annoA, eventiA);
  linea(serieB, 'linea-b', COLORE_B, annoB, eventiB);
  if (grande) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: sinistra, y1: alto, y2: basso, class: 'asse' }));
    titoloAsse(svg, t('terremoti.asse.mese'), sinistra + (destra - sinistra) / 2, A - 4);
    titoloAsse(svg, t('terremoti.asse.eventi'), 15, (alto + basso) / 2, true);
  }

  const chiave = el('div', 'terremoti-confronto-chiave');
  for (const [anno, colore] of [[annoA, COLORE_A], [annoB, COLORE_B]]) {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = colore;
    voce.append(pallino, el('span', null, String(anno)));
    chiave.append(voce);
  }
  blocco.append(chiave, svg, el('p', 'scheda-nota', t('terremoti.arc.graficoCumulataNota')));
  collegaTooltip(blocco);
  if (grande) {
    zoomGrafico({
      blocco, svg,
      dominio: { da, a },
      origine: intero,
      geometria: dim,
      minDurata: 2,
      formatta: (d0, d1) => `${meseCorto(Math.ceil(d0))} – ${meseCorto(Math.floor(d1))}`,
      ridisegna: d => graficoCumulata(c, annoA, annoB, adesso, true, d, intero, eventiA, eventiB, interazione),
    });
  }
  return blocco;
}

// Frequenza cumulata di Gutenberg-Richter: eventi con magnitudo uguale o maggiore di M, in scala logaritmica, per i due periodi.
// Due linee parallele = stessa proporzione di eventi forti; una linea più ripida = più eventi deboli rispetto ai forti.
// `dominio` = intervallo di magnitudo mostrato (per lo zoom), `origine` = tutto l'intervallo (per tornare a tutto).
function graficoFrequenza(c, periodoA, periodoB, magMin, grande = false, dominio = null, origine = null, eventiA = [], eventiB = [], interazione = null) {
  const eventi = t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl());
  const serie = [
    { periodo: periodoA, punti: frequenzaCumulata(c.a.perMagnitudo ?? [], magMin), classe: 'linea-a', colore: COLORE_A, delPeriodo: eventiA, b: valoreB(c.a.perMagnitudo ?? [], magMin) },
    { periodo: periodoB, punti: frequenzaCumulata(c.b.perMagnitudo ?? [], magMin), classe: 'linea-b', colore: COLORE_B, delPeriodo: eventiB, b: valoreB(c.b.perMagnitudo ?? [], magMin) },
  ];
  const tutti = serie.flatMap(s => s.punti);
  if (!tutti.length) return null;
  const minimo = Math.floor(Math.min(...tutti.map(p => p.mag))), massimoMag = Math.max(minimo + 1, Math.ceil(Math.max(...tutti.map(p => p.mag))));
  const intero = origine ?? { da: minimo, a: massimoMag };
  const da = Math.max(intero.da, Math.min(dominio?.da ?? intero.da, intero.a - 1));
  const a = Math.min(intero.a, Math.max(dominio?.a ?? intero.a, da + 1));
  const dim = grande ? DIM_CUM_GRANDE : DIM_CUM;
  const { L, A, MS, MD, MA, MB } = dim;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const visibili = serie.flatMap(s => s.punti).filter(p => p.mag >= da && p.mag <= a);
  const massimo = Math.max(1, ...visibili.map(p => p.n));
  const logMax = Math.max(1, Math.log10(massimo));
  const x = m => sinistra + (m - da) / (a - da) * (destra - sinistra);
  const y = n => (n <= 1 ? basso : basso - Math.log10(n) / logMax * (basso - alto));
  const titolo = t('terremoti.arc.graficoFrequenza');
  const blocco = el('div', `terremoti-serie terremoti-confronto-grafico${grande ? ' grande' : ''}`);
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'confronto-gr', grande ? null : () => apriGrande(titolo, () => graficoFrequenza(c, periodoA, periodoB, magMin, true, null, null, eventiA, eventiB, interazione))));
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': titolo });
  if (grande) svg.classList.add('grafico-zoom');

  for (let k = 0; 10 ** k <= massimo; k++) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y(10 ** k), y2: y(10 ** k), class: k ? 'griglia' : 'asse' }));
    svg.append(testoSvg(sinistra - 4, y(10 ** k) + 3, compatto(10 ** k), { 'text-anchor': 'end' }));
  }
  for (let m = Math.ceil(da); m <= a; m++) {
    svg.append(testoSvg(x(m), grande ? basso + 22 : A - 6, String(m), { 'text-anchor': 'middle' }));
    if (grande) svg.append(nodoSvg('line', { x1: x(m), x2: x(m), y1: alto, y2: basso, class: 'griglia' }));
  }
  for (const { periodo, punti, classe, colore, delPeriodo } of serie) {
    const dentro = punti.filter(p => p.mag >= da && p.mag <= a);
    if (dentro.length > 1) svg.append(nodoSvg('polyline', { points: dentro.map(p => `${x(p.mag).toFixed(1)},${y(p.n).toFixed(1)}`).join(' '), class: classe }));
    for (const p of dentro) {
      svg.append(nodoSvg('circle', { cx: x(p.mag), cy: y(p.n), r: grande ? 3 : 2, fill: colore }));
      const tip = `${etichettaPeriodo(periodo)} · M ≥ ${numero(p.mag, 1)}: ${numero(p.n)} ${eventi}`;
      const hit = nodoSvg('circle', { cx: x(p.mag), cy: y(p.n), r: 7, class: 'punto-hit', 'data-tip': tip });
      rendiGruppo(hit, delPeriodo.filter(e => Math.round(e.mag * 10) / 10 >= p.mag), interazione, tip); // gli eventi di quella magnitudo o più
      svg.append(hit);
    }
  }
  if (grande) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: sinistra, y1: alto, y2: basso, class: 'asse' }));
    titoloAsse(svg, t('terremoti.asse.magnitudoMin'), sinistra + (destra - sinistra) / 2, A - 4);
    titoloAsse(svg, t('terremoti.asse.eventiMagMin'), 15, (alto + basso) / 2, true);
  }

  const chiave = el('div', 'terremoti-confronto-chiave');
  for (const { periodo, colore } of serie) {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = colore;
    voce.append(pallino, el('span', null, etichettaPeriodo(periodo)));
    chiave.append(voce);
  }
  const nota = [t('terremoti.arc.graficoFrequenzaNota')];
  if (serie.some(s => s.b != null)) nota.push(t('terremoti.arc.valoreB', { a: etichettaPeriodo(periodoA), ba: serie[0].b == null ? '–' : numero(serie[0].b, 2), b: etichettaPeriodo(periodoB), bb: serie[1].b == null ? '–' : numero(serie[1].b, 2) }));
  blocco.append(chiave, svg, el('p', 'scheda-nota', nota.join(' ')));
  collegaTooltip(blocco);
  if (grande) {
    zoomGrafico({
      blocco, svg,
      dominio: { da, a },
      origine: intero,
      geometria: dim,
      minDurata: 1,
      formatta: (d0, d1) => `M ${numero(d0, 1)} – ${numero(d1, 1)}`,
      ridisegna: d => graficoFrequenza(c, periodoA, periodoB, magMin, true, d, intero, eventiA, eventiB, interazione),
    });
  }
  return blocco;
}

// Eventi giorno per giorno dei due anni sovrapposti per data (scala logaritmica): i picchi alti e isolati sono sequenze sismiche,
// il fondo basso e continuo è l'attività di tutti i giorni. `dominio` = giorni mostrati (per lo zoom), `origine` = tutto l'anno.
const dataGiorno = i => new Date(Date.UTC(2020, 0, 1 + i)).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
function graficoGiorni(eventiA, eventiB, annoA, annoB, grande = false, dominio = null, origine = null, interazione = null) {
  const eventi = t('terremoti.arc.eventi').toLocaleLowerCase(localeIntl());
  const serie = [
    { anno: annoA, ...serieGiornaliera(eventiA, annoA), classe: 'barra-a', colore: COLORE_A },
    { anno: annoB, ...serieGiornaliera(eventiB, annoB), classe: 'barra-b', colore: COLORE_B },
  ];
  if (!serie.some(s => s.max)) return null;
  const intero = origine ?? { da: 0, a: 366 };
  const da = Math.max(0, Math.min(Math.round(dominio?.da ?? 0), 365));
  const a = Math.min(366, Math.max(Math.round(dominio?.a ?? 366), da + 1));
  const dim = grande ? DIM_CUM_GRANDE : DIM_CUM;
  const { L, A, MS, MD, MA, MB } = dim;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const massimo = Math.max(1, ...serie.flatMap(s => s.giorni.slice(da, a).map(g => g.n)));
  const y = n => basso - Math.log10(1 + n) / Math.log10(1 + massimo) * (basso - alto);
  const passo = (destra - sinistra) / (a - da);
  const larghezza = Math.max(0.5, Math.min(grande ? 6 : Infinity, passo * 0.42));
  const x = i => sinistra + (i - da) * passo;
  const titolo = t('terremoti.arc.graficoGiorni');
  const blocco = el('div', `terremoti-serie terremoti-confronto-grafico${grande ? ' grande' : ''}`);
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'confronto-giorni', grande ? null : () => apriGrande(titolo, () => graficoGiorni(eventiA, eventiB, annoA, annoB, true, null, null, interazione))));
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': titolo });
  if (grande) svg.classList.add('grafico-zoom');

  for (let k = 0; 10 ** k <= massimo; k++) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y(10 ** k), y2: y(10 ** k), class: 'griglia' }));
    svg.append(testoSvg(sinistra - 4, y(10 ** k) + 3, compatto(10 ** k), { 'text-anchor': 'end' }));
  }
  // asse: mesi se si vede molto dell'anno, altrimenti giorni a passo regolare
  const tacche = [];
  if (a - da > 62) for (let m = 0; m < 12; m++) { const i = (Date.UTC(2020, m, 1) - Date.UTC(2020, 0, 1)) / 86400000; if (i >= da && i < a && (grande || m % 2 === 0)) tacche.push([i, meseCorto(m + 1)]); }
  else { const passoGiorni = a - da > 31 ? 7 : a - da > 14 ? 3 : 1; for (let i = da; i < a; i += passoGiorni) tacche.push([i, dataGiorno(i)]); }
  for (const [i, testo] of tacche) {
    svg.append(testoSvg(x(i) + (a - da > 62 ? 0 : passo / 2), grande ? basso + 22 : A - 6, testo, { 'text-anchor': a - da > 62 ? 'start' : 'middle' }));
    if (grande) svg.append(nodoSvg('line', { x1: x(i), x2: x(i), y1: alto, y2: basso, class: 'griglia' }));
  }
  serie.forEach((s, lato) => {
    for (let i = da; i < a; i++) {
      const g = s.giorni[i];
      if (!g.n) continue;
      const cx = x(i) + passo / 2 - (lato === 0 ? larghezza : 0);
      const rett = nodoSvg('rect', { x: cx, y: y(g.n), width: larghezza, height: Math.max(1.5, basso - y(g.n)), class: s.classe });
      const tip = `${s.anno} · ${dataGiorno(i)}: ${numero(g.n)} ${eventi} · ${t('terremoti.arc.magMax')} ${numero(g.magMax, 1)}`;
      rett.setAttribute('data-tip', tip);
      rendiGruppo(rett, g.eventi, interazione, tip); // il giorno: sotto il mouse si accendono i suoi eventi
      svg.append(rett);
    }
  });
  svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: basso, y2: basso, class: 'asse' }));
  if (grande) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: sinistra, y1: alto, y2: basso, class: 'asse' }));
    titoloAsse(svg, t('terremoti.asse.giornoAnno'), sinistra + (destra - sinistra) / 2, A - 4);
    titoloAsse(svg, t('terremoti.asse.eventiGiorno'), 15, (alto + basso) / 2, true);
  }

  const chiave = el('div', 'terremoti-confronto-chiave');
  for (const { anno, colore } of serie) {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = colore;
    voce.append(pallino, el('span', null, String(anno)));
    chiave.append(voce);
  }
  blocco.append(chiave, svg, el('p', 'scheda-nota', t('terremoti.arc.graficoGiorniNota')));
  collegaTooltip(blocco);
  if (grande) {
    zoomGrafico({
      blocco, svg,
      dominio: { da, a },
      origine: intero,
      geometria: dim,
      minDurata: 7,
      formatta: (d0, d1) => `${dataGiorno(Math.round(d0))} – ${dataGiorno(Math.round(d1) - 1)}`,
      ridisegna: d => graficoGiorni(eventiA, eventiB, annoA, annoB, true, d, intero, interazione),
    });
  }
  return blocco;
}
