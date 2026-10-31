import { VISTA_ITALIA, ZOOM_SLIDER } from './config.js';
import { collegaGeolocalizzazione } from './geolocalizzazione.js';
import { segnala } from './pannello.js';

// Tema chiaro/scuro: il pulsante della barra strumenti lo cambia e lo ricorda
function collegaTema(bottone) {
  const mostra = scuro => bottone.setAttribute('aria-pressed', String(scuro));
  mostra(document.documentElement.dataset.tema === 'scuro');
  bottone.addEventListener('click', () => {
    const scuro = document.documentElement.dataset.tema !== 'scuro';
    if (scuro) document.documentElement.dataset.tema = 'scuro'; else delete document.documentElement.dataset.tema;
    try { localStorage.setItem('dt-tema', scuro ? 'scuro' : 'chiaro'); } catch { /* storage bloccato */ }
    mostra(scuro);
    document.dispatchEvent(new CustomEvent('tema', { detail: scuro }));
  });
}

// Barra degli strumenti: vista iniziale, posizione, schermo intero, tema, slider dello zoom sincronizzato con la mappa.
export function collegaStrumenti(map) {
  collegaTema(document.getElementById('btn-tema'));
  collegaGeolocalizzazione(map, document.getElementById('btn-posizione'), segnala);
  const slider = document.getElementById('zoom-slider');
  const badge = document.getElementById('zoom-badge');
  const mostra = z => {
    slider.value = z;
    badge.textContent = Number.isInteger(z) ? String(z) : z.toFixed(1);
  };
  document.getElementById('btn-home').addEventListener('click', () => {
    map.fitBounds(VISTA_ITALIA, { padding: 24, bearing: 0, pitch: 0 });
  });
  document.getElementById('btn-zoom-piu').addEventListener('click', () => map.zoomIn()); // solo telefono: sostituiscono i + / − di MapLibre
  document.getElementById('btn-zoom-meno').addEventListener('click', () => map.zoomOut());
  document.getElementById('btn-fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  slider.min = ZOOM_SLIDER[0];
  slider.max = ZOOM_SLIDER[1];
  slider.addEventListener('input', () => map.setZoom(Number(slider.value)));
  map.on('zoom', () => mostra(map.getZoom()));
  mostra(map.getZoom());
}
