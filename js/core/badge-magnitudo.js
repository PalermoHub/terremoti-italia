import { coloreMagnitudo } from './magnitudo.js';

// Testo bianco o scuro, secondo la luminanza del colore di fondo (#rrggbb): il badge resta leggibile su ogni classe
const testoSu = colore => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(colore.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f2937' : '#fff';
};

// Badge della magnitudo di un evento, a tinta piena con il colore della sua classe (lo stesso dei cerchi in mappa e della legenda).
// `testo` = cosa scrivere nel badge (es. «M 3,4»); stili in `.badge-mag` (css/app.css).
export function badgeMagnitudo(mag, testo) {
  const badge = document.createElement('span');
  const colore = Number.isFinite(mag) ? coloreMagnitudo(mag) : '#868e96';
  badge.className = 'badge-mag';
  badge.style.cssText = `--tinta:${colore};--testo-tinta:${testoSu(colore)}`;
  badge.textContent = testo;
  return badge;
}
