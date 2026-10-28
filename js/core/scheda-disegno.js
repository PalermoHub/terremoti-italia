// Disegno della scheda del luogo: righe, gruppi, accordion, link e intestazione di sezione (con l'interruttore «Mappa»).
import { separaMancanti, dividiDettaglio, valoreLungo, MANCANTE } from './scheda-modello.js';
import { svgIcona } from './icone.js';
import { collegamento } from './url-sicuro.js';
import { t as tr, tl } from './i18n.js';

export function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = tl(testo); // testi del modello dati: italiani nel codice, tradotti qui (vedi tl)
  return e;
}

// Icona SVG inline della sezione: decorativa, nascosta ai lettori di schermo
export function icona(nome) {
  const i = el('span', 'scheda-icona');
  i.dataset.icona = nome;
  i.innerHTML = svgIcona(nome, 16);
  return i;
}

function disegnaRiga(r) {
  const riga = el('div', 'scheda-riga');
  if (r.url) { // etichetta-collegamento (es. scheda di un ufficio sul sito del Comune); il valore va a capo
    const et = el('span', 'scheda-et');
    const a = el('a', null, tl(r.etichetta));
    collegamento(a, r.url);
    et.append(a);
    riga.append(et);
    riga.classList.add('scheda-riga--lunga');
    if (r.valore) riga.append(el('span', 'scheda-val scheda-val--nota', r.valore));
    return riga;
  }
  riga.append(el('span', 'scheda-et', tl(r.etichetta)));
  if (r.tel) { // numero di telefono: su telefono un tocco apre la tastiera di chiamata con il numero già composto, altrove resta testo
    const cifre = String(r.tel).replace(/[^\d+]/g, '');
    const chiamabile = cifre && globalThis.matchMedia?.('(pointer: coarse)')?.matches;
    const n = el(chiamabile ? 'a' : 'span', `scheda-val scheda-badge-tinta scheda-badge-pieno scheda-tel`, r.valore);
    if (r.colore) n.style.setProperty('--tinta', r.colore);
    if (chiamabile) {
      n.href = `tel:${cifre}`;
      n.setAttribute('aria-label', `${tr('scheda.chiama')} ${r.valore}`);
    }
    riga.append(n);
    return riga;
  }
  if (r.urlValore) { // il valore stesso è il collegamento (es. CUP → scheda del progetto su OpenCUP)
    const a = el('a', r.colore ? `scheda-val scheda-badge-tinta${r.pieno ? ' scheda-badge-pieno' : ''}` : 'scheda-val', r.valore);
    if (r.colore) a.style.setProperty('--tinta', r.colore); // badge cliccabile
    collegamento(a, r.urlValore);
    riga.append(a);
    return riga;
  }
  if (r.filtro) { // il valore è un filtro: un clic lo propone al layer (evento `dt:filtro`), un secondo clic lo toglie
    const b = el('button', 'scheda-val scheda-filtro', r.valore);
    b.type = 'button';
    b.title = tr('scheda.filtro.titolo');
    b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('dt:filtro', { detail: r.filtro })));
    riga.append(b);
    if (valoreLungo(r.valore)) riga.classList.add('scheda-riga--lunga');
    return riga;
  }
  if (r.colore) { // valore a badge con tinta propria (es. PEBA: livello, rilevanza, codice del gruppo)
    const badge = el('span', 'scheda-val scheda-badge-tinta', r.valore);
    badge.style.setProperty('--tinta', r.colore);
    riga.append(badge);
    return riga;
  }
  if (r.classe) {
    const { valore, dettaglio } = dividiDettaglio(r.valore);
    const badge = el('span', 'scheda-val scheda-badge scheda-badge--c' + r.classe);
    badge.title = tr('scheda.classe', { classe: r.classe });
    badge.append(el('span', 'scheda-badge-num', String(r.classe)), ` ${tl(valore)}`);
    riga.append(badge);
    if (dettaglio) riga.append(el('span', 'scheda-dettaglio', dettaglio));
  } else {
    riga.append(el('span', 'scheda-val', r.valore));
    if (valoreLungo(r.valore)) riga.classList.add('scheda-riga--lunga');
  }
  return riga;
}

// Gruppo con `evidenzia` (es. un vincolo del PRG): passando o toccando il gruppo, chi disegna quel layer ne mostra l'area in mappa
// (evento `scheda:evidenzia-gruppo`, detail = `evidenzia` o null). Il tocco lo tiene fisso, un secondo tocco lo toglie.
let gruppoFisso = null;
const evidenziaGruppo = detail => document.dispatchEvent(new CustomEvent('scheda:evidenzia-gruppo', { detail }));
document.addEventListener('scheda:chiusa', () => { gruppoFisso = null; });

function rendiEvidenziabile(box, g) {
  box.classList.add('scheda-gruppo--evidenziabile');
  box.evidenziaDati = g.evidenzia;
  box.tabIndex = 0;
  box.setAttribute('aria-pressed', 'false');
  const mostra = () => evidenziaGruppo(g.evidenzia);
  const ripristina = () => evidenziaGruppo(gruppoFisso?.isConnected ? gruppoFisso.evidenziaDati : null);
  const alterna = () => {
    const fisso = gruppoFisso === box;
    if (gruppoFisso) gruppoFisso.setAttribute('aria-pressed', 'false');
    gruppoFisso = fisso ? null : box;
    box.setAttribute('aria-pressed', String(!fisso));
    if (fisso) ripristina(); else mostra();
  };
  box.addEventListener('mouseenter', mostra);
  box.addEventListener('mouseleave', ripristina);
  box.addEventListener('focus', mostra);
  box.addEventListener('blur', ripristina);
  box.addEventListener('click', alterna);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); } });
}

function disegnaGruppo(g) {
  const box = el('div', 'scheda-gruppo');
  if (g.evidenzia) rendiEvidenziabile(box, g);
  if (g.titolo) box.append(el('h4', null, tl(g.titolo)));
  const { presenti, mancanti } = separaMancanti(g.righe);
  for (const r of presenti) box.append(disegnaRiga(r));
  if (mancanti.length) box.append(el('p', 'scheda-mancanti', tr('scheda.nonDisponibili', { elenco: mancanti.map(tl).join(', ') })));
  if (g.griglia?.length) {
    const griglia = el('div', 'scheda-griglia');
    for (const c of g.griglia) {
      const cella = el('div', 'scheda-cella');
      cella.append(el('div', 'scheda-cella-val', c.valore), el('div', 'scheda-cella-chiave', tl(c.chiave)));
      griglia.append(cella);
    }
    box.append(griglia);
  }
  return box;
}

// Mappa piccola e quadrata fatta di tessere raster, con un puntino al centro; il clic apre la mappa grande in un'altra pagina.
function disegnaMiniatura(m, titolo) {
  const a = el('a', 'scheda-mini');
  a.href = m.href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = tr('scheda.apriMappa');
  a.setAttribute('aria-label', `${tr('scheda.apriMappa')}: ${tl(titolo)}`);
  a.style.setProperty('--alt', `${m.altezza}px`);
  const tele = el('span', 'scheda-mini-tele'); // largo `larghezza`, centrato: se la scheda è più stretta si ritaglia ai lati e il punto resta al centro
  tele.style.cssText = `width:${m.larghezza}px;margin-left:-${m.larghezza / 2}px`;
  for (const tessera of m.tessere) {
    const img = el('img');
    img.src = tessera.url;
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    img.style.cssText = `left:${tessera.x}px;top:${tessera.y}px`;
    tele.append(img);
  }
  a.append(tele, el('i', 'scheda-mini-punto'), el('span', 'scheda-mini-attr', m.attribuzione));
  return a;
}

// Legende di magnitudo e di tempo su due colonne; cerchi e punti stanno al centro di una casella di larghezza fissa
export function disegnaLegendeEvento(legende) {
  const tx = (tag, classe, testo) => Object.assign(el(tag, classe), { textContent: testo });
  const box = el('div', 'scheda-evento-legende');
  for (const l of legende) {
    const gruppo = el('div', 'scheda-evento-legenda');
    gruppo.append(tx('strong', null, l.titolo));
    for (const v of l.voci) {
      const riga = el('div', v.attiva ? 'scheda-evento-voce is-on' : 'scheda-evento-voce');
      const casella = el('span', 'scheda-evento-casella');
      const segno = el('i', v.colore ? 'scheda-evento-punto' : 'scheda-evento-cerchio');
      if (v.colore) segno.style.background = v.colore;
      else segno.style.cssText = `width:${v.raggio * 2}px;height:${v.raggio * 2}px`;
      casella.append(segno);
      const testo = tx('span', null, v.testo);
      if (v.attiva && v.badge) { // la voce dell'evento è un badge: tinta della fascia d'età, o neutra per la magnitudo
        testo.className = 'scheda-evento-badge';
        testo.style.setProperty('--tinta', v.colore ?? 'currentColor');
        testo.textContent = v.badge;
      }
      riga.append(casella, testo);
      gruppo.append(riga);
    }
    box.append(gruppo);
  }
  return box;
}

// Scheda dell'evento sismico: titolo e zona, griglia di campi e legende (cerchi di magnitudo, colori del tempo)
function disegnaEvento(e) {
  const tx = (tag, classe, testo) => Object.assign(el(tag, classe), { textContent: testo }); // testi già tradotti: tl() non deve ritradurli
  const box = el('div', 'scheda-evento');
  const griglia = el('div', 'scheda-evento-campi');
  for (const c of e.campi) {
    const cella = el('div', 'scheda-evento-campo');
    const chiave = tx('span', 'scheda-evento-chiave', c.chiave);
    if (c.nota) chiave.append(' ', tx('small', null, c.nota));
    const valore = c.url ? Object.assign(tx('a', 'scheda-evento-valore', c.valore), { href: c.url, target: '_blank', rel: 'noopener' }) : tx('span', 'scheda-evento-valore', c.valore);
    cella.append(chiave, valore);
    griglia.append(cella);
  }
  box.append(griglia);
  box.append(disegnaLegendeEvento(e.legende));
  return box;
}

// `suRiga(elemento, nodo)`, se c'è, è chiamata per ogni elemento (per collegarvi eventi, come l'evidenza in mappa).
export function disegnaAccordion(a, suRiga = null) {
  const radice = el('details', 'scheda-acc');
  if (a.aperto) radice.open = true;
  const riassunto = el('summary');
  if (a.icona) riassunto.append(icona(a.icona));
  riassunto.append(tl(a.riassunto));
  radice.append(riassunto);
  if (a.suggerimento) radice.append(el('p', 'scheda-suggerimento', tl(a.suggerimento)));
  for (const e of a.elementi) {
    const tipo = el('details', 'scheda-tipo');
    const sommario = el('summary');
    sommario.append(el('span', 'scheda-tipo-nome', tl(e.titolo)));
    if (e.stato) sommario.append(el('em', 'scheda-tipo-stato', e.stato));
    if (e.anteprima) sommario.append(el('span', 'scheda-tipo-anteprima', e.anteprima));
    tipo.append(sommario);
    if (e.strato) tipo.dataset.strato = e.strato;
    for (const r of e.righe) tipo.append(disegnaRiga(r));
    if (e.miniatura) tipo.addEventListener('toggle', () => { if (tipo.open && !tipo.querySelector('.scheda-mini')) tipo.append(disegnaMiniatura(e.miniatura, e.titolo)); }); // le tessere si scaricano solo all'apertura
    suRiga?.(e, tipo);
    radice.append(tipo);
  }
  return radice;
}

function disegnaLink(l) {
  const a = el('a', 'scheda-link');
  collegamento(a, l.url);
  if (l.suggerimento) a.title = tl(l.suggerimento);
  const testo = el('span');
  if (l.icona) testo.append(icona(l.icona));
  testo.append(tl(l.testo));
  a.append(testo);
  if (l.etichetta) a.append(el('span', 'scheda-link-et', tl(l.etichetta)));
  return a;
}

const BREVI = [[/^Particella catastale/i, 'Catasto'], [/^Zonizzazione/i, 'PRG'], [/^Quotazioni OMI/i, 'OMI'], [/^Sezione di censimento/i, 'Censimento'], [/^Terreno/i, 'Terreno']];
function titoloBreve(t) {
  const m = BREVI.find(([re]) => re.test(t));
  return tl(m ? m[1] : t.replace(/\s*\(.*\)\s*$/, ''));
}

function riassunto(s) {
  const r = s.gruppi.flatMap(g => g.righe).find(x => x.valore && x.valore !== MANCANTE);
  if (!r) return '';
  const v = String(r.valore);
  return v.length > 26 ? v.slice(0, 25) + '…' : v;
}

// Interruttore «Mappa» nell'intestazione di una sezione: accende o spegne lo strato collegato. Passa dalla casella del
// pannello strati (`#strato-<id>`), unica fonte di verità, come fa la tab Argomenti.
export function sincronizzaStrato(b) {
  const origine = document.getElementById(`strato-${b.dataset.strato}`);
  b.hidden = !origine;
  b.disabled = !!origine?.disabled;
  b.setAttribute('aria-pressed', String(!!origine?.checked));
  b.title = origine?.disabled ? origine.title : origine?.checked ? tr('scheda.nascondiStrato') : tr('scheda.mostraStrato');
}

// strati accesi da un interruttore della scheda: si spengono quando la scheda si chiude
export const acceseDaScheda = new Set();

export function spegniStratiDaScheda() {
  for (const id of acceseDaScheda) {
    const origine = document.getElementById(`strato-${id}`);
    if (!origine?.checked) continue;
    origine.checked = false;
    origine.dispatchEvent(new Event('change', { bubbles: true }));
  }
  acceseDaScheda.clear();
}

export function creaInterruttoreStrato(id) {
  const b = el('button', 'scheda-strato', tr('scheda.mappa'));
  b.type = 'button';
  b.dataset.strato = id;
  b.addEventListener('click', () => {
    const origine = document.getElementById(`strato-${id}`);
    if (!origine || origine.disabled) return;
    origine.checked = !origine.checked;
    acceseDaScheda[origine.checked ? 'add' : 'delete'](id);
    origine.dispatchEvent(new Event('change', { bubbles: true }));
  });
  sincronizzaStrato(b);
  return b;
}

export function disegnaSezione(s, i) {
  const titolo = el('h3');
  if (s.icona) titolo.append(icona(s.icona));
  if (s.evento) { // nella scheda dell'evento l'intestazione porta il titolo grafico e la zona
    const testo = el('span', 'scheda-sez-testo');
    for (const [classe, valore] of [['scheda-evento-titolo', s.evento.titolo], ['scheda-evento-luogo', s.evento.luogo]]) testo.append(Object.assign(el('span', classe), { textContent: valore }));
    if (s.evento.badge) { // evento dell'archivio storico: l'anno in un badge
      const badge = Object.assign(el('span', 'tooltip-badge'), { textContent: s.evento.badge.testo });
      badge.style.setProperty('--colore', s.evento.badge.colore);
      testo.append(badge);
    }
    titolo.append(testo);
  }
  else titolo.append(tl(s.titolo));
  // badge a destra sulla riga del titolo, sotto di loro l'interruttore «Mappa» (aggiunto da scheda.js)
  const lato = el('div', 'scheda-sez-extra');
  for (const b of s.badges ?? (s.badge ? [s.badge] : [])) lato.append(el('span', 'scheda-tag', tl(b)));
  if (s.avviso) lato.append(el('span', 'scheda-tag scheda-tag--scomparso', tl(s.avviso.etichetta)));
  const corpo = [];
  if (s.avviso) corpo.push(el('p', 'scheda-avviso', tl(s.avviso.testo)));
  if (s.immagine) {
    const img = el('img', 'scheda-foto');
    img.src = s.immagine.url;
    img.alt = tl(s.immagine.alt);
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    corpo.push(img);
  }
  if (s.testo) corpo.push(el('p', 'scheda-testo', tl(s.testo)));
  if (s.evento && s.miniatura) corpo.push(disegnaMiniatura(s.miniatura, s.titolo)); // nella scheda dell'evento la mappa sta in cima
  if (s.evento) corpo.push(disegnaEvento(s.evento));
  corpo.push(...s.gruppi.map(disegnaGruppo));
  if (s.miniatura && !s.evento) corpo.push(disegnaMiniatura(s.miniatura, s.titolo));
  if (s.dinamico) corpo.push(s.dinamico()); // contenuto interattivo costruito dal layer (es. orari con selettore del giorno)
  if (s.accordion) corpo.push(disegnaAccordion(s.accordion));
  for (const l of [].concat(s.link ?? [])) corpo.push(disegnaLink(l));
  if (s.nota) corpo.push(el('p', 'scheda-nota', tl(s.nota)));
  for (const f of s.fonte?.split('\n') ?? []) corpo.push(el('p', 'scheda-nota scheda-fonte', tl(f)));

  const sezione = el('details', s.evento ? 'scheda-sez scheda-sez-evento' : 'scheda-sez');
  sezione.open = s.aperta !== false;
  if (s.tinta) { sezione.classList.add('scheda-sez-tinta'); sezione.style.setProperty('--tinta', s.tinta); } // sezione evidenziata (es. allerta in corso)
  sezione.dataset.peso = s.peso;
  const sommario = el('summary');
  sommario.append(titolo, lato);
  const sunto = riassunto(s);
  if (sunto) sommario.append(el('span', 'scheda-riassunto', sunto));
  sezione.append(sommario, ...corpo);
  sezione.dataset.chiave = s.chiave;
  sezione.dataset.titolo = s.titolo;
  if (s.strato) sezione.dataset.strato = s.strato;
  return sezione;
}
