import { t } from './i18n.js';
import { svgIcona } from './icone.js';

// Modale Info: foglio che sale dal basso con tre schede (Metodologia, Guida, Credits). Sta tra la barra/pannello di sinistra e la
// scheda/rail di destra: la posizione orizzontale è affidata al CSS (--sx e --scheda-l), come per la tabella dei dati, così segue
// i due pannelli quando si aprono e si chiudono. I testi sono HTML nostro nei dizionari (info.<scheda>.html).
const SCHEDE = ['metodologia', 'guida', 'credits'];
const SOGLIA_TORNA_SU = 80;

const el = (tag, classe, html) => {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (html != null) n.innerHTML = html;
  return n;
};

const bottone = (id, classe, html, etichetta) => {
  const b = el('button', classe, html);
  b.type = 'button';
  if (id) b.id = id;
  b.setAttribute('aria-label', etichetta);
  b.title = etichetta;
  return b;
};

export function collegaInfo({ bottone: comando } = {}) {
  if (!comando) return null;

  const radice = el('section');
  radice.id = 'info-modale';
  radice.hidden = true;
  radice.tabIndex = -1;
  radice.setAttribute('role', 'dialog');
  radice.setAttribute('aria-labelledby', 'info-titolo');

  const linguetta = bottone('info-linguetta', '', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>', t('info.chiudi'));

  const corpo = el('div', 'info-corpo');
  const testata = el('div', 'info-testata');
  const titolo = el('strong', 'info-titolo', t('info.titolo'));
  titolo.id = 'info-titolo';
  const chiudi = bottone('info-chiudi', '', svgIcona('chiudi', 16), t('info.chiudi'));
  testata.append(titolo, chiudi);

  const barra = el('div', 'info-schede');
  barra.setAttribute('role', 'tablist');
  barra.setAttribute('aria-label', t('info.schede'));
  const linguette = new Map();
  const pannelli = new Map();
  for (const nome of SCHEDE) {
    const b = el('button', 'info-scheda', t(`info.${nome}`));
    b.type = 'button';
    b.id = `info-tab-${nome}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `info-pannello-${nome}`);
    linguette.set(nome, b);
    barra.append(b);
    const p = el('div', 'info-pannello', t(`info.${nome}.html`));
    p.id = `info-pannello-${nome}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', b.id);
    p.tabIndex = 0;
    pannelli.set(nome, p);
  }

  const tornaSu = bottone('info-torna-su', '', '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>', t('info.tornaSu'));

  corpo.append(testata, barra, ...pannelli.values(), tornaSu);
  radice.append(linguetta, corpo);
  document.body.append(radice);

  let corrente = SCHEDE[0];
  let ultimoFuoco = null;
  const aperta = () => !radice.hidden;
  const pannelloAttivo = () => pannelli.get(corrente);

  const aggiornaTornaSu = () => tornaSu.classList.toggle('visibile', pannelloAttivo().scrollTop > SOGLIA_TORNA_SU);

  function mostra(nome) {
    corrente = nome;
    for (const [n, b] of linguette) {
      b.setAttribute('aria-selected', String(n === nome));
      b.tabIndex = n === nome ? 0 : -1;
      pannelli.get(n).hidden = n !== nome;
    }
    aggiornaTornaSu();
  }

  function apri(nome = corrente) {
    ultimoFuoco = document.activeElement;
    mostra(nome);
    radice.hidden = false;
    // un frame dopo l'inserimento, così la transizione parte dal basso
    requestAnimationFrame(() => requestAnimationFrame(() => radice.classList.add('aperto')));
    document.body.classList.add('info-modale');
    comando.setAttribute('aria-pressed', 'true');
    linguette.get(corrente).focus({ preventScroll: true });
  }

  function chiudiModale() {
    if (!aperta()) return;
    radice.classList.remove('aperto');
    document.body.classList.remove('info-modale');
    comando.setAttribute('aria-pressed', 'false');
    const nascondi = () => { if (!radice.classList.contains('aperto')) radice.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) nascondi();
    else radice.addEventListener('transitionend', nascondi, { once: true });
    setTimeout(nascondi, 600);
    ultimoFuoco?.focus?.({ preventScroll: true });
  }

  comando.addEventListener('click', () => (aperta() && radice.classList.contains('aperto') ? chiudiModale() : apri()));
  chiudi.addEventListener('click', chiudiModale);
  linguetta.addEventListener('click', chiudiModale);

  barra.addEventListener('click', e => {
    const b = e.target.closest('.info-scheda');
    if (b) mostra(SCHEDE[[...linguette.values()].indexOf(b)]);
  });
  barra.addEventListener('keydown', e => {
    const i = SCHEDE.indexOf(corrente);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SCHEDE.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const nome = SCHEDE[(n + SCHEDE.length) % SCHEDE.length];
    mostra(nome);
    linguette.get(nome).focus();
  });

  for (const p of pannelli.values()) p.addEventListener('scroll', aggiornaTornaSu, { passive: true });
  tornaSu.addEventListener('click', () => pannelloAttivo().scrollTo({ top: 0, behavior: 'smooth' }));

  // in cattura: Esc chiude il modale prima degli altri gestori (pannelli, tabella, ricerca)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && aperta()) { e.stopImmediatePropagation(); chiudiModale(); }
  }, true);

  mostra(corrente);
  return { apri, chiudi: chiudiModale, mostra };
}
