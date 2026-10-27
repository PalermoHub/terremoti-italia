// Strati puntuali i cui dati (GeoJSON) non devono bloccare l'avvio.
// La sorgente nasce vuota; l'indirizzo dei dati si ricorda e si scarica dopo: al primo bisogno
// (accensione dello strato, clic sulla mappa) o in secondo piano poco dopo l'avvio.
import { t as tr } from './i18n.js';
const VUOTO = { type: 'FeatureCollection', features: [] };
const ATTESA_MAX = 20000; // oltre questo tempo la scheda risponde comunque
const ATTESA_PRIMO_CONTROLLO = 150;

// Vista della mappa il cui addSource sostituisce gli indirizzi dei GeoJSON con dati vuoti e li registra in `urls`.
// Il resto della mappa resta quello vero: niente da ripristinare e nessuna modifica all'oggetto originale.
function mappaConSorgentiVuote(map, urls) {
  const addSource = (id, spec) => {
    if (spec.type === 'geojson' && typeof spec.data === 'string') {
      urls.set(id, spec.data);
      return map.addSource(id, { ...spec, data: VUOTO });
    }
    return map.addSource(id, spec);
  };
  return new Proxy(map, {
    get(t, chiave) {
      if (chiave === 'addSource') return addSource;
      const v = t[chiave];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

// Attende che tutte le sorgenti siano caricate, senza interrogarle a intervalli: si ricontrolla a ogni `sourcedata`.
function attendiSorgenti(map, ids, attesaMax = ATTESA_MAX) {
  return new Promise(ok => {
    const pronte = () => ids.every(id => map.getSource(id) && map.isSourceLoaded(id));
    let primo, limite;
    const fine = () => { clearTimeout(primo); clearTimeout(limite); map.off('sourcedata', controlla); ok(); };
    const controlla = () => { if (pronte()) fine(); };
    // setData avvia il caricamento in modo asincrono: il primo controllo non è immediato
    primo = setTimeout(controlla, ATTESA_PRIMO_CONTROLLO);
    limite = setTimeout(fine, attesaMax);
    map.on('sourcedata', controlla);
  });
}

export function creaDifferiti(map, { segnala = () => {}, attesaMax = ATTESA_MAX, suAttesa = () => {} } = {}) {
  const carica = new Map(); // id modulo → funzione che scarica i dati (una sola volta)
  const sorgenti = [];
  let promessa = null;

  // Aggiunge le sorgenti del modulo a dati vuoti e fa partire il caricamento alla prima accensione di uno dei suoi strati.
  function aggiungi(modulo) {
    const urls = new Map();
    modulo.aggiungiSorgenti(mappaConSorgentiVuote(map, urls));
    sorgenti.push(...urls.keys());
    let caricamento = null;
    carica.set(modulo.id, () => caricamento ??= (() => {
      for (const [id, url] of urls) map.getSource(id)?.setData(url);
      Promise.resolve(modulo.avvia?.(map)).catch(e => segnala(tr('avviso.stratoNonCaricato.dettaglio', { nome: e?.message ?? e })));
      return attendiSorgenti(map, [...urls.keys()], attesaMax);
    })());
    for (const strato of modulo.strati) {
      const suCambio = strato.suCambio;
      strato.suCambio = function (attivo, mp) { if (attivo) suAttesa(carica.get(modulo.id)()); return suCambio?.call(this, attivo, mp); };
    }
  }

  // Promessa dei dati differiti: la scheda la attende prima di rispondere a un clic arrivato troppo presto.
  const tutti = () => promessa ??= (async () => {
    for (const f of carica.values()) f();
    await attendiSorgenti(map, sorgenti, attesaMax);
  })();

  return { aggiungi, tutti };
}
