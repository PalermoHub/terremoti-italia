// Pannello «Personalizza» della scheda: scelta delle sezioni e delle righe da mostrare.
import { elencoPannello, commutaSezione, commutaRiga, azzera, nascondiTutto, tuttoNascosto, nessunaPreferenza } from './scheda-preferenze.js';
import { svgIcona } from './icone.js';
import { el } from './scheda-disegno.js';
import { t, tl } from './i18n.js';


export const ICONA_INGRANAGGIO = svgIcona('ingranaggio', 18);

export const ICONA_X = svgIcona('chiudi', 18);

const NOTA_SALVATE = t('pref.notaSalvate');
const NOTA_LAYER = t('pref.notaLayer');
const NOTA_NON_SALVATE = t('pref.notaNonSalvate');

// Pannello «Personalizza»: una casella per sezione e una per riga. Ogni scelta si salva subito e vale per tutte le schede.
// `pref` = { leggi(), scrivi(p) → salvato? }; `aggiorna()` ridisegna il corpo della scheda con le nuove scelte.
export function creaPannelloPreferenze(pref, aggiorna) {
  const pannello = el('div', 'scheda-pref');
  pannello.hidden = true;
  const nota = el('p', 'scheda-pref-nota', NOTA_SALVATE);
  const elenco = el('div', 'scheda-pref-elenco');
  const spazioAzioni = el('div', 'scheda-pref-azioni');
  const notaLayer = el('p', 'scheda-pref-nota scheda-pref-nota-layer', NOTA_LAYER);
  const cerca = el('input', 'scheda-pref-cerca');
  cerca.type = 'search';
  cerca.placeholder = t('pref.cerca.placeholder');
  cerca.setAttribute('aria-label', t('pref.cerca.aria'));
  pannello.append(nota, notaLayer, cerca, spazioAzioni, elenco); // i pulsanti sopra la lista: la lista scorre, loro restano a vista

  const casella = (attributo, valore, testo, spuntata) => {
    const label = el('label', 'scheda-pref-voce');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = spuntata;
    input.dataset[attributo] = valore;
    label.append(input, ' ', testo);
    return label;
  };

  const bottone = (classe, testo, azione) => {
    const b = el('button', `scheda-pref-bottone ${classe}`, testo);
    b.type = 'button';
    b.addEventListener('click', azione);
    return b;
  };
  const tutto = bottone('scheda-pref-tutto', t('pref.tutto'), () => cambia(azzera(pref.leggi())));
  const niente = bottone('scheda-pref-niente', t('pref.niente'), () => cambia(nascondiTutto(pref.leggi())));
  spazioAzioni.append(tutto, niente);

  // le caselle seguono sempre lo stato salvato; «Seleziona tutto» mostra anche le righe nascoste a mano
  function sincronizza() {
    const p = pref.leggi();
    const sezioniNascoste = new Set(p.nascoste.sezioni);
    const righeNascoste = new Set(p.nascoste.righe);
    for (const i of elenco.querySelectorAll('input[data-sezione]')) i.checked = !sezioniNascoste.has(i.dataset.sezione);
    for (const i of elenco.querySelectorAll('input[data-riga]')) {
      i.checked = !righeNascoste.has(i.dataset.riga);
      i.disabled = sezioniNascoste.has(i.dataset.riga.split('/')[0]); // le righe seguono la sezione
    }
    tutto.disabled = nessunaPreferenza(p);
    niente.disabled = tuttoNascosto(p);
  }

  function cambia(nuove) {
    nota.textContent = pref.scrivi(nuove) ? NOTA_SALVATE : NOTA_NON_SALVATE;
    sincronizza();
    aggiorna();
  }

  for (const sez of elencoPannello(pref.leggi())) {
    const gruppo = el('fieldset', 'scheda-pref-sez');
    const intestazione = casella('sezione', sez.tipo, tl(sez.titolo), sez.visibile);
    intestazione.classList.add('scheda-pref-titolo');
    intestazione.querySelector('input').addEventListener('change', e => cambia(commutaSezione(pref.leggi(), sez.tipo, e.target.checked)));
    gruppo.append(intestazione);
    for (const r of sez.righe) {
      const voce = casella('riga', `${sez.tipo}/${r.etichetta}`, tl(r.etichetta), r.visibile);
      voce.querySelector('input').addEventListener('change', e => cambia(commutaRiga(pref.leggi(), sez.tipo, r.etichetta, e.target.checked)));
      gruppo.append(voce);
    }
    elenco.append(gruppo);
  }
  // filtro di sola vista: se il testo è nel titolo della sezione resta tutta, altrimenti restano le righe che lo contengono
  cerca.addEventListener('input', () => {
    const q = cerca.value.trim().toLowerCase();
    for (const gruppo of elenco.children) {
      const titolo = gruppo.querySelector('.scheda-pref-titolo').textContent.toLowerCase();
      const tutta = !q || titolo.includes(q);
      let trovata = tutta;
      for (const voce of gruppo.querySelectorAll('.scheda-pref-voce:not(.scheda-pref-titolo)')) {
        voce.hidden = !tutta && !voce.textContent.toLowerCase().includes(q);
        if (!voce.hidden) trovata = true;
      }
      gruppo.hidden = !trovata;
    }
  });
  sincronizza();
  return pannello;
}
