// Internazionalizzazione IT/EN: dizionari piatti (js/locales/<lingua>.json), chiavi a punti, segnaposto {nome}.
// L'italiano è la lingua base e la riserva: una chiave mancante in inglese cade sul testo italiano.
// Cambiare lingua ricarica la pagina, quindi t() si risolve una volta sola, al caricamento dei moduli.
const CHIAVE = 'dt-lingua';
const LINGUE = ['it', 'en'];
const LOCALE = { it: 'it-IT', en: 'en-GB' };

let corrente = 'it';
let dizionario = {};
let riserva = {};

export function rilevaLingua(storage, navigatore, sessione = null) {
  let salvata = null;
  try { salvata = storage?.getItem(CHIAVE); } catch (e) { /* storage non disponibile: si prova la sessione, poi il browser */ }
  if (!LINGUE.includes(salvata)) { try { salvata = sessione?.getItem(CHIAVE); } catch (e) { /* idem */ } }
  if (LINGUE.includes(salvata)) return salvata;
  const l = String(navigatore?.language || 'it').toLowerCase();
  return l.startsWith('it') ? 'it' : 'en';
}

export function impostaDizionari(l, principale, italiano) {
  corrente = LINGUE.includes(l) ? l : 'it';
  dizionario = principale || {};
  riserva = italiano || {};
}

export const lingua = () => corrente;
export const localeIntl = () => LOCALE[corrente];

export function t(chiave, vars) {
  const s = dizionario[chiave] ?? riserva[chiave];
  if (s === undefined) {
    console.warn(`i18n: manca la chiave «${chiave}»`); // i18n-ok: messaggio solo per la console
    return chiave;
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

// Testi del modello dati (etichette di riga, titoli di sezione, note delle schede): restano italiani nei moduli che li
// producono, perché fanno da identità (preferenze salvate, confronti); si traducono solo al momento di mostrarli.
// In inglese cerca «lbl.<testo italiano>»; se manca (un nome proprio, un dato) restituisce il testo senza avvisi.
export const tl = testo => (corrente === 'it' || typeof testo !== 'string' || !testo ? testo : dizionario[`lbl.${testo}`] ?? testo);

// Schemi e screenshot con testo scritto nell'immagine: in inglese esiste la variante «.en.svg» / «.en.webp» (stesso nome, stesso formato).
const VARIANTI_EN = new Set(['img/guida/passi/intersezione.svg', 'img/guida/passi/trasporto-strip.webp']);
export const immagine = file => (corrente === 'en' && VARIANTI_EN.has(file) ? file.replace(/\.(svg|webp)$/, '.en.$1') : file);

// plurale: usa <base>.uno per n === 1, <base>.altri altrimenti; {n} è sempre disponibile
export const tn = (base, n, vars) => t(`${base}.${n === 1 ? 'uno' : 'altri'}`, { n, ...vars });

const ATTRIBUTI = {
  'data-i18n-title': 'title', 'data-i18n-aria': 'aria-label', 'data-i18n-placeholder': 'placeholder',
  'data-i18n-content': 'content', 'data-i18n-alt': 'alt',
};

// applica le traduzioni agli elementi marcati; data-i18n-html solo per testi nostri (mai da input utente)
export function applicaDom(radice = document) {
  // una chiave assente da entrambi i dizionari (es. it.json non si è caricato) lascia l'italiano scritto nell'HTML: meglio di una chiave grezza
  const applica = (attr, fn) => radice.querySelectorAll(`[${attr}]`).forEach(el => {
    const k = el.getAttribute(attr);
    const v = t(k); // se manca ovunque avvisa in console e restituisce la chiave
    if (k in dizionario || k in riserva) fn(el, v);
  });
  applica('data-i18n', (el, v) => { el.textContent = v; });
  applica('data-i18n-html', (el, v) => { el.innerHTML = v; });
  for (const [attr, dest] of Object.entries(ATTRIBUTI)) applica(attr, (el, v) => el.setAttribute(dest, v));
  radice.documentElement?.setAttribute('lang', corrente);
}

function storageSicuro() { try { return globalThis.localStorage; } catch (e) { return null; } }
function sessioneSicura() { try { return globalThis.sessionStorage; } catch (e) { return null; } }

export async function caricaDizionari({ fetchFn = fetch, storage, navigatore, base = new URL('../locales/', import.meta.url) } = {}) {
  const l = rilevaLingua(storage ?? storageSicuro(), navigatore ?? globalThis.navigator, sessioneSicura());
  const leggi = async nome => {
    try {
      const r = await fetchFn(new URL(`${nome}.json`, base));
      return r.ok ? await r.json() : {};
    } catch (e) { return {}; }
  };
  const [italiano, principale] = await Promise.all([leggi('it'), l === 'it' ? null : leggi(l)]);
  impostaDizionari(l, l === 'it' ? italiano : principale, italiano);
  return l;
}

export function impostaLingua(l, { storage = storageSicuro(), sessione = sessioneSicura(), ricarica = () => location.reload() } = {}) {
  if (l === corrente) return;
  try { storage?.setItem(CHIAVE, l); } catch (e) {
    // localStorage bloccato (navigazione privata): la scelta vale per la sessione della scheda
    try { sessione?.setItem(CHIAVE, l); } catch (e2) { /* nessuna memoria: la lingua tornerà quella del browser */ }
  }
  ricarica();
}

const GLOBO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>';

// pulsante «globo + IT/EN»: mostra la lingua corrente, un clic passa all'altra
export function creaInterruttoreLingua(doc, opzioni = {}) {
  const altra = corrente === 'it' ? 'en' : 'it';
  const b = doc.createElement('button');
  b.id = 'switch-lingua';
  b.type = 'button';
  b.innerHTML = `${GLOBO}<span class="lingua-sigla">${corrente.toUpperCase()}</span>`;
  b.title = t('lingua.passa');
  b.setAttribute('aria-label', t('lingua.etichetta', { sigla: corrente.toUpperCase() })); // contiene la sigla visibile (WCAG 2.5.3)
  b.addEventListener('click', () => impostaLingua(altra, opzioni));
  return b;
}
