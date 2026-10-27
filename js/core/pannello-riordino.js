// Riordino degli strati: trascinamento, frecce e pulsanti dentro i gruppi, e scheda «Ordine layer in mappa».
import { svgIcona } from './icone.js';
import { ordina, mosseMappa, mosseSequenza, applicaMosse, leggiOrdine, salvaOrdine, azzeraOrdine, ordineStrati, mosseVicino, vicinoVisibile, mosseOrdine, leggiOrdineDisegno, salvaOrdineDisegno, azzeraOrdineDisegno } from './riordino.js';
import { EVENTO_DISEGNO, EVENTO_GRUPPO, ETICHETTE, intestazione } from './pannello-comune.js';
import { t } from './i18n.js';

// Blocchi di un gruppo: ogni strato con ciò che lo segue (opacità, filtri, albero) fino allo strato o al titolo di sezione
// successivi. Il titolo di sezione viaggia con lo strato che lo segue, così gli strati si spostano in tutto il gruppo.
// Un titolo con `data-fissa` (es. AMAT e RFI nel trasporto) non viaggia: resta dov'è e divide il gruppo in sezioni (`sez`),
// e gli strati si riordinano solo dentro la propria sezione.
function blocchi(gruppo) {
  const r = [];
  let corrente = null;
  let titoli = [];
  let sez = 0;
  for (const n of gruppo.children) {
    if (n.matches('label.strato, .rndt-gruppo-riga')) { // la riga RNDT affianca al label il pulsante «Rimuovi»
      const casella = n.querySelector('input[type=checkbox]');
      r.push(corrente = { riga: n, nodi: [...titoli, n], id: casella?.id.replace(/^strato-/, '') ?? '', sez });
      titoli = [];
    } else if (n.matches('h3.gruppo-sezione')) {
      if (n.dataset.fissa !== undefined) sez++; else titoli.push(n);
      corrente = null;
    } else if (n.matches('h4.gruppo-sottosezione')) {
      titoli.push(n);
      corrente = null;
    } else if (corrente) corrente.nodi.push(n);
  }
  return r;
}
// I blocchi raggruppati per sezione, nell'ordine in cui compaiono.
const perSezione = tutti => {
  const gruppi = new Map();
  for (const b of tutti) gruppi.set(b.sez, [...(gruppi.get(b.sez) ?? []), b]);
  return [...gruppi.values()];
};
// Rimette i blocchi di ogni sezione nell'ordine dato da `ordinaSezione(blocchiDellaSezione)`, senza uscire dalla sezione.
function disponi(gruppo, ordinaSezione) {
  for (const sezione of perSezione(blocchi(gruppo))) {
    let dopo = sezione[0].nodi[0].previousElementSibling;
    for (const b of ordinaSezione(sezione)) { dopo.after(...b.nodi); dopo = b.nodi.at(-1); }
  }
}
// Parti del blocco che si ripiegano: tutto tranne titolo, riga dello strato e suo cursore di opacità.
const ramo = b => b.nodi.slice(b.nodi.indexOf(b.riga) + 1).filter(n => !n.classList.contains('strato-opacita'));

function bottoneAzione(azione, titolo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `strato-btn strato-btn--${azione}`;
  b.dataset.azione = azione;
  b.title = titolo;
  b.setAttribute('aria-label', titolo);
  return b;
}

// Albero ripiegabile e strati riordinabili (frecce o trascinamento) di un gruppo del pannello.
// In alto nell'elenco = sopra sulla mappa; l'ordine scelto resta salvato nel browser.
// Con `daElenco` il gruppo si ridisegna a ogni cambio (RNDT): «Ripristina ordine» torna all'ordine dell'elenco.
export function abilitaRiordino(map, gruppo, layersDi, storage, { daElenco = false } = {}) {
  const idGruppo = gruppo.id;
  const iniziali = blocchi(gruppo);
  if (!iniziali.length) return;
  const stackIniziale = () => map.getStyle().layers.map(l => l.id);
  const layersGruppo = () => iniziali.flatMap(b => layersDi.get(b.id) ?? []);
  const originale = (() => { const s = new Set(layersGruppo()); return stackIniziale().filter(id => s.has(id)); })();
  const ordineIniziale = iniziali.map(b => b.id);

  const impostaRamo = (b, chiuso) => {
    for (const n of ramo(b)) n.classList.toggle('albero-chiuso', chiuso);
    b.riga.dataset.albero = chiuso ? 'chiuso' : 'aperto';
    b.riga.querySelector('[data-azione=albero]')?.setAttribute('aria-expanded', String(!chiuso));
  };
  const aggiornaStrumenti = () => {
    const aperti = blocchi(gruppo).some(b => ramo(b).length && b.riga.dataset.albero !== 'chiuso');
    if (tutto) tutto.textContent = aperti ? t('riordino.comprimi') : t('riordino.espandi');
  };
  const aggiornaFrecce = () => {
    for (const sezione of perSezione(blocchi(gruppo))) {
      for (const [i, b] of sezione.entries()) {
        b.riga.querySelector('[data-azione=su]').disabled = i === 0;
        b.riga.querySelector('[data-azione=giu]').disabled = i === sezione.length - 1;
        // da solo nel gruppo (o nella sezione) non c'è nulla da spostare
        for (const a of ['su', 'giu', 'trascina']) b.riga.querySelector(`[data-azione=${a}]`).hidden = sezione.length < 2;
      }
    }
  };
  const salvaEMappa = () => {
    const tutti = blocchi(gruppo);
    salvaOrdine(storage, idGruppo, tutti.map(b => b.id));
    applicaMosse(map, mosseMappa(stackIniziale(), tutti.map(b => layersDi.get(b.id) ?? [])));
    aggiornaFrecce();
    document.dispatchEvent(new CustomEvent(EVENTO_GRUPPO));
  };
  // l'«Ordine layer in mappa» ha cambiato lo stack: gli strati del gruppo si rimettono nell'ordine in cui sono disegnati
  const sincronizza = () => {
    const tutti = blocchi(gruppo);
    if (tutti.length < 2) return;
    const indice = new Map(stackIniziale().map((id, i) => [id, i]));
    const cima = b => Math.max(-1, ...(layersDi.get(b.id) ?? []).filter(id => indice.has(id)).map(id => indice.get(id)));
    if (tutti.some(b => cima(b) < 0)) return;
    const perStack = sezione => sezione.map((b, i) => ({ b, i, k: cima(b) })).sort((x, y) => y.k - x.k || x.i - y.i).map(x => x.b);
    if (perSezione(tutti).every(sezione => perStack(sezione).every((b, i) => b === sezione[i]))) return;
    disponi(gruppo, perStack);
    aggiornaFrecce();
  };
  if (!daElenco) document.addEventListener(EVENTO_DISEGNO, sincronizza);
  // sposta il blocco di `verso` posizioni (-1 su, +1 giù); false se non può
  const muovi = (riga, verso) => {
    const tutti = blocchi(gruppo);
    const b = tutti.find(x => x.riga === riga);
    const vicino = tutti[tutti.indexOf(b) + verso];
    if (!vicino || vicino.sez !== b.sez) return false; // mai oltre il titolo fisso di una sezione
    if (verso < 0) vicino.nodi[0].before(...b.nodi);
    else vicino.nodi.at(-1).after(...b.nodi);
    return true;
  };

  // controlli su ogni riga strato (la casella a tutta riga resta sotto: i pulsanti stanno sopra)
  for (const b of iniziali) {
    const azioni = document.createElement('span');
    azioni.className = 'strato-azioni';
    const nome = b.riga.textContent.trim();
    const su = bottoneAzione('su', t('riordino.su', { nome }));
    const giu = bottoneAzione('giu', t('riordino.giu', { nome }));
    const maniglia = bottoneAzione('trascina', t('riordino.trascina'));
    maniglia.removeAttribute('aria-label');
    maniglia.setAttribute('aria-hidden', 'true');
    maniglia.tabIndex = -1;
    if (ramo(b).length) {
      const albero = bottoneAzione('albero', t('riordino.albero'));
      albero.setAttribute('aria-expanded', 'true');
      albero.addEventListener('click', e => { e.preventDefault(); impostaRamo(b, b.riga.dataset.albero !== 'chiuso'); aggiornaStrumenti(); });
      azioni.append(albero);
    }
    su.addEventListener('click', e => { e.preventDefault(); if (muovi(b.riga, -1)) salvaEMappa(); });
    giu.addEventListener('click', e => { e.preventDefault(); if (muovi(b.riga, 1)) salvaEMappa(); });
    maniglia.addEventListener('pointerdown', e => {
      e.preventDefault();
      const prima = blocchi(gruppo).map(x => x.id).join();
      b.riga.classList.add('trascinato');
      const segui = ev => {
        const meta = x => { const r = x.riga.getBoundingClientRect(); return r.top + r.height / 2; };
        for (let passi = 0; passi < 50; passi++) { // un movimento rapido può scavalcare più strati
          const tutti = blocchi(gruppo);
          const i = tutti.findIndex(x => x.riga === b.riga);
          // le righe nascoste (sottogruppo chiuso) non hanno posizione: ci si confronta col primo vicino visibile
          const visibile = x => x.riga.offsetParent !== null;
          const su = vicinoVisibile(tutti, i, -1, visibile), giu = vicinoVisibile(tutti, i, 1, visibile);
          const mosso = su && ev.clientY < meta(su) ? muovi(b.riga, -1)
            : giu && ev.clientY > meta(giu) ? muovi(b.riga, 1) : false;
          if (!mosso) break; // fermi, o al confine di una sezione fissa: niente da rifare a ogni movimento
        }
      };
      const fine = () => {
        document.removeEventListener('pointermove', segui);
        document.removeEventListener('pointerup', fine);
        document.removeEventListener('pointercancel', fine);
        b.riga.classList.remove('trascinato');
        if (blocchi(gruppo).map(x => x.id).join() !== prima) salvaEMappa();
      };
      // sul document: spostando i nodi la maniglia si stacca dal DOM e perderebbe i suoi eventi
      document.addEventListener('pointermove', segui);
      document.addEventListener('pointerup', fine);
      document.addEventListener('pointercancel', fine);
    });
    azioni.append(su, giu, maniglia);
    const togli = b.riga.querySelector('.rndt-gruppo-togli');
    if (togli) togli.before(azioni); else b.riga.append(azioni);
  }

  // strumenti del gruppo: comprimi/espandi tutto e, con più strati, ripristino dell'ordine
  const barra = document.createElement('div');
  barra.className = 'strato-strumenti';
  const conRami = iniziali.some(b => ramo(b).length);
  const riordinabile = iniziali.length > 1;
  let tutto = null;
  if (conRami) {
    tutto = document.createElement('button');
    tutto.type = 'button';
    tutto.className = 'strato-strumento';
    tutto.dataset.azione = 'tutto';
    tutto.addEventListener('click', () => {
      const chiudi = blocchi(gruppo).some(b => ramo(b).length && b.riga.dataset.albero !== 'chiuso');
      for (const b of blocchi(gruppo)) if (ramo(b).length) impostaRamo(b, chiudi);
      aggiornaStrumenti();
    });
    barra.append(tutto);
  }
  if (riordinabile) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'strato-strumento';
    reset.dataset.azione = 'ripristina';
    reset.textContent = t('riordino.ripristina');
    reset.addEventListener('click', () => {
      disponi(gruppo, sezione => [...sezione].sort((x, y) => ordineIniziale.indexOf(x.id) - ordineIniziale.indexOf(y.id)));
      azzeraOrdine(storage, idGruppo);
      applicaMosse(map, daElenco ? mosseMappa(stackIniziale(), blocchi(gruppo).map(b => layersDi.get(b.id) ?? [])) : mosseSequenza(stackIniziale(), originale));
      aggiornaFrecce();
      document.dispatchEvent(new CustomEvent(EVENTO_GRUPPO));
    });
    barra.append(reset);
  }
  if (barra.children.length) intestazione(gruppo).after(barra);

  // ordine salvato in una visita precedente
  const salvato = leggiOrdine(storage)[idGruppo];
  if (Array.isArray(salvato) && riordinabile) {
    disponi(gruppo, sezione => {
      const per = new Map(sezione.map(b => [b.id, b]));
      return ordina(sezione.map(b => b.id), salvato).map(id => per.get(id));
    });
    applicaMosse(map, mosseMappa(stackIniziale(), blocchi(gruppo).map(b => layersDi.get(b.id) ?? [])));
  }
  aggiornaFrecce();
  aggiornaStrumenti();
}

// Sezione «Ordine layer in mappa» del tab Layer: tutti gli strati accesi, di qualsiasi gruppo, in un unico elenco.
// In alto = sopra sulla mappa; frecce e trascinamento lo cambiano, l'ordine resta salvato nel browser.
export function creaOrdineDisegno(map, moduli, storage, iniziale) {
  // gli strati dei gruppi dinamici (RNDT, «I miei layer») arrivano a runtime: l'elenco si rilegge a ogni ridisegno
  // (stessa lista e stessa mappa, così chi li ha ricevuti vede sempre quelli aggiornati)
  const strati = [];
  const per = new Map();
  const aggiornaStrati = () => {
    strati.splice(0, strati.length, ...moduli.flatMap(m => m.strati.map(s => ({ id: s.id, etichetta: s.etichetta, layers: s.layers ?? [], da: ETICHETTE[m.gruppo ?? m.id] ?? m.titolo }))));
    per.clear();
    for (const s of strati) per.set(s.id, s);
  };
  aggiornaStrati();
  const stack = () => map.getStyle().layers.map(l => l.id);
  const attivo = id => document.getElementById(`strato-${id}`)?.checked;

  const el = document.createElement('details');
  el.id = 'ordine-disegno';
  el.className = 'layer-sezione ordine-strumento'; // una scheda con l'accento: è uno strumento, non un gruppo di strati
  const sommario = document.createElement('summary');
  const icona = document.createElement('span');
  icona.className = 'ordine-ico';
  icona.innerHTML = svgIcona('ordine', 20);
  const testi = document.createElement('span');
  testi.className = 'ordine-testi';
  const h = document.createElement('h2');
  h.textContent = t('riordino.titolo');
  const sotto = document.createElement('small');
  sotto.className = 'ordine-sotto';
  const conta = document.createElement('span');
  conta.className = 'ordine-conta';
  testi.append(h, sotto);
  sommario.append(icona, testi, conta);
  const elenco = document.createElement('div');
  elenco.className = 'ordine-elenco';
  const nota = document.createElement('p');
  nota.className = 'ordine-nota';
  nota.textContent = t('riordino.nota');
  const barra = document.createElement('div');
  barra.className = 'strato-strumenti';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'strato-strumento';
  reset.dataset.azione = 'ripristina-disegno';
  reset.textContent = t('riordino.ripristina');
  barra.append(reset);
  el.append(sommario, nota, elenco, barra);

  const righe = () => [...elenco.querySelectorAll(':scope > .ordine-riga')];
  const salva = () => salvaOrdineDisegno(storage, ordineStrati(stack(), strati));
  const aggiornaFrecce = () => {
    const r = righe();
    r.forEach((riga, i) => {
      riga.querySelector('[data-azione=su]').disabled = i === 0;
      riga.querySelector('[data-azione=giu]').disabled = i === r.length - 1;
      for (const a of ['su', 'giu', 'trascina']) riga.querySelector(`[data-azione=${a}]`).hidden = r.length < 2;
    });
  };
  // la testata (contatore e sottotitolo) è sempre aggiornata, anche a scheda chiusa
  const aggiornaTestata = () => {
    aggiornaStrati();
    const n = ordineStrati(stack(), strati).filter(attivo).length;
    conta.textContent = String(n);
    conta.hidden = n === 0;
    sotto.textContent = n < 2 ? t('riordino.accendi2') : t('riordino.suggerimento');
  };
  const ridisegna = () => {
    aggiornaTestata();
    const ids = ordineStrati(stack(), strati).filter(attivo);
    elenco.replaceChildren(...ids.map(id => riga(per.get(id))));
    nota.hidden = elenco.hidden = !ids.length;
    barra.hidden = !ids.length;
    aggiornaFrecce();
  };
  // la riga appena spostata va subito sopra lo strato che ora la segue (o, se è l'ultima, subito sotto quello che la precede)
  const applica = rigaMossa => {
    const r = righe();
    const i = r.indexOf(rigaMossa);
    const mio = per.get(rigaMossa.dataset.id).layers;
    const mosse = i < r.length - 1
      ? mosseVicino(stack(), mio, per.get(r[i + 1].dataset.id).layers, true)
      : i > 0 ? mosseVicino(stack(), mio, per.get(r[i - 1].dataset.id).layers, false) : [];
    applicaMosse(map, mosse);
    salva();
    aggiornaFrecce();
    document.dispatchEvent(new CustomEvent(EVENTO_DISEGNO));
  };
  const muovi = (r, verso) => {
    const vicina = verso < 0 ? r.previousElementSibling : r.nextElementSibling;
    if (!vicina) return false;
    if (verso < 0) vicina.before(r); else vicina.after(r);
    return true;
  };
  function riga(s) {
    const r = document.createElement('div');
    r.className = 'ordine-riga';
    r.dataset.id = s.id;
    const nome = document.createElement('span');
    nome.className = 'ordine-nome';
    nome.textContent = s.etichetta;
    const da = document.createElement('small');
    da.textContent = s.da;
    nome.append(da);
    const azioni = document.createElement('span');
    azioni.className = 'strato-azioni';
    const su = bottoneAzione('su', t('riordino.su', { nome: s.etichetta }));
    const giu = bottoneAzione('giu', t('riordino.giu', { nome: s.etichetta }));
    const maniglia = bottoneAzione('trascina', t('riordino.trascina'));
    maniglia.removeAttribute('aria-label');
    maniglia.setAttribute('aria-hidden', 'true');
    maniglia.tabIndex = -1;
    su.addEventListener('click', () => { if (muovi(r, -1)) applica(r); });
    giu.addEventListener('click', () => { if (muovi(r, 1)) applica(r); });
    maniglia.addEventListener('pointerdown', e => {
      e.preventDefault();
      const prima = righe().indexOf(r);
      r.classList.add('trascinato');
      const segui = ev => {
        const meta = x => { const b = x.getBoundingClientRect(); return b.top + b.height / 2; };
        for (let passi = 0; passi < 50; passi++) {
          const su_ = r.previousElementSibling;
          const giu_ = r.nextElementSibling;
          if (su_ && ev.clientY < meta(su_)) muovi(r, -1);
          else if (giu_ && ev.clientY > meta(giu_)) muovi(r, 1);
          else break;
        }
      };
      const fine = () => {
        document.removeEventListener('pointermove', segui);
        document.removeEventListener('pointerup', fine);
        document.removeEventListener('pointercancel', fine);
        r.classList.remove('trascinato');
        if (righe().indexOf(r) !== prima) applica(r);
      };
      document.addEventListener('pointermove', segui);
      document.addEventListener('pointerup', fine);
      document.addEventListener('pointercancel', fine);
    });
    azioni.append(su, giu, maniglia);
    r.append(nome, azioni);
    return r;
  }

  reset.addEventListener('click', () => {
    // prima i gruppi tornano al loro ordine, poi lo stack all'ordine di partenza di tutti gli strati
    for (const b of document.querySelectorAll('#pannello [data-azione=ripristina]')) b.click();
    azzeraOrdineDisegno(storage);
    applicaMosse(map, mosseOrdine(stack(), strati, iniziale));
    ridisegna();
    document.dispatchEvent(new CustomEvent(EVENTO_DISEGNO));
  });
  document.addEventListener(EVENTO_GRUPPO, () => { salva(); ridisegna(); });
  el.addEventListener('toggle', () => { if (el.open) ridisegna(); });
  // un layer che si accende, si spegne, arriva o parte (anche dai gruppi dinamici) aggiorna l'elenco se è aperto
  document.addEventListener('change', () => { if (el.open) ridisegna(); else aggiornaTestata(); }, true);
  aggiornaTestata();
  return {
    el,
    ridisegna,
    aggiornaTestata,
    // ordine salvato in una visita precedente
    ripristinaSalvato: () => {
      const salvato = leggiOrdineDisegno(storage);
      if (!salvato) return;
      applicaMosse(map, mosseOrdine(stack(), strati, salvato));
      document.dispatchEvent(new CustomEvent(EVENTO_DISEGNO));
    },
    strati,
  };
}
