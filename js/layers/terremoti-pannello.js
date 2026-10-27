// Pannello «Filtro sulla mappa» nella legenda dei terremoti: serie temporale (eventi per giorno) con slider a due maniglie e istogramma di magnitudo a classi cliccabili.
// Scrive nel filtro condiviso (`finestra`, `classi`) e avvisa con EVENTO_FILTRO: mappa, menu ed elenco si aggiornano da soli.
import { t, localeIntl } from '../core/i18n.js';
import { GIORNI_MAX, CLASSI_MAG, filtro, intervallo, eventiPerGiorno, eventiPerClasse, prossimaFinestra } from './scheda-terremoti.js';
import { titoloConInfo } from '../core/info-grafico.js';
import { EVENTO_FILTRO } from './scheda-terremoti-dom.js';

const PASSO_RIPRODUZIONE_MS = 700;
const GIORNO_MS = 86400000;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

// Icone dei comandi (stesso tratto delle altre iconcine del sito)
const svg = tracciato => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tracciato}</svg>`;
const ICONE = { riproduci: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'), pausa: svg('<path d="M8 5v14M16 5v14"/>'), azzera: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>'), grafici: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>') };
function comando(el, nome, etichetta) {
  el.innerHTML = ICONE[nome];
  el.title = etichetta;
  el.setAttribute('aria-label', etichetta);
}

const nomeClasse = c => (c.a === Infinity ? `≥ ${c.da}` : `${c.da}–${c.a}`);
const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short' });
const emetti = () => document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));

// `eventi()` = eventi scaricati (tutti i 30 giorni). Restituisce { nodo, aggiorna, ferma }.
export function pannelloFiltro(eventi) {
  const nodo = el('div', 'terremoti-pannello');

  // serie temporale + slider
  const barre = el('div', 'terremoti-pf-barre');
  const colonne = Array.from({ length: GIORNI_MAX }, () => barre.appendChild(el('i')));
  const slider = el('div', 'terremoti-pf-slider');
  const campo = (etichetta, valore) => {
    const i = el('input');
    Object.assign(i, { type: 'range', min: '0', max: String(GIORNI_MAX), step: '1', value: String(valore) });
    i.setAttribute('aria-label', t(etichetta));
    return i;
  };
  const inizio = campo('terremoti.pf.da', 0), fine = campo('terremoti.pf.a', GIORNI_MAX);
  slider.append(inizio, fine);
  const testoIntervallo = el('p', 'terremoti-pf-intervallo');
  const riproduci = el('button', 'terremoti-pf-icona');
  riproduci.type = 'button';
  const azzera = el('button', 'terremoti-pf-icona');
  azzera.type = 'button';
  comando(azzera, 'azzera', t('terremoti.pf.azzera'));
  const grafici = el('button', 'terremoti-pf-icona');
  grafici.type = 'button';
  comando(grafici, 'grafici', t('terremoti.pf.grafici'));
  const testa = el('div', 'terremoti-pf-testa');
  const comandi = el('div', 'terremoti-pf-comandi');
  comandi.append(riproduci, azzera, grafici);
  testa.append(el('strong', null, t('terremoti.pf.titolo')), comandi);
  // i grafici stanno in una parte che si apre e si chiude; parte chiusa, e si apre con la riproduzione
  const corpo = el('div', 'terremoti-pf-corpo');
  const apri = vero => {
    corpo.hidden = !vero;
    grafici.setAttribute('aria-expanded', String(vero));
    grafici.classList.toggle('aperto', vero);
  };
  grafici.addEventListener('click', () => apri(corpo.hidden));

  // istogramma di magnitudo
  const istogramma = el('div', 'terremoti-pf-istogramma');
  const classi = CLASSI_MAG.map((c, i) => {
    const b = el('button');
    b.type = 'button';
    const asta = el('i'), conto = el('b'), nome = el('span', null, nomeClasse(c));
    b.append(conto, asta, nome);
    b.addEventListener('click', () => {
      const accese = new Set(filtro.classi ?? CLASSI_MAG.keys());
      accese.has(i) ? accese.delete(i) : accese.add(i);
      filtro.classi = accese.size && accese.size < CLASSI_MAG.length ? accese : null;
      emetti();
    });
    istogramma.append(b);
    return { b, asta, conto };
  });

  corpo.append(titoloConInfo('p', 'terremoti-pf-et', t('terremoti.pf.tempo'), 'pf-tempo'), barre, slider, titoloConInfo('p', 'terremoti-pf-et', t('terremoti.pf.magnitudo'), 'pf-magnitudo'), istogramma, el('p', 'uffici-nota', t('terremoti.pf.nota')));
  nodo.append(testa, testoIntervallo, corpo);
  apri(false);

  // riproduzione: la finestra scorre di un giorno alla volta
  let timer = null;
  const ferma = () => {
    clearInterval(timer);
    timer = null;
    comando(riproduci, 'riproduci', t('terremoti.pf.riproduci'));
    riproduci.setAttribute('aria-pressed', 'false');
  };
  riproduci.addEventListener('click', () => {
    if (timer) { ferma(); return; }
    comando(riproduci, 'pausa', t('terremoti.pf.pausa'));
    riproduci.setAttribute('aria-pressed', 'true');
    apri(true);
    const passo = () => { filtro.finestra = prossimaFinestra(filtro.finestra); emetti(); };
    passo();
    timer = setInterval(passo, PASSO_RIPRODUZIONE_MS);
  });
  azzera.addEventListener('click', () => {
    ferma();
    Object.assign(filtro, { finestra: null, classi: null });
    emetti();
  });

  const daSlider = () => {
    let da = Number(inizio.value), a = Number(fine.value);
    if (da >= a) { // le maniglie non si incrociano: la finestra è larga almeno un giorno
      if (document.activeElement === inizio) da = a - 1; else a = da + 1;
      if (da < 0) { da = 0; a = 1; }
    }
    filtro.finestra = da === 0 && a === GIORNI_MAX ? null : [da, a];
    ferma();
    emetti();
  };
  inizio.addEventListener('input', daSlider);
  fine.addEventListener('input', daSlider);

  function aggiorna() {
    const adesso = Date.now();
    const tutti = eventi();
    const [da, a] = filtro.finestra ?? [0, GIORNI_MAX];
    inizio.value = String(da);
    fine.value = String(a);
    const perGiorno = eventiPerGiorno(tutti, filtro, adesso);
    const max = Math.max(1, ...perGiorno);
    colonne.forEach((c, i) => {
      c.style.height = `${perGiorno[i] ? Math.max(6, perGiorno[i] / max * 100) : 0}%`;
      c.classList.toggle('fuori', filtro.finestra != null && (i < da || i >= a));
      c.title = `${giorno(adesso - (GIORNI_MAX - i) * GIORNO_MS)}: ${perGiorno[i]}`;
    });
    const [dal, al] = intervallo(filtro, adesso);
    testoIntervallo.hidden = !filtro.finestra; // la riga dice l'intervallo scelto, anche a grafici chiusi
    testoIntervallo.textContent = filtro.finestra ? t('terremoti.pf.intervallo', { da: giorno(dal), a: al === Infinity ? t('terremoti.pf.finoAdesso') : giorno(al) }) : '';
    const perClasse = eventiPerClasse(tutti, filtro, adesso);
    const maxClasse = Math.max(1, ...perClasse);
    classi.forEach(({ b, asta, conto }, i) => {
      conto.textContent = perClasse[i].toLocaleString(localeIntl());
      asta.style.height = `${perClasse[i] ? Math.max(6, perClasse[i] / maxClasse * 100) : 0}%`;
      const accesa = !filtro.classi || filtro.classi.has(i);
      b.classList.toggle('spenta', !accesa);
      b.setAttribute('aria-pressed', String(accesa));
      b.title = t('terremoti.pf.classe', { classe: nomeClasse(CLASSI_MAG[i]), n: perClasse[i] });
    });
    azzera.hidden = !filtro.finestra && !filtro.classi;
  }
  ferma();
  document.addEventListener(EVENTO_FILTRO, aggiorna);
  aggiorna();
  return { nodo, aggiorna, ferma };
}
