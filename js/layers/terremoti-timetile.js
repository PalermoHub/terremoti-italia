// Barra della timeline («timetile») sopra la mappa: titolo-intervallo, preset, comandi di riproduzione, istogramma impilato
// per magnitudo con la finestra trascinabile e legenda a classi cliccabili. La accende il pannello «Filtro sulla mappa» (terremoti-pannello.js).
// Scrive nel filtro condiviso (`finestra`, `classi`) e avvisa con EVENTO_FILTRO: mappa, menu ed elenco si aggiornano da soli.
import { t, tn, localeIntl } from '../core/i18n.js';
import { GIORNI_MAX, CLASSI_MAG, FILTRO_INIZIALE, filtro, passaFiltro, passaMagnitudo, eventiPerClasse } from './scheda-terremoti.js';
import { evidenziaEventi, nascondiEvidenzaEventi } from '../core/evidenza-eventi.js';
import { EVENTO_FILTRO } from './scheda-terremoti-dom.js';
import {
  ORA_MS, BARRE, PASSO_MS, MIN_FINESTRA_MS, VELOCITA_MS, VELOCITA_INIZIALE, PRESET,
  serieTempo, finestraMs, finestraDaMs, spostaFinestra, ridimensionaFinestra, presetAttivo,
  titoloIntervallo, durataFinestra, istogramma, mezzanotti,
} from './terremoti-timetile-util.js';

const PASSO_AGGIORNAMENTO_MS = 80; // la riproduzione aggiorna filtro e mappa a questo passo, non a ogni fotogramma
const MAG_PAUSA = 5; // un evento di questa magnitudo (o più) che entra in finestra ferma la riproduzione...
const PAUSA_EVENTO_MS = 2000; // ...per questo tempo, mostrando l'evento
const SALTO_MAX_MS = 250; // dopo una scheda in secondo piano il tempo trascorso non si recupera in un colpo solo

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

const bottone = (classe, testo, etichetta) => {
  const b = el('button', classe, testo);
  b.type = 'button';
  if (etichetta) b.setAttribute('aria-label', etichetta);
  return b;
};

const nomeClasse = c => (c.da <= CLASSI_MAG[0].da ? `M<${c.a}` : c.a === Infinity ? `M≥${c.da}` : `M${c.da}–${c.a}`);
const giornoOra = ts => new Date(ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const emetti = () => document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));

// `eventi()` = eventi scaricati (tutti i 30 giorni). `mostraEvento(p)` / `nascondiEvento()` aprono e chiudono l'evento forte durante la pausa;
// `suStato({ scorre, velocita })` avvisa il pannello quando cambiano riproduzione o velocità; `suChiudi()` quando si preme ✕.
export function timetile(eventi, mappa = () => null, { mostraEvento = () => {}, nascondiEvento = () => {}, suStato = () => {}, suChiudi = () => {} } = {}) {
  const nodo = el('section', 'cerca-tempo');
  nodo.classList.add('timetile');
  nodo.hidden = true;
  document.getElementById('area-ricerca')?.append(nodo);
  nodo.setAttribute('aria-label', t('terremoti.tt.titolo'));

  // testa: intervallo in grande, anno, durata ed eventi
  const intervalloTesto = el('strong', 'tt-intervallo'), anno = el('span', 'tt-anno');
  const sotto = el('p', 'tt-sotto');
  const titolo = el('div', 'tt-titolo');
  const riga = el('div', 'tt-riga');
  riga.append(intervalloTesto, anno);
  titolo.append(riga, sotto);
  const riduci = bottone('tt-riduci', t('terremoti.tt.riduci'));
  riduci.setAttribute('aria-expanded', 'true');
  const preset = el('div', 'tt-preset');
  preset.setAttribute('role', 'group');
  preset.setAttribute('aria-label', t('terremoti.tt.preset'));
  const chip = PRESET.map(p => {
    const b = bottone('tt-chip');
    if (p.chiave === 'live') b.append(el('i', 'tt-punto'), t('terremoti.tt.live'));
    else b.textContent = t(`terremoti.tt.${p.chiave}`);
    preset.append(b);
    return b;
  });
  // maniglia per spostare la barra (trascinamento o frecce; doppio clic o Home la rimettono al suo posto) e pulsante per semplificarla
  const sposta = bottone('tt-sposta', '⠿', t('terremoti.tt.sposta'));
  sposta.title = t('terremoti.tt.sposta');
  const semplifica = bottone('tt-semplifica');
  const azioni = el('div', 'tt-azioni');
  const chiudi = bottone('tt-chiudi', '✕', t('terremoti.tt.chiudi'));
  chiudi.title = t('terremoti.tt.chiudi');
  chiudi.addEventListener('click', () => suChiudi());
  azioni.append(semplifica, riduci, chiudi);
  const destra = el('div', 'tt-destra'); // chip dei preset e maniglia: in alto a destra
  destra.append(preset, sposta);
  const testa = el('div', 'tt-testa');
  testa.append(titolo, destra);

  // comandi
  const indietro = bottone('tt-btn', `⏮ ${t('terremoti.tt.seiOre')}`, t('terremoti.tt.indietro'));
  const avanti = bottone('tt-btn', `${t('terremoti.tt.seiOre')} ⏭`, t('terremoti.tt.avanti'));
  const avvia = bottone('tt-btn tt-avvia');
  const reset = bottone('tt-btn tt-reset', `↺ ${t('terremoti.tt.reset')}`);
  const velocita = el('select', 'tt-velocita');
  ['unOra', 'seOre', 'unGiorno'].forEach((chiave, i) => velocita.append(new Option(t(`terremoti.tt.v.${chiave}`), String(i))));
  velocita.value = String(VELOCITA_INIZIALE);
  const etichettaVelocita = el('label', 'tt-etichetta-vel');
  etichettaVelocita.append(el('span', null, t('terremoti.tt.velocita')), velocita);
  const comandi = el('div', 'tt-comandi');
  comandi.append(indietro, avvia, avanti, etichettaVelocita, reset);

  // grafico: barre impilate, asse con le mezzanotti e finestra trascinabile
  const barre = el('div', 'tt-barre');
  const maniglia = lato => {
    const m = el('span', `tt-maniglia ${lato}`);
    m.tabIndex = 0;
    m.setAttribute('role', 'slider');
    m.setAttribute('aria-label', t(lato === 'sx' ? 'terremoti.tt.inizio' : 'terremoti.tt.fine'));
    m.append(el('i'));
    return m;
  };
  const manigliaSx = maniglia('sx'), manigliaDx = maniglia('dx');
  const finestra = el('div', 'tt-finestra');
  finestra.tabIndex = 0;
  finestra.setAttribute('role', 'slider');
  finestra.setAttribute('aria-label', t('terremoti.tt.finestra'));
  finestra.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
  finestra.append(manigliaSx, manigliaDx);
  const grafico = el('div', 'tt-grafico');
  grafico.append(barre, finestra);
  const asse = el('div', 'tt-asse');

  // legenda: stessi colori dei cerchi in mappa, conteggio scritto; un clic accende o spegne la classe
  const legenda = el('div', 'tt-legenda');
  legenda.setAttribute('role', 'group');
  legenda.setAttribute('aria-label', t('terremoti.tt.magnitudo'));
  const voci = CLASSI_MAG.map((c, i) => {
    const b = bottone('tt-voce');
    const pallino = el('i', 'tt-pallino'), conto = el('b');
    pallino.style.background = c.colore;
    b.append(pallino, el('span', null, nomeClasse(c)), conto);
    b.addEventListener('click', () => {
      const accese = new Set(filtro.classi ?? CLASSI_MAG.keys());
      accese.has(i) ? accese.delete(i) : accese.add(i);
      filtro.classi = accese.size && accese.size < CLASSI_MAG.length ? accese : null;
      emetti();
    });
    legenda.append(b);
    return { b, conto };
  });

  const corpo = el('div', 'tt-corpo');
  corpo.append(grafico, asse, legenda);
  const riga2 = el('div', 'tt-riga2'); // comandi e azioni della barra su un'unica riga (a capo se manca lo spazio)
  riga2.append(comandi, azioni);
  nodo.append(testa, riga2, corpo);

  // posizione: di norma la barra sta nell'area della ricerca (in basso, al centro); spostata, diventa libera sulla mappa e si ricorda
  const CHIAVE_POS = 'terremoti.timetile.pos', CHIAVE_MODO = 'terremoti.timetile.modo';
  const leggi = chiave => { try { return localStorage.getItem(chiave); } catch { return null; } };
  const scrivi = (chiave, valore) => { try { valore == null ? localStorage.removeItem(chiave) : localStorage.setItem(chiave, valore); } catch { /* senza archivio la scelta vale per questa visita */ } };
  let libera = false;
  const segnaCerca = () => document.body.classList.toggle('timeline-in-corso', !nodo.hidden && !libera);
  const entro = (x, y) => {
    const r = nodo.getBoundingClientRect();
    return { x: Math.round(Math.min(Math.max(0, innerWidth - r.width), Math.max(0, x))), y: Math.round(Math.min(Math.max(0, innerHeight - r.height), Math.max(0, y))) };
  };
  const posiziona = (x, y) => {
    if (!libera) { libera = true; nodo.classList.add('libera'); document.body.append(nodo); segnaCerca(); }
    const p = entro(x, y);
    nodo.style.left = `${p.x}px`;
    nodo.style.top = `${p.y}px`;
    return p;
  };
  const rimetti = () => {
    libera = false;
    nodo.classList.remove('libera');
    nodo.style.left = nodo.style.top = '';
    document.getElementById('area-ricerca')?.append(nodo);
    scrivi(CHIAVE_POS, null);
    segnaCerca();
  };
  const salva = p => scrivi(CHIAVE_POS, JSON.stringify(p));
  let spostando = null;
  sposta.addEventListener('pointerdown', e => {
    const r = nodo.getBoundingClientRect();
    spostando = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { sposta.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    e.preventDefault();
  });
  sposta.addEventListener('pointermove', e => { if (spostando) posiziona(e.clientX - spostando.dx, e.clientY - spostando.dy); });
  const finito = () => { if (spostando && libera) salva({ x: parseInt(nodo.style.left, 10), y: parseInt(nodo.style.top, 10) }); spostando = null; };
  sposta.addEventListener('pointerup', finito);
  sposta.addEventListener('pointercancel', finito);
  sposta.addEventListener('dblclick', rimetti);
  sposta.addEventListener('keydown', e => {
    const passo = e.shiftKey ? 64 : 16, mosse = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    if (e.key === 'Home' || e.key === 'Escape') { e.preventDefault(); rimetti(); return; }
    if (!mosse[e.key]) return;
    e.preventDefault();
    const r = nodo.getBoundingClientRect();
    salva(posiziona(r.left + mosse[e.key][0], r.top + mosse[e.key][1]));
  });
  window.addEventListener('resize', () => { if (libera && !nodo.hidden) { const r = nodo.getBoundingClientRect(); posiziona(r.left, r.top); } });
  try { const salvata = JSON.parse(leggi(CHIAVE_POS)); if (salvata && Number.isFinite(salvata.x) && Number.isFinite(salvata.y)) { libera = true; nodo.classList.add('libera'); nodo.style.left = `${salvata.x}px`; nodo.style.top = `${salvata.y}px`; document.body.append(nodo); } } catch { /* posizione non valida: resta quella di base */ }

  // versione semplice: solo titolo, ±6 h, avvio e grafico; parte da sola su schermi piccoli e telefoni, finché non si sceglie a mano
  const piccolo = matchMedia('(max-width: 720px), (pointer: coarse) and (max-height: 500px)');
  let modo = leggi(CHIAVE_MODO); // 'semplice' | 'completa' | null = secondo lo schermo
  const semplice = () => (modo ? modo === 'semplice' : piccolo.matches);
  // Semplifica è sempre un'icona, Riduci lo diventa nella versione semplice (con nome per tastiera e lettori di schermo), così i comandi stanno su una riga
  const scriviAzioni = () => {
    const s = semplice(), chiusa = nodo.classList.contains('ridotta');
    const nomeModo = t(s ? 'terremoti.tt.completa' : 'terremoti.tt.semplifica'), nomeRiduci = t(chiusa ? 'terremoti.tt.espandi' : 'terremoti.tt.riduci');
    semplifica.textContent = s ? '⤢' : '⤡';
    semplifica.title = nomeModo;
    semplifica.setAttribute('aria-label', nomeModo);
    riduci.textContent = s ? (chiusa ? '+' : '–') : nomeRiduci;
    riduci.title = nomeRiduci;
    riduci.setAttribute('aria-label', nomeRiduci);
  };
  const segnaModo = () => {
    const s = semplice();
    nodo.classList.toggle('semplice', s);
    scriviAzioni();
    semplifica.setAttribute('aria-pressed', String(s));
    if (libera && !nodo.hidden) { const r = nodo.getBoundingClientRect(); posiziona(r.left, r.top); }
  };
  semplifica.addEventListener('click', () => { modo = semplice() ? 'completa' : 'semplice'; scrivi(CHIAVE_MODO, modo); segnaModo(); });
  piccolo.addEventListener?.('change', () => { if (!modo) segnaModo(); });
  segnaModo();

  riduci.addEventListener('click', () => {
    const chiudi = !corpo.hidden;
    corpo.hidden = chiudi;
    preset.hidden = chiudi;
    comandi.hidden = chiudi;
    nodo.classList.toggle('ridotta', chiudi);
    scriviAzioni();
    riduci.setAttribute('aria-expanded', String(!chiudi));
  });

  // ---- grafico: si ricostruisce solo se cambiano i dati; il resto (finestra, conti) si sposta senza toccare le barre
  let colonne = [], datiRif = null, chiaveDati = '', serieGrafico = serieTempo(filtro);
  const preparaColonne = () => {
    if (colonne.length) return;
    colonne = Array.from({ length: BARRE }, () => {
      const c = el('div', 'tt-col');
      c.append(...CLASSI_MAG.map((cl, i) => { const s = el('i'); s.dataset.c = String(i); s.style.background = cl.colore; return s; }));
      return c;
    });
    barre.replaceChildren(...colonne);
  };
  function ridisegnaDati(tutti, s, adesso) {
    const chiave = `${filtro.periodo ? `${filtro.periodo.da}-${filtro.periodo.a}` : 'r'}|${Math.floor(adesso / ORA_MS)}|${filtro.magMin}|${filtro.magMax}|${filtro.profMin}|${filtro.profMax}`;
    if (tutti === datiRif && chiave === chiaveDati) return;
    datiRif = tutti;
    chiaveDati = chiave;
    serieGrafico = s;
    preparaColonne();
    const dati = istogramma(tutti, s, e => passaMagnitudo(e, filtro) && (filtro.profMin == null || e.prof >= filtro.profMin) && (filtro.profMax == null || e.prof <= filtro.profMax));
    const totali = dati.map(d => d.reduce((a, b) => a + b, 0));
    const max = Math.max(1, ...totali);
    const largo = (s.a - s.da) / colonne.length;
    colonne.forEach((c, k) => {
      [...c.children].forEach((seg, i) => {
        const n = dati[k][i];
        seg.style.height = n ? `${n / max * 100}%` : '0';
        seg.classList.toggle('alta', n > 0 && CLASSI_MAG[i].da >= 4); // M≥4 resta visibile anche se rara: altezza minima da CSS
      });
      c.title = `${giornoOra(s.da + k * largo)}: ${totali[k].toLocaleString(localeIntl())}`;
    });
    const loc = localeIntl();
    asse.replaceChildren(...mezzanotti(s).map(m => {
      const e = el('span', null, new Date(m.ms).toLocaleDateString(loc, { day: 'numeric', month: 'short' }));
      e.style.left = `${m.pct}%`;
      return e;
    }));
  }

  // ---- riproduzione
  let riproduzione = null; // { raf, ultimo, pendente, fermoFino }
  let pronto = false; // il pannello che ascolta `suStato` è ancora in costruzione
  const segnaRiproduzione = scorre => {
    avvia.textContent = scorre ? `❚❚ ${t('terremoti.tt.pausa')}` : `▶ ${t('terremoti.tt.avvia')}`;
    avvia.setAttribute('aria-pressed', String(scorre));
    if (pronto) suStato({ scorre, velocita: velocita.selectedOptions[0].textContent });
  };
  const pausa = () => {
    if (!riproduzione) return;
    cancelAnimationFrame(riproduzione.raf);
    riproduzione = null;
    segnaRiproduzione(false);
    nascondiEvidenzaEventi(mappa());
  };
  const ferma = () => { pausa(); nascondiEvento(); };
  const applica = (w, s) => { filtro.finestra = finestraDaMs(w.da, w.a, s); emetti(); };
  const attuale = () => { const adesso = Date.now(); return { adesso, s: serieTempo(filtro, adesso), w: finestraMs(filtro, adesso) }; };

  function fotogramma(ora) {
    if (!riproduzione) return;
    const r = riproduzione;
    r.raf = requestAnimationFrame(fotogramma);
    const dt = Math.min(ora - r.ultimo, SALTO_MAX_MS);
    r.ultimo = ora;
    if (ora < r.fermoFino) return; // pausa breve su un evento forte
    if (r.fermoFino) { r.fermoFino = 0; nascondiEvento(); }
    r.pendente += dt;
    if (r.pendente < PASSO_AGGIORNAMENTO_MS) return;
    const delta = r.pendente * VELOCITA_MS[Number(velocita.value)] / 1000;
    r.pendente = 0;
    const { adesso, s, w } = attuale();
    const nuova = spostaFinestra(w, delta, s);
    const arrivata = nuova.a >= s.a - 1000;
    applica(nuova, s);
    if (arrivata) { pausa(); return; } // si ferma da sola su «adesso»
    // eventi forti entrati in questo passo: la riproduzione si ferma un attimo e li mostra (il più forte)
    const forte = eventi().filter(e => e.mag >= MAG_PAUSA && e.ts > w.a && e.ts <= nuova.a && passaFiltro(e, filtro, adesso)).sort((a, b) => b.mag - a.mag)[0];
    if (!forte) return;
    r.fermoFino = ora + PAUSA_EVENTO_MS;
    mostraEvento(forte);
  }
  avvia.addEventListener('click', () => {
    if (riproduzione) { pausa(); return; }
    const { s, w } = attuale();
    const largo = w.a - w.da;
    if (largo >= s.a - s.da - 1000) { // la finestra copre già tutto (es. un periodo scelto): parte da una finestra di un decimo della serie, 3 giorni sui 30
      applica({ da: s.da, a: s.da + Math.max(MIN_FINESTRA_MS, (s.a - s.da) / 10) }, s);
    } else if (w.a >= s.a - 1000) applica({ da: s.da, a: s.da + largo }, s); // già alla fine: riparte dall'inizio dell'archivio
    riproduzione = { raf: 0, ultimo: performance.now(), pendente: 0, fermoFino: 0 };
    segnaRiproduzione(true);
    riproduzione.raf = requestAnimationFrame(fotogramma);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausa(); });

  // ---- comandi che spostano la finestra: tutti fermano la riproduzione
  const passo = delta => {
    pausa();
    const { s, w } = attuale();
    applica(spostaFinestra(w, delta, s), s);
  };
  indietro.addEventListener('click', () => passo(-PASSO_MS));
  avanti.addEventListener('click', () => passo(PASSO_MS));
  reset.addEventListener('click', () => {
    ferma();
    Object.assign(filtro, { finestra: null, classi: null, periodo: null, giorni: FILTRO_INIZIALE.giorni });
    emetti();
  });
  chip.forEach((b, i) => b.addEventListener('click', () => {
    pausa();
    filtro.periodo = null;
    if (PRESET[i].chiave === 'live') filtro.finestra = [GIORNI_MAX - PRESET[i].ms / 86400000, GIORNI_MAX];
    else { filtro.finestra = null; filtro.giorni = PRESET[i].ms / 86400000; } // 24 h, 7 g e 30 g sono le scelte del menu «Periodo»
    emetti();
  }));

  // ---- trascinamento della finestra (corpo e bordi) e tastiera
  let presa = null; // { modo, x0, w0, s, larghezza }
  const dalPunto = (modo, e) => {
    pausa();
    presa = { modo, x0: e.clientX, w0: attuale().w, s: attuale().s, larghezza: grafico.getBoundingClientRect().width || 1 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato: il trascinamento continua sul nodo */ }
    e.preventDefault();
    e.stopPropagation();
  };
  const muovi = e => {
    if (!presa) return;
    const { modo, x0, w0, s, larghezza } = presa;
    const delta = (e.clientX - x0) / larghezza * (s.a - s.da);
    const w = modo === 'corpo' ? spostaFinestra(w0, delta, s) : ridimensionaFinestra(w0, modo, w0[modo] + delta, s);
    const corrente = attuale().w;
    if (Math.abs(w.da - corrente.da) < 1000 && Math.abs(w.a - corrente.a) < 1000) return;
    applica(w, s);
  };
  const lascia = () => { presa = null; };
  [[finestra, 'corpo'], [manigliaSx, 'da'], [manigliaDx, 'a']].forEach(([n, modo]) => {
    n.addEventListener('pointerdown', e => { if (modo === 'corpo' && e.target !== finestra) return; dalPunto(modo, e); });
    n.addEventListener('pointermove', muovi);
    n.addEventListener('pointerup', lascia);
    n.addEventListener('pointercancel', lascia);
  });
  const conFrecce = (n, agisci) => n.addEventListener('keydown', e => {
    const verso = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!verso) return;
    e.preventDefault();
    e.stopPropagation();
    pausa();
    const { s, w } = attuale();
    applica(agisci(w, verso * PASSO_MS, s), s);
  });
  conFrecce(finestra, (w, d, s) => spostaFinestra(w, d, s));
  conFrecce(manigliaSx, (w, d, s) => ridimensionaFinestra(w, 'da', w.da + d, s));
  conFrecce(manigliaDx, (w, d, s) => ridimensionaFinestra(w, 'a', w.a + d, s));

  function aggiorna() {
    if (nodo.hidden) return; // spenta: si aggiorna quando si accende
    const { adesso, s, w } = attuale();
    const tutti = eventi();
    ridisegnaDati(tutti, s, adesso);
    const sg = serieGrafico, durata = sg.a - sg.da;
    const pct = ms => Math.min(100, Math.max(0, (ms - sg.da) / durata * 100));
    finestra.style.left = `${pct(w.da)}%`;
    finestra.style.width = `${Math.max(pct(w.a) - pct(w.da), MIN_FINESTRA_MS / durata * 100)}%`;
    const dal = giornoOra(w.da), al = giornoOra(w.a);
    finestra.setAttribute('aria-valuemin', '0');
    finestra.setAttribute('aria-valuemax', '100');
    finestra.setAttribute('aria-valuenow', String(Math.round(pct(w.da))));
    finestra.setAttribute('aria-valuetext', t('terremoti.pf.intervallo', { da: dal, a: al }));
    manigliaSx.setAttribute('aria-valuetext', dal);
    manigliaDx.setAttribute('aria-valuetext', al);
    [manigliaSx, manigliaDx].forEach(m => { m.setAttribute('aria-valuemin', '0'); m.setAttribute('aria-valuemax', '100'); });
    manigliaSx.setAttribute('aria-valuenow', String(Math.round(pct(w.da))));
    manigliaDx.setAttribute('aria-valuenow', String(Math.round(pct(w.a))));

    const perClasse = eventiPerClasse(tutti, filtro, adesso);
    const totale = perClasse.reduce((a, b) => a + b, 0);
    const d = durataFinestra(w.da, w.a);
    intervalloTesto.textContent = titoloIntervallo(w.da, w.a, localeIntl());
    anno.textContent = new Date(w.a - 1).toLocaleDateString(localeIntl(), { year: 'numeric' });
    sotto.textContent = t('terremoti.tt.sotto', { durata: tn(`terremoti.tt.${d.unita}`, d.n), eventi: tn('terremoti.tt.eventi', totale, { n: totale.toLocaleString(localeIntl()) }) });
    const attivo = presetAttivo(w, s, filtro);
    chip.forEach((b, i) => { b.classList.toggle('attivo', i === attivo); b.setAttribute('aria-pressed', String(i === attivo)); });
    voci.forEach(({ b, conto }, i) => {
      conto.textContent = perClasse[i].toLocaleString(localeIntl());
      const accesa = !filtro.classi || filtro.classi.has(i);
      b.classList.toggle('spenta', !accesa);
      b.setAttribute('aria-pressed', String(accesa));
      b.title = t('terremoti.pf.classe', { classe: nomeClasse(CLASSI_MAG[i]), n: perClasse[i] });
      barre.classList.toggle(`spenta-${i}`, !accesa);
    });
    // durante la riproduzione gli eventi appena entrati (l'ultimo secondo di riproduzione) si accendono in mappa
    if (riproduzione) evidenziaEventi(mappa(), tutti.filter(p => p.ts > w.a - VELOCITA_MS[Number(velocita.value)] && p.ts <= w.a && passaFiltro(p, filtro, adesso)), { inquadra: false });
  }
  velocita.addEventListener('change', () => suStato({ scorre: Boolean(riproduzione), velocita: velocita.selectedOptions[0].textContent }));
  const mostra = vero => {
    nodo.hidden = !vero;
    segnaCerca();
    if (vero) { aggiorna(); if (libera) { const r = nodo.getBoundingClientRect(); posiziona(r.left, r.top); } } else ferma();
  };
  const alterna = () => avvia.click();
  const ciclaVelocita = () => { velocita.selectedIndex = (velocita.selectedIndex + 1) % velocita.options.length; velocita.dispatchEvent(new Event('change')); };
  segnaRiproduzione(false);
  pronto = true;
  document.addEventListener(EVENTO_FILTRO, aggiorna);
  return { nodo, aggiorna, ferma, mostra, velocitaNome: () => velocita.selectedOptions[0].textContent, alterna, ciclaVelocita, azzera: () => reset.click(), acceso: () => !nodo.hidden };
}
