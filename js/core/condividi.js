import { filtro, profonditaDaFiltro } from '../layers/scheda-terremoti.js';
import { codificaStato, decodificaStato } from './condividi-stato.js';
import { EVENTO_FILTRO } from '../layers/scheda-terremoti-dom.js';
import { t } from './i18n.js';
import { segnala } from './pannello.js';

const PARAMETRI = ['strati', 'lng', 'tema', 'gg', 'magmin', 'magmax', 'prof', 'cl', 'fin', 'per', 'op', 'sto', 'ca', 'cb', 'cmag', 'cprof', 'ct', 'area', 'solo'];
const caselleStrati = () => [...document.querySelectorAll('#pannello input[type=checkbox][id^="strato-"]')];

export function statoCorrente({ storico = null, confronto = null, ricerca = null } = {}) {
  const opacita = Object.fromEntries([...document.querySelectorAll('#pannello input[data-opacita]')]
    .filter(r => !r.closest('.strato-opacita')?.hidden).map(r => [r.dataset.opacita, Number(r.value)]));
  return {
    opacita,
    storico: storico?.periodoVisibile() ?? null,
    confronto: confronto?.statoCondiviso() ?? null,
    area: ricerca?.stato() ?? null,
    strati: caselleStrati().filter(c => c.checked).map(c => c.id.slice(7)),
    filtro,
    tema: document.documentElement.dataset.tema === 'scuro' ? 'scuro' : 'chiaro',
    lingua: document.documentElement.lang,
  };
}

export function indirizzoCondivisibile(base = location.href, moduli = {}) {
  const u = new URL(base);
  // i parametri di un link precedente non devono sopravvivere se lo stato attuale non li ha più
  for (const k of PARAMETRI) u.searchParams.delete(k);
  for (const [k, v] of codificaStato(statoCorrente(moduli))) u.searchParams.set(k, v);
  return u.toString();
}

// Dopo il caricamento: strati e filtri del link. Gli strati sono quelli indicati, gli altri si spengono (come li vedeva chi ha condiviso).
export async function applicaStatoDaUrl(search = location.search, { storico = null, confronto = null, ricerca = null, map = null } = {}) {
  const s = decodificaStato(search);
  const vista = map && { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; // il confronto e l'area inquadrano il territorio: vale la vista del link
  if (s.strati) {
    const accesi = new Set(s.strati);
    // storico e confronto si accendono da soli quando caricano il loro periodo: accenderli a mano farebbe partire prima il periodo predefinito
    const dopo = new Set([s.storico && 'terremoti-storico', s.confronto && 'terremoti-confronto'].filter(Boolean));
    for (const c of caselleStrati()) {
      if (dopo.has(c.id.slice(7))) continue;
      const voluta = accesi.has(c.id.slice(7));
      if (c.disabled || c.checked === voluta) continue;
      c.checked = voluta;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (s.filtro) {
    Object.assign(filtro, s.filtro);
    document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));
  }
  for (const [id, v] of Object.entries(s.opacita ?? {})) {
    const r = document.querySelector(`#pannello input[data-opacita="${CSS.escape(id)}"]`);
    if (r) { r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  // territorio della ricerca prima dei periodi: lo storico e il confronto lo usano per restringere gli eventi
  if (s.area && ricerca) await ricerca.imposta(s.area).catch(() => {});
  if (s.storico && storico) await storico.mostraPeriodo(s.storico, filtro.magMin, profonditaDaFiltro()).catch(() => {});
  if (s.confronto && confronto) await confronto.impostaCondiviso(s.confronto).catch(() => {});
  if (vista) map.jumpTo(vista);
}

// Il tema del link vale per questa visita e non sostituisce la preferenza salvata
export function applicaTemaDaUrl(search = location.search) {
  const { tema } = decodificaStato(search);
  if (tema === 'scuro') document.documentElement.dataset.tema = 'scuro';
  else if (tema === 'chiaro') delete document.documentElement.dataset.tema;
}

export function collegaCondividi(bottone, { navigatore = navigator, appunti = navigator.clipboard, moduli = {} } = {}) {
  bottone.addEventListener('click', async () => {
    const url = indirizzoCondivisibile(location.href, moduli);
    try {
      if (navigatore.share) { await navigatore.share({ title: document.title, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; /* altro errore: si ripiega sulla copia */ }
    try { await appunti.writeText(url); segnala(t('condividi.copiato')); }
    catch { window.prompt(t('condividi.copiaManuale'), url); }
  });
}
