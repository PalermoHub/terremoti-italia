// Genera dati/classificazione-sismica.json (zona sismica per codice ISTAT del comune) dal CSV della Protezione Civile.
// Uso: node scripts/classificazione-sismica.mjs classificazione-sismica-aggiornata-maggio-2025.csv > dati/classificazione-sismica.json
// Fonte: https://rischi.protezionecivile.gov.it/it/sismico/attivita/classificazione-sismica/ (CSV «aggiornata maggio 2025»).
// Formato: { "<codice ISTAT>": "<zona come scritta dalla Regione>" }, es. { "1001": "3", "1003": "3S", "8001": "2B" }.
// I codici sono scritti senza zeri iniziali, come il campo pro_com dei confini comunali.
import { readFileSync } from 'node:fs';

const righe = readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const [intestazione, ...dati] = righe.map(r => r.split(';'));
const iCodice = intestazione.indexOf('COD_ISTAT_COMUNE'), iZona = intestazione.indexOf('ZONA_SISMICA');
if (iCodice < 0 || iZona < 0) throw new Error('colonne COD_ISTAT_COMUNE / ZONA_SISMICA non trovate');
const zone = {};
for (const r of dati) zone[Number(r[iCodice])] = r[iZona].trim().toUpperCase();
process.stdout.write(JSON.stringify(zone) + '\n');
