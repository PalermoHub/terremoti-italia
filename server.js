import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { creaServer } from './server/static.js';
import { apriArchivio } from './server/archivio.js';
import { scaricaIntervallo } from './server/ingv.js';
import { gestisciAllerte } from './server/allerte-core.js';
import { AREA, leggiParametri, rispondiTerremoti, rispondiTesto, rispondiRiepilogo } from './server/terremoti.js';

const radice = fileURLToPath(new URL('.', import.meta.url));
const porta = Number(process.env.PORT ?? 8766);
const INTERVALLO_MS = 2 * 60 * 1000;
const GIORNI_AGGIORNAMENTO = 30;
const MAGNITUDO_AGGIORNAMENTO = 1;

mkdirSync(`${radice}dati`, { recursive: true });
const archivio = apriArchivio(process.env.ARCHIVIO ?? `${radice}dati/terremoti.sqlite`);

// Gli ultimi giorni si rileggono sempre: l'INGV rivede magnitudo e coordinate degli eventi recenti
async function aggiorna() {
  try {
    const adesso = Date.now();
    const eventi = await scaricaIntervallo({ da: adesso - GIORNI_AGGIORNAMENTO * 86400000, a: adesso, magMin: MAGNITUDO_AGGIORNAMENTO, area: AREA });
    const cambiati = archivio.salva(eventi);
    if (cambiati) console.log(`archivio: ${cambiati} eventi nuovi o aggiornati`);
  } catch (e) { console.error(`aggiornamento INGV non riuscito: ${e.message}`); }
}

const json = (res, stato, corpo) => { res.writeHead(stato, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(corpo)); };

const cacheAllerte = {};

const gestisciExtra = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/allerte' && req.method === 'GET') {
    const r = await gestisciAllerte(fetch, cacheAllerte);
    res.writeHead(r.stato, r.intestazioni);
    res.end(r.corpo);
    return true;
  }
  if (url.pathname === '/terremoti/riepilogo' && req.method === 'GET') {
    try { const parametri = leggiParametri(url); json(res, 200, rispondiRiepilogo(archivio, parametri, parametri.bbox ?? AREA)); } catch (e) { json(res, 400, { errore: e.message }); }
    return true;
  }
  if (url.pathname !== '/terremoti' || req.method !== 'GET') return false;
  try {
    const parametri = leggiParametri(url);
    const area = parametri.bbox ?? AREA;
    if (parametri.testo) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(rispondiTesto(archivio, parametri, area)); } else json(res, 200, rispondiTerremoti(archivio, parametri, area));
  } catch (e) { json(res, 400, { errore: e.message }); }
  return true;
};

creaServer({ radice, gestisciExtra }).listen(porta, '127.0.0.1', () => {
  console.log(`Terremoti Italia su http://127.0.0.1:${porta}/`);
  aggiorna();
  setInterval(aggiorna, INTERVALLO_MS).unref();
});
