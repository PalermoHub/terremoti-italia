// Barra verticale a destra con un tab per pannello (Scheda, RNDT): un solo pannello aperto alla volta,
// gli altri restano raggiungibili dai tab. Cliccando il tab attivo il pannello si ripiega e resta solo la barra.
import { t } from './i18n.js';
export const ICONE_RAIL = {
  scheda: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  storico: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  confronto: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  rndt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
  geoimage: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg>',
  tema: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/></svg>',
  chatbot: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01" stroke-width="2.6"/></svg>',
};

export function collegaRail(rail, voci) {
  // voci: [{ id, etichetta, pannello, apri? }] — apri serve ai pannelli che si creano al primo uso
  const bottoni = new Map();
  for (const v of voci) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail-tab';
    b.dataset.pannello = v.id;
    b.title = v.etichetta;
    b.innerHTML = `${ICONE_RAIL[v.id] || ''}<span>${v.etichetta}</span>`;
    b.addEventListener('click', () => {
      if (v.pannello.hidden) { v.apri?.(); return; }
      v.pannello.classList.toggle('collassato');
      if (!v.pannello.classList.contains('collassato')) altri(v).forEach(o => o.pannello.classList.add('collassato'));
      aggiorna();
    });
    bottoni.set(v.id, b);
    rail.append(b);
  }
  const altri = v => voci.filter(o => o !== v);

  function aggiorna() {
    for (const v of voci) {
      const b = bottoni.get(v.id);
      const esiste = !v.pannello.hidden;
      // come la barra a sinistra, i tab ci sono sempre; quello della scheda è spento finché non c'è una scheda
      const spento = (v.id === 'scheda' || v.id === 'storico') && !esiste;
      b.setAttribute('aria-disabled', String(spento));
      b.title = spento ? t(v.id === 'storico' ? 'rail.storicoSpento' : 'rail.schedaSpenta') : v.etichetta;
      const attivo = esiste && !v.pannello.classList.contains('collassato');
      b.setAttribute('aria-pressed', String(attivo));
      b.classList.toggle('attivo', attivo);
    }
  }

  // un pannello che compare ripiega gli altri; uno che sparisce libera il posto a quelli ripiegati
  const stato = new Map(voci.map(v => [v, !v.pannello.hidden]));
  const osservatore = new MutationObserver(() => {
    for (const v of voci) {
      const ora = !v.pannello.hidden;
      if (ora === stato.get(v)) continue;
      stato.set(v, ora);
      if (ora) {
        v.pannello.classList.remove('collassato');
        altri(v).forEach(o => o.pannello.classList.add('collassato'));
      } else {
        v.pannello.classList.remove('collassato');
        const resto = altri(v).find(o => !o.pannello.hidden);
        if (resto) resto.pannello.classList.remove('collassato');
      }
    }
    aggiorna();
  });
  for (const v of voci) osservatore.observe(v.pannello, { attributes: true, attributeFilter: ['hidden'] });
  aggiorna();

  // apre/chiude un pannello da un pulsante esterno (vale anche su mobile, dove la barra non si vede)
  return {
    commuta(id) {
      const v = voci.find(o => o.id === id);
      if (!v) return;
      if (v.pannello.hidden) v.apri?.();
      else if (v.pannello.classList.contains('collassato')) bottoni.get(id).click();
      else if (v.chiudi) v.chiudi();
      else bottoni.get(id).click();
    },
    // porta in primo piano un pannello aperto ma ripiegato (non crea quelli assenti)
    mostra(id) {
      const v = voci.find(o => o.id === id);
      if (v && !v.pannello.hidden && v.pannello.classList.contains('collassato')) bottoni.get(id).click();
    },
    // chiude un pannello solo se è aperto (sul telefono il tab «Mappa» riporta alla mappa)
    chiudi(id) {
      const v = voci.find(o => o.id === id);
      if (!v || v.pannello.hidden || v.pannello.classList.contains('collassato')) return;
      if (v.chiudi) v.chiudi(); else bottoni.get(id).click();
    },
  };
}
