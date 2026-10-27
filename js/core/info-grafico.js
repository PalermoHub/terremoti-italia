// Icona «i» accanto al titolo di un grafico: apre un popup che spiega cosa rappresenta e come funziona.
// I testi stanno in js/locales/*.json come `info.<id>.titolo|cosa|come|leggere`; la stessa spiegazione va anche nella guida di Talia.
import { t } from './i18n.js';

const SEZIONI = ['cosa', 'come', 'leggere'];

function apriPopup(id) {
  const finestra = document.createElement('dialog');
  finestra.className = 'info-grafico-popup';
  finestra.setAttribute('aria-label', t(`info.${id}.titolo`));
  const titolo = document.createElement('h3');
  titolo.textContent = t(`info.${id}.titolo`);
  finestra.append(titolo);
  for (const s of SEZIONI) {
    const p = document.createElement('p');
    const et = document.createElement('strong');
    et.textContent = t(`info.sezione.${s}`);
    p.append(et, document.createElement('br'), t(`info.${id}.${s}`));
    finestra.append(p);
  }
  const chiudi = document.createElement('button');
  chiudi.type = 'button';
  chiudi.className = 'info-grafico-chiudi';
  chiudi.textContent = t('info.chiudi');
  chiudi.addEventListener('click', () => finestra.close());
  finestra.append(chiudi);
  finestra.addEventListener('click', e => { if (e.target === finestra) finestra.close(); }); // clic sullo sfondo
  finestra.addEventListener('close', () => finestra.remove());
  document.body.append(finestra);
  finestra.showModal();
}

// Pulsante «i» per il grafico `id`
export function iconaInfo(id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'info-grafico';
  b.textContent = 'i';
  const et = t('info.apri', { grafico: t(`info.${id}.titolo`) });
  b.title = et;
  b.setAttribute('aria-label', et);
  b.addEventListener('click', e => { e.stopPropagation(); apriPopup(id); });
  return b;
}

// Popup grande con il grafico ridisegnato in più dettaglio. `rifai(chiudi)` restituisce il grafico (`chiudi` serve a chi, cliccando un punto, lascia il popup).
export function apriGrande(titolo, rifai) {
  const finestra = document.createElement('dialog');
  finestra.className = 'grafico-grande-popup';
  finestra.setAttribute('aria-label', titolo);
  const chiudi = document.createElement('button');
  chiudi.type = 'button';
  chiudi.className = 'info-grafico-chiudi';
  chiudi.textContent = t('info.chiudi');
  const esci = () => finestra.close();
  chiudi.addEventListener('click', esci);
  finestra.append(rifai(esci), chiudi);
  finestra.addEventListener('click', e => { if (e.target === finestra) finestra.close(); });
  finestra.addEventListener('close', () => finestra.remove());
  document.body.append(finestra);
  finestra.showModal();
}

// Pulsante che apre il grafico in grande (nascosto dal CSS sotto il desktop)
function iconaIngrandisci(testo, suClic) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ingrandisci-grafico';
  b.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9.5 2H14v4.5M6.5 14H2V9.5M14 2 9 7M2 14l5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const et = t('info.ingrandisci', { grafico: testo });
  b.title = et;
  b.setAttribute('aria-label', et);
  b.addEventListener('click', e => { e.stopPropagation(); suClic(); });
  return b;
}

// Intestazione di un grafico: testo e icona sulla stessa riga. `tag`/`classe` = elemento da usare.
// `suIngrandisci` (facoltativo) aggiunge il pulsante «ingrandisci», visibile solo su desktop.
export function titoloConInfo(tag, classe, testo, id, suIngrandisci) {
  const h = document.createElement(tag);
  h.className = `${classe ?? ''} titolo-con-info`.trim();
  const s = document.createElement('span');
  s.textContent = testo;
  h.append(s, iconaInfo(id));
  if (suIngrandisci) h.append(iconaIngrandisci(testo, suIngrandisci));
  return h;
}
