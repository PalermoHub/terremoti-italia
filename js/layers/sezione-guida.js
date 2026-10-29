import { t } from '../core/i18n.js';
import { svgIcona } from '../core/icone.js';
import { SEMILARGHEZZE_KM } from './scheda-sezione.js';

// Popup che spiega come si traccia la sezione verticale: un disegno in tre passi (clic su A, clic su B, risultato).
// Si apre quando si accende lo strato; si chiude con la X, con Esc o con un clic fuori, e «Non mostrare più» lo spegne per sempre.
export const CHIAVE_GUIDA_SEZIONE = 'dt-guida-sezione-nascosta';

let nodo = null;
let scollega = null; // toglie l'ascolto di Esc

export function guidaSezioneNascosta(storage) {
  try { return storage?.getItem(CHIAVE_GUIDA_SEZIONE) === '1'; } catch { return false; }
}

function nascondiPerSempre(storage) {
  try { storage?.setItem(CHIAVE_GUIDA_SEZIONE, '1'); } catch { /* storage bloccato: vale la sessione */ }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Tre riquadri affiancati: la mappa con il primo clic, la mappa con la linea e la fascia, il grafico profondità/distanza
function disegno() {
  const mappa = (x, conB) => `
    <g transform="translate(${x} 34)">
      <rect class="sg-mappa" width="170" height="130" rx="6"/>
      <path class="sg-costa" d="M0 96 C28 86 40 104 66 94 S112 70 138 82 S160 70 170 64 V130 H0Z"/>
      <path class="sg-costa" d="M92 0 C86 22 104 34 98 56 S116 78 122 100 L170 108 V0Z" opacity=".55"/>
      ${conB ? `<rect class="sg-fascia" x="26" y="51" width="114" height="34" rx="2" transform="rotate(31.5 83 68)"/>
      <line class="sg-linea" x1="34" y1="38" x2="132" y2="98"/>` : ''}
      <circle class="sg-punto" cx="34" cy="38" r="7"/><text class="sg-lettera" x="34" y="42" text-anchor="middle">A</text>
      ${conB ? '<circle class="sg-punto" cx="132" cy="98" r="7"/><text class="sg-lettera" x="132" y="102" text-anchor="middle">B</text>'
        : '<path class="sg-mano" d="M146 80 l0 22 l5 -4 l4 9 l4 -2 l-4 -9 l7 0z"/>'}
    </g>`;
  const grafico = `
    <g transform="translate(396 34)">
      <rect class="sg-mappa" width="170" height="130" rx="6"/>
      <line class="sg-asse" x1="22" y1="18" x2="22" y2="108"/><line class="sg-asse" x1="22" y1="18" x2="158" y2="18"/>
      <text class="sg-lettera-sm" x="22" y="12">A</text><text class="sg-lettera-sm" x="158" y="12" text-anchor="end">B</text>
      ${[[40,26,3],[52,30,2.5],[64,38,3.5],[76,46,2.5],[88,56,4],[98,62,3],[108,74,3.5],[118,80,2.5],[126,90,4],[136,96,3],[146,104,3.5],[60,27,2],[84,50,2],[112,70,2]]
        .map(([x, y, r], i) => `<circle class="sg-evento sg-p${i % 3}" cx="${x}" cy="${y}" r="${r}"/>`).join('')}
      <text class="sg-lettera-sm" x="26" y="124">${esc(t('terremoti.sez.guida.assi'))}</text>
    </g>`;
  const freccia = x => `<path class="sg-freccia" d="M${x} 99 h14 m-5 -5 l5 5 l-5 5"/>`;
  const num = (x, n) => `<circle class="sg-num" cx="${x}" cy="16" r="10"/><text class="sg-num-t" x="${x}" y="20" text-anchor="middle">${n}</text>`;
  const didascalia = (x, chiave) => `<text class="sg-didascalia" x="${x}" y="184" text-anchor="middle">${esc(t(chiave))}</text>`;
  return `<svg viewBox="0 0 566 196" role="img" aria-label="${esc(t('terremoti.sez.guida.aria'))}" class="sezione-guida-svg">
    ${mappa(0, false)}${freccia(176)}${mappa(198, true)}${freccia(374)}${grafico}
    ${num(85, 1)}${num(283, 2)}${num(481, 3)}
    ${didascalia(85, 'terremoti.sez.guida.passo1')}${didascalia(283, 'terremoti.sez.guida.passo2')}${didascalia(481, 'terremoti.sez.guida.passo3')}
  </svg>`;
}

export function chiudiGuidaSezione() {
  scollega?.();
  scollega = null;
  nodo?.remove();
  nodo = null;
}

// Apre il popup (se non è già aperto e se non è stato nascosto per sempre)
export function apriGuidaSezione({ storage = null, radice = document.body } = {}) {
  if (nodo || guidaSezioneNascosta(storage)) return null;
  const velo = document.createElement('div');
  velo.className = 'sezione-guida-velo';
  const finestra = document.createElement('section');
  finestra.className = 'sezione-guida';
  finestra.setAttribute('role', 'dialog');
  finestra.setAttribute('aria-modal', 'true');
  finestra.setAttribute('aria-labelledby', 'sezione-guida-titolo');
  finestra.tabIndex = -1;

  const testata = document.createElement('div');
  testata.className = 'sezione-guida-testata';
  const titolo = document.createElement('strong');
  titolo.id = 'sezione-guida-titolo';
  titolo.textContent = t('terremoti.sez.guida.titolo');
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sezione-guida-x';
  x.innerHTML = svgIcona('chiudi', 16);
  x.setAttribute('aria-label', t('terremoti.sez.guida.chiudi'));
  x.title = t('terremoti.sez.guida.chiudi');
  testata.append(titolo, x);

  const testo = document.createElement('p');
  testo.textContent = t('terremoti.sez.guida.testo');
  const figura = document.createElement('div');
  figura.className = 'sezione-guida-figura';
  figura.innerHTML = disegno();

  const piede = document.createElement('div');
  piede.className = 'sezione-guida-piede';
  const mai = document.createElement('label');
  const casella = document.createElement('input');
  casella.type = 'checkbox';
  mai.append(casella, document.createTextNode(` ${t('terremoti.sez.guida.nonMostrare')}`));
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'sezione-guida-ok';
  ok.textContent = t('terremoti.sez.guida.capito');
  piede.append(mai, ok);

  const dove = document.createElement('p');
  dove.className = 'sezione-guida-dove';
  dove.textContent = t('terremoti.sez.guida.dove');
  const elenco = (voci, chiavi) => {
    const ul = document.createElement('ul');
    ul.className = 'sezione-guida-comandi';
    for (const [chiave, par] of voci) {
      const li = document.createElement('li');
      li.innerHTML = esc(t(`${chiavi}.${chiave}`, par)).replace(/([«“])(.+?)([»”])/g, '$1<strong>$2</strong>$3'); // i nomi dei comandi, tra virgolette, in grassetto
      ul.append(li);
    }
    return ul;
  };
  const comandi = elenco([['traccia', { traccia: t('terremoti.sez.traccia') }], ['arco', { arco: t('terremoti.sez.predefinita.arco') }], ['cancella', { cancella: t('terremoti.sez.cancella') }]], 'terremoti.sez.guida.cmd');
  const filtriTitolo = document.createElement('p');
  filtriTitolo.className = 'sezione-guida-dove';
  filtriTitolo.textContent = t('terremoti.sez.guida.filtriTitolo');
  const filtri = elenco([
    ['periodo', { periodo: t('terremoti.arc.anno') }],
    ['mag', { mag: t('terremoti.arc.magMin') }],
    ['larghezza', { larghezza: t('terremoti.sez.larghezza'), km: Math.max(...SEMILARGHEZZE_KM) }],
    ['aggiorna', { aggiorna: t('terremoti.sez.aggiorna') }],
  ], 'terremoti.sez.guida.filtro');

  finestra.append(testata, testo, figura, dove, comandi, filtriTitolo, filtri, piede);
  velo.append(finestra);

  const chiudi = () => {
    if (casella.checked) nascondiPerSempre(storage);
    chiudiGuidaSezione();
  };
  const suTasto = e => { if (e.key === 'Escape') { e.stopPropagation(); chiudi(); } };
  x.addEventListener('click', chiudi);
  ok.addEventListener('click', chiudi);
  velo.addEventListener('click', e => { if (e.target === velo) chiudi(); });
  document.addEventListener('keydown', suTasto, true);
  scollega = () => document.removeEventListener('keydown', suTasto, true);

  nodo = velo;
  radice.append(velo);
  ok.focus();
  return velo;
}
