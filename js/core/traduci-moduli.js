// I moduli-layer hanno titoli, etichette e descrizioni scritti in italiano nel codice (sono anche dati: gli id restano
// fissi). In inglese si traducono una volta sola all'avvio, con le voci `lbl.<testo>` dei dizionari; ciò che non è
// nel dizionario (un nome proprio, una categoria dei dati) resta com'è.
import { tl, lingua } from './i18n.js';

const voci = lista => lista.map(v => ({ ...v, etichetta: tl(v.etichetta) }));
const sottovoci = lista => lista.map(g => ({ ...g, titolo: tl(g.titolo), voci: voci(g.voci ?? []) }));

function traduciStrato(s) {
  if (s.etichetta) s.etichetta = tl(s.etichetta);
  if (s.sezione) s.sezione = tl(s.sezione);
  if (s.sottosezione) s.sottosezione = tl(s.sottosezione);
  if (s.nota) s.nota = tl(s.nota);
  const d = Object.getOwnPropertyDescriptor(s, 'sottovoci');
  if (d?.get) Object.defineProperty(s, 'sottovoci', { configurable: true, enumerable: true, get() { return sottovoci(d.get.call(this)); } });
  else if (d?.value) s.sottovoci = sottovoci(d.value);
}

export function traduciModuli(moduli) {
  if (lingua() === 'it') return moduli;
  for (const m of moduli) {
    if (m.titolo) m.titolo = tl(m.titolo);
    if (m.sezione) m.sezione = tl(m.sezione);
    if (m.argomento) m.argomento = { ...m.argomento, titolo: tl(m.argomento.titolo), descrizione: tl(m.argomento.descrizione) };
    for (const s of m.strati ?? []) traduciStrato(s);
  }
  return moduli;
}
