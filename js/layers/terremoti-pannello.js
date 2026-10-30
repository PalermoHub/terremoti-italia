// Pannello «Filtro sulla mappa» nella legenda dei terremoti: serie temporale (eventi per giorno) con slider a due maniglie e istogramma di magnitudo a classi cliccabili.
// Scrive nel filtro condiviso (`finestra`, `classi`) e avvisa con EVENTO_FILTRO: mappa, menu ed elenco si aggiornano da soli.
import { t, tn, localeIntl } from '../core/i18n.js';
import { GIORNI_MAX, CLASSI_MAG, filtro, intervallo, passaFiltro, eventiPerGiorno, eventiPerClasse, sintesiClassi, SOGLIA_BASSA, SOGLIA_ALTA } from './scheda-terremoti.js';
import { nascondiEvidenzaEventi } from '../core/evidenza-eventi.js';
import { titoloConInfo } from '../core/info-grafico.js';
import { EVENTO_FILTRO } from './scheda-terremoti-dom.js';
import { timetile } from './terremoti-timetile.js';

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

// Icone dei comandi (stesso tratto delle altre iconcine del sito)
const svg = tracciato => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tracciato}</svg>`;
const ICONE = { riproduci: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'), pausa: svg('<path d="M8 5v14M16 5v14"/>'), azzera: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>'), grafici: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>'), spegni: svg('<path d="M6 6l12 12M18 6L6 18"/>') };
function comando(el, nome, etichetta) {
  el.innerHTML = ICONE[nome];
  el.title = etichetta;
  el.setAttribute('aria-label', etichetta);
}

const GIORNO_MS = 86400000;
const nomeClasse = c => (c.a === Infinity ? `≥ ${c.da}` : `${c.da}–${c.a}`);
const giornoOra = ts => new Date(ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const giorno = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short' });
const emetti = () => document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));

// `eventi()` = eventi scaricati (tutti i 30 giorni). `mostraEvento(p)` / `nascondiEvento()` aprono e chiudono l'evento forte durante la pausa.
// Restituisce { nodo, aggiorna, ferma }.
export function pannelloFiltro(eventi, mappa = () => null, { mostraEvento = () => {}, nascondiEvento = () => {} } = {}) {
  const nodo = el('div', 'terremoti-pannello');
  // la riproduzione sta nella barra della timeline sopra la mappa (terremoti-timetile.js); i comandi qui la accendono e la seguono
  let scorre = false;
  const tile = timetile(eventi, mappa, {
    mostraEvento, nascondiEvento, suChiudi: () => ferma(),
    suStato: ({ scorre: va, velocita: nome }) => { scorre = va; segnaRiproduzione(va); scriviVelocita(nome); },
  });

  // serie temporale + slider
  const barre = el('div', 'terremoti-pf-barre');
  let colonne = [];
  const preparaColonne = n => {
    if (colonne.length === n) return;
    colonne = Array.from({ length: n }, () => el('i'));
    barre.replaceChildren(...colonne);
  };
  preparaColonne(GIORNI_MAX);
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
  const spegni = el('button', 'terremoti-pf-icona');
  spegni.type = 'button';
  spegni.hidden = true;
  comando(spegni, 'spegni', t('terremoti.pf.spegni'));
  const veloce = el('button', 'terremoti-pf-icona terremoti-pf-velocita');
  veloce.type = 'button';
  function scriviVelocita(nome = '') {
    veloce.textContent = nome.replace(/^1 s = (.*)$/, '$1/s');
    veloce.title = t('terremoti.pf.velocita', { v: nome });
    veloce.setAttribute('aria-label', veloce.title);
  }
  scriviVelocita();
  veloce.addEventListener('click', () => tile.ciclaVelocita());
  const grafici = el('button', 'terremoti-pf-icona');
  grafici.type = 'button';
  comando(grafici, 'grafici', t('terremoti.pf.grafici'));
  const testa = el('div', 'terremoti-pf-testa');
  const comandi = el('div', 'terremoti-pf-comandi');
  comandi.append(riproduci, veloce, azzera, spegni, grafici);
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

  // scala logaritmica: i pochi eventi forti non restano invisibili accanto ai tanti deboli
  let logaritmica = false;
  const scala = el('label', 'terremoti-pf-scala');
  const casellaScala = el('input');
  casellaScala.type = 'checkbox';
  casellaScala.addEventListener('change', () => { logaritmica = casellaScala.checked; aggiorna(); });
  scala.append(casellaScala, el('span', null, t('terremoti.pf.logaritmica')));
  const sintesi = el('p', 'terremoti-sintesi');

  const sezioneTempo = el('div', 'terremoti-pf-sezione-tempo');
  sezioneTempo.append(titoloConInfo('p', 'terremoti-pf-et', t('terremoti.pf.tempo'), 'pf-tempo'), barre, slider);
  corpo.append(sezioneTempo, titoloConInfo('p', 'terremoti-pf-et', t('terremoti.pf.magnitudo'), 'pf-magnitudo'), istogramma, sintesi, scala, el('p', 'uffici-nota', t('terremoti.pf.nota')));
  nodo.append(testa, testoIntervallo, corpo);
  apri(false);

  const segnaRiproduzione = va => {
    const nome = va ? 'pausa' : 'riproduci', etichetta = t(va ? 'terremoti.pf.pausa' : 'terremoti.pf.riproduci');
    comando(riproduci, nome, etichetta);
    riproduci.setAttribute('aria-pressed', String(va));
  };
  segnaRiproduzione(false);
  scriviVelocita(tile.velocitaNome());
  const pausa = () => tile.ferma();
  const ferma = () => { // spegne la timeline: finestra ferma dove sta, barra e luci in mappa spente
    tile.mostra(false);
    spegni.hidden = true;
    nascondiEvidenzaEventi(mappa());
  };
  riproduci.addEventListener('click', () => {
    spegni.hidden = false;
    apri(true);
    if (!tile.acceso()) tile.mostra(true);
    tile.alterna();
  });
  spegni.addEventListener('click', ferma);
  azzera.addEventListener('click', () => {
    ferma();
    Object.assign(filtro, { finestra: null, classi: null, periodo: null });
    emetti();
  });

  const daSlider = () => {
    let da = Number(inizio.value), a = Number(fine.value);
    if (da >= a) { // le maniglie non si incrociano: la finestra è larga almeno un giorno
      if (document.activeElement === inizio) da = a - 1; else a = da + 1;
      if (da < 0) { da = 0; a = 1; }
    }
    filtro.finestra = da === 0 && a === GIORNI_MAX ? null : [da, a];
    pausa();
    emetti();
  };
  inizio.addEventListener('input', daSlider);
  fine.addEventListener('input', daSlider);

  function aggiorna() {
    const adesso = Date.now();
    const tutti = eventi();
    // Le barre coprono gli ultimi 30 giorni o, con un periodo scelto, il periodo intero (le stesse GIORNI_MAX fasce di uguale durata):
    // lo slider, la riproduzione e la finestra lavorano in fasce, quindi funzionano allo stesso modo.
    preparaColonne(GIORNI_MAX);
    const [da, a] = filtro.finestra ?? [0, GIORNI_MAX];
    inizio.value = String(da);
    fine.value = String(a);
    const p = filtro.periodo;
    const inizioSerie = p ? p.da : adesso - GIORNI_MAX * GIORNO_MS;
    const larghezza = ((p ? Math.min(p.a, adesso) : adesso) - inizioSerie) / GIORNI_MAX;
    let perFascia;
    if (p) {
      perFascia = Array(GIORNI_MAX).fill(0);
      for (const e of tutti) if (passaFiltro(e, { ...filtro, finestra: null }, adesso)) perFascia[Math.min(GIORNI_MAX - 1, Math.max(0, Math.floor((e.ts - inizioSerie) / larghezza)))]++;
    } else perFascia = eventiPerGiorno(tutti, filtro, adesso);
    const max = Math.max(1, ...perFascia);
    colonne.forEach((c, i) => {
      c.style.height = `${perFascia[i] ? Math.max(6, perFascia[i] / max * 100) : 0}%`;
      c.classList.toggle('fuori', filtro.finestra != null && (i < da || i >= a));
      const inizioFascia = inizioSerie + i * larghezza;
      c.title = `${larghezza > GIORNO_MS * 1.5 ? `${giorno(inizioFascia)} – ${giorno(inizioFascia + larghezza - 1)}` : giorno(inizioFascia)}: ${perFascia[i]}`;
    });
    const [dal, al] = intervallo(filtro, adesso);
    testoIntervallo.hidden = !filtro.finestra; // la riga dice l'intervallo scelto, anche a grafici chiusi
    testoIntervallo.textContent = filtro.finestra ? t('terremoti.pf.intervallo', { da: giorno(dal), a: al === Infinity ? t('terremoti.pf.finoAdesso') : giorno(al) }) : '';
    const perClasse = eventiPerClasse(tutti, filtro, adesso);
    const maxClasse = Math.max(1, ...perClasse);
    const altezza = n => (logaritmica ? Math.log10(1 + n) / Math.log10(1 + maxClasse) : n / maxClasse) * 100;
    const riepilogo = sintesiClassi(perClasse);
    sintesi.hidden = !riepilogo;
    if (riepilogo) {
      const alte = riepilogo.daAlta ? tn('terremoti.pf.sintesiAlte', riepilogo.daAlta, { soglia: SOGLIA_ALTA }) : t('terremoti.pf.sintesiNessuna', { soglia: SOGLIA_ALTA });
      sintesi.textContent = t('terremoti.pf.sintesi', { quota: Math.round(riepilogo.quotaSotto * 100).toLocaleString(localeIntl()), soglia: SOGLIA_BASSA, alte });
    }
    classi.forEach(({ b, asta, conto }, i) => {
      conto.textContent = perClasse[i].toLocaleString(localeIntl());
      asta.style.height = `${perClasse[i] ? Math.max(6, altezza(perClasse[i])) : 0}%`;
      const accesa = !filtro.classi || filtro.classi.has(i);
      b.classList.toggle('spenta', !accesa);
      b.setAttribute('aria-pressed', String(accesa));
      b.title = t('terremoti.pf.classe', { classe: nomeClasse(CLASSI_MAG[i]), n: perClasse[i] });
    });
    azzera.hidden = !filtro.finestra && !filtro.classi && !filtro.periodo;
  }
  ferma();
  document.addEventListener(EVENTO_FILTRO, aggiorna);
  aggiorna();
  return { nodo, aggiorna, ferma };
}
