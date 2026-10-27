// «Modalità emergenza» su telefono (anche ruotato): con il Piano di emergenza acceso (da solo o con il percorso «Aree di emergenza») l'interfaccia
// si riduce all'essenziale: barra in basso con soli Mappa, Home, GPS, Condividi, Talia ed Esci, un clic sulla mappa apre solo la scheda dell'area. «Esci» è l'ultimo tab della barra.
// Il resto lo fa il CSS con body.modo-emergenza. Spento e riacceso lo strato, la modalità riparte; «Esci» vale finché lo strato resta acceso.
import { t } from './i18n.js';

export const STRATO_EMERGENZA = 'protezione-civile';
export const CLASSE_EMERGENZA = 'modo-emergenza';
export const ZOOM_MINIMO_EMERGENZA = 11; // sotto questo zoom i poligoni delle aree non si vedono: in modalità emergenza la mappa non scende oltre
export const ZOOM_MINIMO_RISCHI = 12; // i tile dei rischi PAI partono da zoom 12: con almeno un rischio acceso la mappa non scende sotto
export const zoomMinimoEmergenza = rischiAcceso => (rischiAcceso ? ZOOM_MINIMO_RISCHI : ZOOM_MINIMO_EMERGENZA);
export const MEDIA_TELEFONO = '(max-width: 720px), (pointer: coarse) and (max-height: 500px)'; // in piedi o ruotato (oltre 720 px di larghezza, ma basso e al tocco)

// La modalità vale solo su telefono (anche ruotato), a strato acceso e se non è stata chiusa a mano.
export const modoAttivo = ({ telefono, stratoAcceso, uscito }) => Boolean(telefono && stratoAcceso && !uscito);

// Moduli da interrogare al clic: in modalità emergenza solo quello dell'area.
export const moduliAlClic = (moduli, emergenza) => (emergenza ? moduli.filter(m => m.id === STRATO_EMERGENZA) : moduli);

export const inModoEmergenza = (doc = document) => doc.body.classList.contains(CLASSE_EMERGENZA);

// `barraTab` = la barra a tab del telefono; `icone` = gli svg dei tab Home, GPS, Condividi, Talia ed Esci; `suHome` riporta la mappa allo zoom di base, `suGps`, `suCondividi` e `suTalia` aprono posizione, condivisione e chat; `suAttiva` chiude i fogli aperti; `suModo(attivo)` avvisa a ogni cambio di modalità (serve a fermare lo zoom minimo).
export function collegaModoEmergenza(doc, { barraTab, icone, suHome = () => {}, suGps = () => {}, suCondividi = () => {}, suTalia = () => {}, suAttiva = () => {}, suModo = () => {} }) {
  const finestra = doc.defaultView;
  const telefono = finestra?.matchMedia?.(MEDIA_TELEFONO);
  let uscito = false;

  // tab che si vedono solo in modalità emergenza (il CSS li nasconde altrimenti)
  const tab = (id, icona, testo, suClic) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.dataset.tab = id;
    b.innerHTML = `${icona}<span>${testo}</span>`;
    b.addEventListener('click', suClic);
    barraTab.append(b);
  };
  tab('home', icone.home, t('emergenza.home'), () => suHome());
  tab('gps', icone.gps, t('emergenza.gps'), () => suGps());
  tab('condividi', icone.condividi, t('emergenza.condividi'), () => suCondividi());
  tab('talia', icone.talia, t('app.rail.chatbot'), () => suTalia());
  tab('esci', icone.esci, t('emergenza.esci'), () => { uscito = true; aggiorna(); });

  function aggiorna() {
    const strato = doc.getElementById(`strato-${STRATO_EMERGENZA}`);
    if (!strato?.checked) uscito = false;
    const ora = modoAttivo({ telefono: Boolean(telefono?.matches), stratoAcceso: Boolean(strato?.checked), uscito });
    const prima = doc.body.classList.contains(CLASSE_EMERGENZA);
    doc.body.classList.toggle(CLASSE_EMERGENZA, ora);
    if (ora !== prima) suModo(ora);
    if (ora) { suAttiva(); setTimeout(suAttiva, 0); } // anche a fine gestori: un link o l'app stessa possono riaprire il foglio
  }

  doc.addEventListener('change', e => { if (e.target?.id === `strato-${STRATO_EMERGENZA}`) aggiorna(); });
  telefono?.addEventListener('change', aggiorna);
  return { aggiorna };
}
