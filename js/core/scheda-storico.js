// Pannello «Storico»: ospita le sezioni dei terremoti dell'archivio, che la scheda gli passa con l'evento `scheda:storico`.
// Si apre dal clic su un evento storico (o dal suo bottone nel rail); si chiude con la X o quando la scheda si chiude.
import { t } from './i18n.js';
import { el } from './scheda-disegno.js';

const ICONA_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const CASELLA_ARCHIVIO = '#strato-terremoti-storico';

// Accende lo strato «Terremoti storici (archivio)»: la sua legenda permette di scegliere l'anno, poi un clic su un cerchio apre qui l'evento.
export function apriArchivio() {
  const casella = document.querySelector(CASELLA_ARCHIVIO);
  if (!casella) return false;
  if (!casella.checked) { casella.checked = true; casella.dispatchEvent(new Event('change', { bubbles: true })); }
  return true;
}

export function collegaStorico(pannello) {
  const titolo = el('h2', null, t('scheda.tab.storico'));
  const x = el('button', 'scheda-x');
  x.type = 'button';
  x.title = t('scheda.chiudi');
  x.setAttribute('aria-label', t('scheda.chiudi'));
  x.innerHTML = ICONA_X;
  const riga = el('div', 'scheda-testata');
  riga.append(titolo, x);
  const testata = el('header', 'scheda-intestazione');
  testata.append(riga);
  const corpo = el('div', 'scheda-corpo');
  // Alla prima apertura il pannello spiega come arrivare a un evento storico: prima c'era solo il titolo, e il tab sembrava vuoto.
  const vuoto = el('div', 'scheda-vuoto-storico');
  const spiegazione = el('p', 'scheda-nota', t('storico.vuoto'));
  const apri = el('button', 'scheda-filtro', t('storico.apriArchivio'));
  apri.type = 'button';
  apri.addEventListener('click', apriArchivio);
  vuoto.append(spiegazione, apri);
  corpo.append(vuoto);
  pannello.replaceChildren(testata, corpo);

  const chiudi = () => { pannello.hidden = true; };
  x.addEventListener('click', chiudi);
  document.addEventListener('scheda:chiusa', chiudi);
  let conSezioni = false; // il pannello mostra un evento dell'archivio (non le istruzioni)
  document.addEventListener('scheda:storico', e => {
    const sezioni = e.detail.sezioni;
    if (!sezioni.length) {
      // una scheda normale non svuota le istruzioni appena aperte; ma se c'era un evento storico, non lo lascia appeso
      if (conSezioni) { conSezioni = false; corpo.replaceChildren(vuoto); pannello.hidden = true; }
      return;
    }
    conSezioni = true;
    for (const sz of sezioni) sz.hidden = false;
    corpo.replaceChildren(...sezioni);
    corpo.scrollTop = 0;
    pannello.hidden = false;
  });
  // Il tab del rail apre sempre il pannello: se non c'è un evento scelto, mostra le istruzioni (e il pulsante per accendere l'archivio)
  return { apri: () => { pannello.hidden = false; } };
}
