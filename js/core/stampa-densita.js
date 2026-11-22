// Ponte tra le mappe del tab «Mappe» e il pannello Stampa: ogni mappa registra una funzione che, a strato acceso, dà titolo,
// sottotitolo e legenda (classi, rampa) di quello che si vede; il pannello Stampa la legge all'apertura e a ogni disegno.
// Così il pannello non dipende dagli strati e la stampa mostra la legenda della mappa che c'è davvero, non quella dei terremoti in tempo reale.
// Le mappe si escludono a vicenda: al più un fornitore risponde.
const fornitori = [];

export const registraStampaMappa = f => { fornitori.push(f); };

// { titolo, sottotitolo, nomeLegenda, senzaEventi, voci: [{ colore, opacita?, bordo?, testo }], rampa: { colori, testo } | null, nota } oppure null
// `senzaEventi` = la mappa non disegna i singoli eventi (esagoni, territori): niente simboli ML, stelle né elenco nel poster
export const mappaPerStampa = () => { for (const f of fornitori) { const d = f(); if (d) return d; } return null; };
