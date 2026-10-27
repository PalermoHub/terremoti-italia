import { normalizza } from './aree.js';

// Territorio di un evento: regione, provincia, comune e codice ISTAT ricavati dal nome di luogo INGV
// e, quando il nome non basta, dai riquadri di comuni e province dell'indice (dati/indice-comuni.json).
// Restano vuoti i campi che non si possono dedurre con sufficiente sicurezza, per esempio per gli eventi in mare.
export const TERRITORIO_VUOTO = Object.freeze({ regione: null, provincia: null, comune: null, istat: null });

const CELLA = 0.1; // lato della cella della griglia dei comuni, in gradi (circa 11 km)
const MAX_PAROLE = 5; // nomi di comuni fino a cinque parole
const MARE = /\b(?:mare|mar|costa|coste|canale|golfo|stretto|adriatico|ionio|mediterraneo)\b/;

const pulisci = testo => normalizza(testo).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const dentro = ([ovest, sud, est, nord], lon, lat) => lon >= ovest && lon <= est && lat >= sud && lat <= nord;
const centro = ([ovest, sud, est, nord]) => [(ovest + est) / 2, (sud + nord) / 2];
const distanza = ([x, y], lon, lat) => (x - lon) ** 2 + (y - lat) ** 2;

// Indice pronto per le ricerche: nomi normalizzati e griglia dei riquadri dei comuni (costruita al primo uso).
export function preparaTerritorio(indice) {
  const regioneDi = new Map(indice.regioni.map(v => [v.cod, v.nome]));
  const provinciaDi = new Map(indice.province.map(v => [v.cod, v]));
  const perNome = new Map();
  for (const comune of indice.comuni) {
    const chiave = pulisci(comune.nome);
    if (!chiave) continue;
    const lista = perNome.get(chiave);
    if (lista) lista.push(comune);
    else perNome.set(chiave, [comune]);
  }

  let griglia = null;
  const grigliaDi = () => {
    if (griglia) return griglia;
    griglia = new Map();
    for (const comune of indice.comuni) {
      const [ovest, sud, est, nord] = comune.riquadro;
      for (let x = Math.floor(ovest / CELLA); x <= Math.floor(est / CELLA); x++) {
        for (let y = Math.floor(sud / CELLA); y <= Math.floor(nord / CELLA); y++) {
          const chiave = `${x},${y}`;
          const lista = griglia.get(chiave);
          if (lista) lista.push(comune);
          else griglia.set(chiave, [comune]);
        }
      }
    }
    return griglia;
  };

  const datiComune = comune => {
    const provincia = provinciaDi.get(comune.prov);
    const regione = regioneDi.get(provincia?.reg ?? comune.reg);
    return {
      regione: regione ?? null,
      provincia: provincia?.nome ?? null,
      comune: comune.nome,
      istat: String(comune.cod).padStart(6, '0'),
    };
  };

  // Il comune citato nel luogo (es. «5 km E Camerino (MC)»): si preferisce il nome tra parentesi, poi il più lungo;
  // a parità si sceglie quello il cui riquadro contiene l'epicentro o ne è più vicino.
  function comuneDalNome(luogo, lat, lon, coord) {
    const nome = pulisci(luogo);
    if (!nome) return null;
    const parentesi = /\(([^)]*)\)/.exec(luogo);
    const nomeParentesi = parentesi ? pulisci(parentesi[1]) : '';
    const parole = nome.split(' ').filter(Boolean);
    const trovati = [];
    for (let i = 0; i < parole.length; i++) {
      for (let j = i + 1; j <= Math.min(parole.length, i + MAX_PAROLE); j++) {
        const chiave = parole.slice(i, j).join(' ');
        const lista = perNome.get(chiave);
        if (lista) trovati.push({ chiave, lista, parole: j - i });
      }
    }
    if (!trovati.length) return null;
    const scelta = trovati.find(v => v.chiave === nomeParentesi) ?? trovati.reduce((a, b) => (b.parole > a.parole ? b : a));
    let candidati = scelta.lista;
    if (candidati.length > 1 && coord) {
      const contenuti = candidati.filter(c => dentro(c.riquadro, lon, lat));
      if (contenuti.length) candidati = contenuti;
      if (candidati.length > 1) candidati = [...candidati].sort((a, b) => distanza(centro(a.riquadro), lon, lat) - distanza(centro(b.riquadro), lon, lat));
    }
    return datiComune(candidati[0]);
  }

  // Senza un comune nel nome: la provincia (o la regione) vale solo se il punto è dentro un riquadro comunale,
  // cioè su terra, e se un solo riquadro di provincia lo contiene. Così gli eventi in mare restano vuoti.
  function provinciaDalPunto(lat, lon) {
    const vicini = grigliaDi().get(`${Math.floor(lon / CELLA)},${Math.floor(lat / CELLA)}`) ?? [];
    if (!vicini.some(c => dentro(c.riquadro, lon, lat))) return null;
    const province = indice.province.filter(v => dentro(v.riquadro, lon, lat));
    if (province.length === 1) {
      const provincia = province[0];
      return { ...TERRITORIO_VUOTO, regione: regioneDi.get(provincia.reg) ?? null, provincia: provincia.nome };
    }
    const regioni = indice.regioni.filter(v => dentro(v.riquadro, lon, lat));
    if (regioni.length === 1) return { ...TERRITORIO_VUOTO, regione: regioni[0].nome };
    return null;
  }

  return {
    indice,
    di(p) {
      const luogo = String(p?.luogo ?? '');
      const lat = Number(p?.lat);
      const lon = Number(p?.lon);
      const coord = Number.isFinite(lat) && Number.isFinite(lon);
      const dalNome = comuneDalNome(luogo, lat, lon, coord);
      if (dalNome) return dalNome;
      if (!coord || MARE.test(pulisci(luogo))) return TERRITORIO_VUOTO;
      return provinciaDalPunto(lat, lon) ?? TERRITORIO_VUOTO;
    },
  };
}

// Contesto condiviso dai moduli dell'app: l'indice arriva da territorio-eventi.js, che lo scarica una volta
// sola quando serve. `amministrazioneDi` resta in questo file puro, così i test possono importarlo senza DOM.
let contesto = null;
const cache = new Map();

export function impostaIndiceTerritorio(indice) {
  contesto = preparaTerritorio(indice);
  cache.clear();
  return contesto;
}

export function amministrazioneDi(p) {
  if (!contesto) return TERRITORIO_VUOTO;
  const chiave = `${p?.id ?? ''}|${p?.lat ?? ''}|${p?.lon ?? ''}|${p?.luogo ?? ''}`;
  let v = cache.get(chiave);
  if (!v) {
    v = contesto.di(p);
    cache.set(chiave, v);
  }
  return v;
}
