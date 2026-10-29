// Pannello «Mappe» nel rail di destra: i controlli delle mappe dei terremoti (sezione verticale, profondità, densità,
// per territorio) in un posto solo, un tab per mappa. Ogni mappa è uno strato: scegliere il tab lo accende, accendere lo
// strato dalla lista dei layer apre il pannello su quel tab. Si chiude con la X (gli strati restano accesi).
import { t } from './i18n.js';
import { el } from './scheda-disegno.js';

const ICONA_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const casella = id => document.querySelector(`#strato-${id}`);
const accendi = id => {
  const c = casella(id);
  if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
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

  const mostra = () => {
    for (const v of voci) {
      bottoni.get(v.id).setAttribute('aria-selected', String(v.id === corrente));
      if (v.nodo) v.nodo.hidden = v.id !== corrente;
    }
  };
  const seleziona = (id, acceso = true) => {
    corrente = id;
    mostra();
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
  pannello.replaceChildren(testata, corpo);
  mostra();
  x.addEventListener('click', () => { pannello.hidden = true; });
  // accendendo uno strato dalla lista dei layer il pannello si apre sul suo tab
  document.addEventListener('change', e => {
    const v = voci.find(o => e.target.matches?.(`#strato-${o.id}`));
    if (v && e.target.checked) { pannello.hidden = false; seleziona(v.id, false); }
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
