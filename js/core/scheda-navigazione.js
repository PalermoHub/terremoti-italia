// Barra con le frecce `‹ 3 di 90 ›` di una scheda: passa all'elemento precedente o successivo di un elenco (terremoti, PEBA…).
import { t } from './i18n.js';

// Posto di `id` in un elenco già ordinato (elementi con `id`): `prec` e `succ` sono i vicini; null se `id` non c'è
export function posizioneIn(ordinati, id) {
  const i = ordinati.findIndex(e => e.id === id);
  if (i < 0) return null;
  return { pos: i + 1, tot: ordinati.length, prec: ordinati[i - 1] ?? null, succ: ordinati[i + 1] ?? null };
}

// `posizione()` dà il posto corrente (vedi posizioneIn) e si richiama a ogni `evento` del documento (cambio dei filtri); `vai(elemento)` apre la scheda su quell'elemento.
// `etichette`: { gruppo, prec, succ } per i lettori di schermo. Le frecce ← → della tastiera funzionano col fuoco sulla barra.
export function barraNavigazione({ posizione, vai, etichette, evento }) {
  const radice = document.createElement('div');
  radice.className = 'scheda-nav';
  radice.setAttribute('role', 'group');
  radice.setAttribute('aria-label', etichette.gruppo);
  const bottone = (testo, etichetta, destinazione) => {
    const b = document.createElement('button');
    b.className = 'scheda-nav-freccia';
    b.type = 'button';
    b.textContent = testo;
    b.title = b.ariaLabel = etichetta;
    b.disabled = !destinazione;
    if (destinazione) b.addEventListener('click', () => vai(destinazione));
    return b;
  };
  const disegna = () => {
    const q = posizione();
    radice.hidden = !q;
    if (!q) return;
    const conta = document.createElement('span');
    conta.className = 'scheda-nav-conta';
    conta.textContent = t('scheda.nav.posto', { n: q.pos, tot: q.tot });
    conta.setAttribute('aria-live', 'polite');
    radice.replaceChildren(bottone('‹', etichette.prec, q.prec), conta, bottone('›', etichette.succ, q.succ));
  };
  radice.addEventListener('keydown', e => {
    const freccia = { ArrowLeft: 0, ArrowRight: 2 }[e.key];
    const b = freccia == null ? null : radice.children[freccia];
    if (b && !b.disabled) { e.preventDefault(); e.stopPropagation(); b.click(); }
  });
  const aggiorna = () => (radice.isConnected ? disegna() : document.removeEventListener(evento, aggiorna));
  disegna();
  if (evento) document.addEventListener(evento, aggiorna);
  return radice;
}

// Porta la mappa su `centro` e simula il clic lì, così si apre la scheda del punto. Il clic parte a mappa ferma e ridisegnata (`idle`):
// subito dopo lo spostamento la mappa non ha ancora disegnato la nuova vista, `queryRenderedFeatures` non troverebbe nulla e la scheda si chiuderebbe.
// `prima()` gira un attimo prima del clic (serve a chi deve ricordare quale elemento si è scelto).
const ATTESA_MAX_MS = 1200;
export function clicSu(map, centro, prima) {
  let fatto = false;
  const clicca = () => {
    if (fatto) return;
    fatto = true;
    clearTimeout(guardia);
    map.off('idle', clicca);
    prima?.();
    map.fire('click', { point: map.project(centro), lngLat: { lng: centro[0], lat: centro[1] }, mantieniVista: true });
  };
  const guardia = setTimeout(clicca, ATTESA_MAX_MS); // senza spostamento `idle` può non arrivare
  map.once('idle', clicca);
  map.jumpTo({ center: centro });
}
