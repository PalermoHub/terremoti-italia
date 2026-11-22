// Pannello «Mappe» nel rail di destra: i controlli delle mappe dei terremoti (sezione verticale, profondità, densità,
// per territorio) in un posto solo, un tab per mappa. Ogni mappa è uno strato: scegliere il tab lo accende, accendere lo
// strato dalla lista dei layer apre il pannello su quel tab. Le mappe si escludono a vicenda: accenderne una spegne le altre,
// così non restano in vista i dati della precedente, e spegne anche i terremoti in tempo reale (che l'utente può riaccendere
// dalla lista dei layer, anche con una mappa accesa). Si chiude con la X (gli strati restano accesi).
import { t } from './i18n.js';
import { el } from './scheda-disegno.js';

const ICONA_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const STRATO_TEMPO_REALE = 'terremoti';
const casella = id => document.querySelector(`#strato-${id}`);
const accendi = id => {
  const c = casella(id);
  if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
};

const spegni = id => {
  const c = casella(id);
  if (c?.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }
};

// voci: [{ id (id dello strato), etichetta, nodo }]; ritorna { apri(), seleziona(id) }
export function collegaMappe(pannello, voci) {
  const x = el('button', 'scheda-x');
  x.type = 'button';
  x.title = t('scheda.chiudi');
  x.setAttribute('aria-label', t('scheda.chiudi'));
  x.innerHTML = ICONA_X;
  const riga = el('div', 'scheda-testata');
  riga.append(el('h2', null, t('mappe.titolo')), x);
  const tab = el('div', 'mappe-tab');
  tab.setAttribute('role', 'tablist');
  const corpo = el('div', 'scheda-corpo');
  const testata = el('header', 'scheda-intestazione');
  testata.append(riga, tab);
  const bottoni = new Map();
  let corrente = voci[0]?.id;
  // Pulsante «Terremoti in tempo reale»: riaccende (o spegne) lo strato che accendere una mappa ha spento
  const tempoReale = el('button', 'mappe-tab-btn mappe-tempo-reale');
  tempoReale.type = 'button';
  const allineaTempoReale = () => {
    const acceso = !!casella(STRATO_TEMPO_REALE)?.checked;
    tempoReale.setAttribute('aria-pressed', String(acceso));
    tempoReale.textContent = t('mappe.tempoReale.etichetta');
    tempoReale.title = t(acceso ? 'mappe.tempoReale.spegni' : 'mappe.tempoReale.riaccendi');
  };
  tempoReale.addEventListener('click', () => { const c = casella(STRATO_TEMPO_REALE); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); } });

  const mostra = () => {
    for (const v of voci) {
      bottoni.get(v.id).setAttribute('aria-selected', String(v.id === corrente));
      if (v.nodo) v.nodo.hidden = v.id !== corrente;
    }
  };
  // `nuova` = la mappa si accende adesso (non è solo il pannello che si riapre su una già accesa): si spengono anche i terremoti in tempo reale
  const seleziona = (id, acceso = true, nuova = acceso) => {
    corrente = id;
    mostra();
    for (const v of voci) if (v.id !== id) spegni(v.id);
    if (nuova) spegni(STRATO_TEMPO_REALE);
    if (acceso) accendi(id);
  };
  for (const v of voci) {
    const b = el('button', 'mappe-tab-btn', v.etichetta);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { pannello.hidden = false; seleziona(v.id); });
    bottoni.set(v.id, b);
    tab.append(b);
    if (v.nodo) corpo.append(v.nodo);
  }
  tab.append(tempoReale); // ultimo della riga: come i tab, ma è un interruttore e non sceglie una mappa
  pannello.replaceChildren(testata, corpo);
  mostra();
  allineaTempoReale();
  x.addEventListener('click', () => { pannello.hidden = true; });
  // accendendo uno strato dalla lista dei layer il pannello si apre sul suo tab
  document.addEventListener('change', e => {
    if (e.target.matches?.(`#strato-${STRATO_TEMPO_REALE}`)) allineaTempoReale();
    const v = voci.find(o => e.target.matches?.(`#strato-${o.id}`));
    if (v && e.target.checked) { pannello.hidden = false; seleziona(v.id, false, true); } // spegne le altre mappe e il tempo reale
  });
  return {
    // dal rail: apre il pannello e, se nessuna mappa è accesa, accende quella del tab corrente
    apri() {
      pannello.hidden = false;
      if (!voci.some(v => casella(v.id)?.checked)) accendi(corrente);
      else seleziona(voci.find(v => casella(v.id)?.checked).id, false);
    },
  };
}
