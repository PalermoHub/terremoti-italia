import { t, localeIntl } from './i18n.js';
import { tabScheda } from './scheda-modello.js';

// «Talia racconta il luogo»: frasi semplici fatte dai numeri della scheda, senza LLM. Ogni frase nasce da una regola con una soglia scritta
// qui sotto e riporta il numero che l'ha fatta scattare; se il dato è vicino al normale la frase non esce e il motivo resta in `saltate`.
// Le sezioni della scheda portano i valori grezzi in `grezzi` (terreno, quotazioni OMI, sezione di censimento): il testo formattato non si rilegge.
// -> [{ tab, frasi: [{ testo, regola }], saltate: [testo] }] nell'ordine dei tab; i tab senza dati non compaiono.
const ORDINE = ['mercato', 'popolazione', 'terreno'];
const SOGLIE = { pendenzaRipida: 20, pendenzaPiatta: 3, stabilitaAlta: 4, stabilitaBassa: 2, fvAlto: 0.7, ombraEstMax: 20, fvBasso: 0.55, faldaMax: 3, rapportoAlto: 2, rapportoBasso: 0.5, anzianiAlto: 1.15, anzianiBasso: 0.85, metriLocazione: 80 };

const N = (v, d = 0) => Number(v).toLocaleString(localeIntl(), { maximumFractionDigits: d });
const ha = v => v != null && v !== '' && Number.isFinite(Number(v));

function terreno(p) {
  const frasi = [], saltate = [];
  if (ha(p.slope_pct)) {
    const pct = Number(p.slope_pct);
    if (pct >= SOGLIE.pendenzaRipida) frasi.push({ testo: t('parole.terreno.ripido', { pct: N(pct, 1), gradi: N(p.slope_deg, 1) }), regola: t('parole.regola.pendenzaRipida', { s: SOGLIE.pendenzaRipida }) });
    else if (pct <= SOGLIE.pendenzaPiatta) frasi.push({ testo: t('parole.terreno.piatto', { pct: N(pct, 1) }), regola: t('parole.regola.pendenzaPiatta', { s: SOGLIE.pendenzaPiatta }) });
    else saltate.push(t('parole.saltata.pendenza', { pct: N(pct, 1), min: SOGLIE.pendenzaPiatta, max: SOGLIE.pendenzaRipida }));
  }
  const stab = Number(p.stabilita);
  if (Number.isInteger(stab) && stab >= 1 && stab <= 5) {
    if (stab >= SOGLIE.stabilitaAlta) frasi.push({ testo: t('parole.terreno.instabile', { c: stab }), regola: t('parole.regola.stabilitaAlta', { s: SOGLIE.stabilitaAlta }) });
    else if (stab <= SOGLIE.stabilitaBassa) frasi.push({ testo: t('parole.terreno.stabile', { c: stab }), regola: t('parole.regola.stabilitaBassa', { s: SOGLIE.stabilitaBassa }) });
    else saltate.push(t('parole.saltata.stabilita', { c: stab }));
  }
  if (ha(p.fv) && ha(p.ombra_est)) {
    const fv = Number(p.fv), ombra = Math.round(Number(p.ombra_est) / 2.55); // l'ombra è salvata su 0-255
    const vars = { fv: N(fv * 100), ombra: N(ombra) };
    if (fv >= SOGLIE.fvAlto && ombra <= SOGLIE.ombraEstMax) frasi.push({ testo: t('parole.terreno.sole', vars), regola: t('parole.regola.sole', { fv: SOGLIE.fvAlto * 100, ombra: SOGLIE.ombraEstMax }) });
    else if (fv <= SOGLIE.fvBasso) frasi.push({ testo: t('parole.terreno.pocoSole', vars), regola: t('parole.regola.pocoSole', { fv: SOGLIE.fvBasso * 100 }) });
    else saltate.push(t('parole.saltata.sole', { fv: N(fv * 100) }));
  }
  if (ha(p.dtw)) {
    const m = Number(p.dtw);
    if (m <= SOGLIE.faldaMax) frasi.push({ testo: t('parole.terreno.falda', { m: N(m, 1) }), regola: t('parole.regola.falda', { s: SOGLIE.faldaMax }) });
    else saltate.push(t('parole.saltata.falda', { m: N(m, 1), s: SOGLIE.faldaMax }));
  }
  return { frasi, saltate };
}

function mercato(o) {
  const frasi = [];
  if (o.zona) frasi.push({ testo: t('parole.omi.zona', { zona: o.zona, fascia: String(o.fascia ?? '').toLowerCase() }), regola: t('parole.regola.omiZona') });
  if (ha(o.cMin) && ha(o.cMax)) frasi.push({ testo: t('parole.omi.compravendita', { min: N(o.cMin), max: N(o.cMax), sup: o.sup ? ` (${o.sup})` : '' }), regola: t('parole.regola.omiCompravendita') });
  if (ha(o.lMin) && ha(o.lMax)) {
    frasi.push({
      testo: t('parole.omi.affitto', { min: N(o.lMin, 1), max: N(o.lMax, 1), mq: SOGLIE.metriLocazione, totMin: N(o.lMin * SOGLIE.metriLocazione), totMax: N(o.lMax * SOGLIE.metriLocazione) }),
      regola: t('parole.regola.omiAffitto', { mq: SOGLIE.metriLocazione }),
    });
  }
  return { frasi, saltate: [] };
}

// densità e indice di vecchiaia si confrontano con la mediana delle sezioni comunali (`mediane`), se la scheda la porta
function popolazione(p) {
  const frasi = [], saltate = [];
  const confronto = (valore, mediana) => (ha(valore) && ha(mediana) && Number(mediana) > 0 ? Number(valore) / Number(mediana) : null);
  const rD = confronto(p.densita, p.mediane?.densita);
  if (rD != null) {
    const vars = { n: N(p.densita), mediana: N(p.mediane.densita) };
    if (rD >= SOGLIE.rapportoAlto) frasi.push({ testo: t('parole.pop.densa', vars), regola: t('parole.regola.densitaAlta', { r: N(rD, 1), s: SOGLIE.rapportoAlto }) });
    else if (rD <= SOGLIE.rapportoBasso) frasi.push({ testo: t('parole.pop.rada', vars), regola: t('parole.regola.densitaBassa', { r: N(rD, 1), s: SOGLIE.rapportoBasso }) });
    else saltate.push(t('parole.saltata.densita', vars));
  }
  const rV = confronto(p.vecchiaia, p.mediane?.vecchiaia);
  if (rV != null) {
    const vars = { n: N(p.vecchiaia), mediana: N(p.mediane.vecchiaia) };
    if (rV >= SOGLIE.anzianiAlto) frasi.push({ testo: t('parole.pop.anziana', vars), regola: t('parole.regola.anziani', { r: N(rV, 2), s: SOGLIE.anzianiAlto }) });
    else if (rV <= SOGLIE.anzianiBasso) frasi.push({ testo: t('parole.pop.giovane', vars), regola: t('parole.regola.giovani', { r: N(rV, 2), s: SOGLIE.anzianiBasso }) });
    else saltate.push(t('parole.saltata.vecchiaia', vars));
  }
  return { frasi, saltate };
}

const GENERATORI = { mercato: s => mercato(s.grezzi), popolazione: s => popolazione(s.grezzi), terreno: s => terreno(s.grezzi) };

export function paroleScheda(sezioni) {
  const perTab = new Map();
  for (const s of sezioni ?? []) {
    const tab = tabScheda(s.peso, s.chiave);
    if (!s.grezzi || !GENERATORI[tab] || perTab.has(tab)) continue; // la prima sezione di ogni tab (come il riepilogo in testa)
    perTab.set(tab, GENERATORI[tab](s));
  }
  return ORDINE.filter(tab => perTab.has(tab) && (perTab.get(tab).frasi.length || perTab.get(tab).saltate.length)).map(tab => ({ tab, ...perTab.get(tab) }));
}
