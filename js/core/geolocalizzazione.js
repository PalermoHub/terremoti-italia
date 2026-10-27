import { LIMITI } from './config.js';
import { t } from './i18n.js';

const ZOOM_POSIZIONE = 16;

// true se il punto cade nell'area coperta dalla mappa
export const dentroLimiti = (lat, lon) => lon >= LIMITI[0][0] && lon <= LIMITI[1][0] && lat >= LIMITI[0][1] && lat <= LIMITI[1][1];

// Pulsante «La mia posizione»: chiede la posizione al browser, la segna con un punto e porta la mappa lì.
export function collegaGeolocalizzazione(map, bottone, segnala, nav = globalThis.navigator) {
  if (!nav?.geolocation) { bottone.hidden = true; return; }
  let marcatore = null;
  bottone.addEventListener('click', () => {
    bottone.setAttribute('aria-busy', 'true');
    nav.geolocation.getCurrentPosition(p => {
      bottone.removeAttribute('aria-busy');
      const { latitude: lat, longitude: lon } = p.coords;
      if (!dentroLimiti(lat, lon)) return segnala(t('strumenti.posizioneFuori'));
      if (!marcatore) {
        const punto = document.createElement('div');
        punto.className = 'mia-posizione';
        marcatore = new maplibregl.Marker({ element: punto });
      }
      marcatore.setLngLat([lon, lat]).addTo(map);
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), ZOOM_POSIZIONE) });
    }, err => {
      bottone.removeAttribute('aria-busy');
      segnala(t(err?.code === 1 ? 'strumenti.posizioneNegata' : 'strumenti.posizioneNonDisponibile'));
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}
