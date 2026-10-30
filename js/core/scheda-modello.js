// Modello puro della scheda del luogo: unisce i frammenti dei vari moduli in sezioni ordinate,
// senza ripetizioni e con il contesto amministrativo portato una sola volta nell'intestazione.
//
// Una voce è { chiave, peso, titolo, badge?, contesto?, gruppi?, accordion?, link?, nota?, fonte?, collassabile? }
//   gruppo   = { titolo?, righe: [{ etichetta, valore, classe?, ripiego?: livello }], griglia?: [{ valore, chiave }] }
//   sempre? = la sezione resta anche senza righe (titolo e badge bastano)
//   luogo? = chiave del luogo fisico (vedi chiaveLuogo): voci con lo stesso luogo diventano una sola scheda
//   immagine = { url, alt }, testo = paragrafo di presentazione (mostrati sotto il titolo)
//   legale? = la sezione riguarda dati senza valore legale: l'avviso compare una sola volta in fondo alla scheda
//   aperta? = false: sezione collassabile chiusa all'apertura della scheda
//   accordion = { riassunto, elementi: [{ titolo, stato?, anteprima?, righe }] }
import { t } from './i18n.js';

export const NOTA_LEGALE = t('scheda.notaLegale');
export const MANCANTE = 'senza dato'; // i18n-ok: valore del modello dati (identità), mai mostrato così

const pieno = v => v != null && v !== '';

const GENERICHE = new Set(['scuola', 'scuole', 'primaria', 'secondaria', 'infanzia', 'media', 'materna', 'asilo', 'nido',
  'epoca', 'd', 'di', 'e', 'plesso', 'istituto', 'comprensivo', 'direzione', 'didattica', 'statale']);

// Chiave del luogo dal nome: senza accenti, apostrofi e parole generiche ("Scuola primaria NICOLO' TURRISI",
// "Scuola d'Epoca Nicolò Turrisi" e "Nicolo' Turrisi" danno la stessa chiave). Vuota se resta troppo poco.
export function chiaveLuogo(nome) {
  const parole = String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(w => w && !GENERICHE.has(w));
  return parole.length >= 2 ? [...new Set(parole)].sort().join(' ') : '';
}

function aggiungiGruppo(sezione, gruppo) {
  let g = sezione.gruppi.find(x => x.titolo === gruppo.titolo);
  if (!g) {
    g = { titolo: gruppo.titolo, righe: [] };
    sezione.gruppi.push(g);
  }
  if (gruppo.evidenzia) g.evidenzia = gruppo.evidenzia;
  for (const r of gruppo.righe ?? []) {
    // riga `ripiego` (livello 1, 2…): vale solo se la scheda non ha già una riga con la stessa etichetta di
    // livello pari o migliore (0 = riga normale); una riga di livello migliore sostituisce quelle peggiori
    const liv = r.ripiego ?? 0;
    const stesse = sezione.gruppi.flatMap(x => x.righe).filter(x => x.etichetta === r.etichetta && x.valore !== r.valore);
    if (stesse.some(x => (x.ripiego ?? 0) <= liv)) continue;
    for (const x of sezione.gruppi) x.righe = x.righe.filter(y => !(y.etichetta === r.etichetta && (y.ripiego ?? 0) > liv));
    if (!g.righe.some(x => x.etichetta === r.etichetta && x.valore === r.valore)) g.righe.push(r);
  }
  if (gruppo.griglia) {
    g.griglia ??= [];
    for (const c of gruppo.griglia) if (!g.griglia.some(x => x.chiave === c.chiave)) g.griglia.push(c);
  }
}

const conContenuto = s =>
  s.gruppi.some(g => g.righe.length || g.griglia?.length) || s.accordion?.elementi?.length > 0 || s.link || s.testo || s.immagine || s.avviso || s.sempre;

export function unisci(voci) {
  const contesto = {};
  let legale = false;
  const perChiave = new Map();
  for (const v of voci) {
    if (v.legale) legale = true;
    for (const [k, val] of Object.entries(v.contesto ?? {})) if (pieno(val) && !(k in contesto)) contesto[k] = val;
    const id = v.luogo ? `luogo:${v.luogo}` : v.chiave;
    let s = perChiave.get(id);
    if (!s) {
      const { contesto: _scartato, gruppi: _g, legale: _l, ...resto } = v;
      s = { ...resto, gruppi: [], badges: v.badge ? [v.badge] : [] };
      perChiave.set(id, s);
    } else {
      const pesoPrima = s.peso;
      if (v.peso < s.peso) Object.assign(s, { peso: v.peso, titolo: v.titolo, icona: v.icona, chiave: v.chiave }); // titolo della voce principale
      for (const campo of ['badge', 'link', 'accordion', 'miniatura', 'nota', 'immagine', 'testo', 'avviso']) s[campo] ??= v[campo];
      if (v.badge && !s.badges.includes(v.badge)) s.badges[v.peso < pesoPrima ? 'unshift' : 'push'](v.badge);
      // fonti diverse della stessa scheda: una per riga
      if (v.fonte && !(s.fonte ?? '').split('\n').includes(v.fonte)) s.fonte = s.fonte ? `${s.fonte}\n${v.fonte}` : v.fonte;
    }
    for (const g of v.gruppi ?? []) aggiungiGruppo(s, g);
  }
  for (const s of perChiave.values()) s.gruppi = s.gruppi.filter(g => g.righe.length || g.griglia?.length);
  const sezioni = [...perChiave.values()].filter(conContenuto).sort((a, b) => a.peso - b.peso);
  return { contesto, sezioni, legale };
}

// Sezioni che arrivano dopo l'apertura della scheda (es. RNDT, dopo le risposte dei servizi): prendono il posto di quelle
// con la stessa famiglia di chiave (il segnaposto incluso). `nuovi` è il risultato di `unisci()` sulle voci arrivate.
export function sezioniConRitardo(dati, nuovi, prefisso = 'rndt:') {
  const rimaste = dati.sezioni.filter(s => !String(s.chiave).startsWith(prefisso));
  return { ...dati, sezioni: [...rimaste, ...nuovi.sezioni].sort((a, b) => a.peso - b.peso), legale: dati.legale || nuovi.legale };
}

export function testoContesto({ circoscrizione, quartiere, upl } = {}) {
  return [
    pieno(circoscrizione) && t('scheda.contesto.circoscrizione', { nome: circoscrizione }),
    pieno(quartiere) && t('scheda.contesto.quartiere', { nome: quartiere }),
    pieno(upl) && t('scheda.contesto.upl', { nome: upl }),
  ].filter(Boolean).join(' · ');
}

const PARTICELLE = new Set(['di', 'da', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'e', 'in', 'a', 'la', 'il', 'lo', 'le']);

// "VIA DI SANT'ANNA" → "Via di Sant'Anna": le particelle restano minuscole, le iniziali (anche dopo apostrofo) maiuscole.
function maiuscoleItaliane(testo) {
  return testo.toLowerCase().split(' ').map((w, i) =>
    (i > 0 && PARTICELLE.has(w)) ? w : w.replace(/(^|['’-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())).join(' ');
}

// Titolo della scheda: evento o comune se è stato cliccato uno dei due, poi l'indirizzo (via e civico), altrimenti un titolo generico.
export function titoloScheda(sezioni) {
  if (sezioni.some(s => /^terremoto-/.test(String(s.chiave)))) return t('scheda.titoloEvento');
  const comune = sezioni.find(s => s.tipo === 'comune')?.gruppi.flatMap(g => g.righe).find(r => r.etichetta === t('comune.sismico.comune'))?.valore;
  if (pieno(comune)) return t('scheda.titoloComune', { nome: comune });
  const righe = sezioni.find(s => s.chiave === 'indirizzo')?.gruppi.flatMap(g => g.righe) ?? [];
  const valore = nome => righe.find(r => r.etichetta === nome)?.valore;
  const via = valore('Via');
  if (!via) return t('scheda.titoloGenerico');
  const civico = valore('Civico');
  return civico ? `${maiuscoleItaliane(via)}, ${civico}` : maiuscoleItaliane(via);
}

// Due o più righe «senza dato» si riassumono in una sola riga; una sola resta dov'è.
export function separaMancanti(righe) {
  const mancanti = righe.filter(r => r.valore === MANCANTE);
  if (mancanti.length < 2) return { presenti: righe, mancanti: [] };
  return { presenti: righe.filter(r => r.valore !== MANCANTE), mancanti: mancanti.map(r => r.etichetta) };
}

// "Alta costruibilità (slope<5°)" → valore breve nel badge, soglia in una nota a parte.
export function dividiDettaglio(valore) {
  const m = /^(.*?)\s+\((.+)\)$/.exec(valore);
  return m ? { valore: m[1], dettaglio: m[2] } : { valore, dettaglio: '' };
}

export const valoreLungo = valore => String(valore).length > 24;

// Il tab di una sezione della scheda, dal suo peso (e per alcune dalla chiave)
export const tabScheda = (p, chiave = '') => (/^terremoto-storico-/.test(String(chiave)) ? 'storico' : p === 100 ? 'rndt' : p === 20 || p === 40 || p === 50 || /^(pai|incendio)[:-]/.test(String(chiave)) ? 'strumenti' : p === 60 ? 'mercato' : p === 70 ? 'popolazione' : p === 80 ? 'terreno' : p === 90 ? 'servizi' : p >= 94 && p <= 96 ? 'pnrr' : p >= 97 && p <= 99 ? 'opere' : p >= 101 && p <= 103 ? 'piano' : 'luogo');

// Il tab dedicato di uno strato, dedotto dalle sue voci (peso/chiave): null se stanno tutte nel tab Luogo
export const tabDedicato = voci => voci.map(v => tabScheda(v.peso, v.chiave)).find(t => t !== 'luogo') ?? null;
