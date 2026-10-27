// Archivio locale dei terremoti (SQLite): una riga per evento INGV, chiave = id dell'evento.
import { DatabaseSync } from 'node:sqlite';

const oraEvento = testo => Date.parse(`${String(testo).slice(0, 23)}Z`);

// Clausola comune a interroga e riepilogo. La profondità è facoltativa: gli eventi senza profondità
// (coordinata assente) restano fuori solo quando si chiede un intervallo.
function clausola({ da, a, magMin, profMin = null, profMax = null, area }) {
  let dove = 'ts >= ? AND ts <= ? AND mag >= ? AND lon >= ? AND lon <= ? AND lat >= ? AND lat <= ?';
  const par = [da, a, magMin, area.minlon, area.maxlon, area.minlat, area.maxlat];
  if (profMin != null) { dove += ' AND prof >= ?'; par.push(profMin); }
  if (profMax != null) { dove += ' AND prof <= ?'; par.push(profMax); }
  return { dove, par };
}

export function apriArchivio(percorso) {
  const db = new DatabaseSync(percorso);
  db.exec(`
    CREATE TABLE IF NOT EXISTS eventi (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, tempo TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, prof REAL,
      mag REAL NOT NULL, tipo_mag TEXT, luogo TEXT, tipo TEXT
    );
    CREATE INDEX IF NOT EXISTS eventi_ts ON eventi (ts);
    CREATE INDEX IF NOT EXISTS eventi_mag ON eventi (mag);
  `);
  const leggi = db.prepare('SELECT * FROM eventi WHERE id = ?');
  const scrivi = db.prepare(`INSERT INTO eventi (id, ts, tempo, lat, lon, prof, mag, tipo_mag, luogo, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET ts=excluded.ts, tempo=excluded.tempo, lat=excluded.lat, lon=excluded.lon, prof=excluded.prof, mag=excluded.mag, tipo_mag=excluded.tipo_mag, luogo=excluded.luogo, tipo=excluded.tipo`);

  const riga = f => {
    const p = f?.properties ?? {};
    const [lon, lat, prof] = f?.geometry?.coordinates ?? [];
    const ts = oraEvento(p.time);
    if (p.eventId == null || !Number.isFinite(p.mag) || !Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(ts)) return null;
    return [Number(p.eventId), ts, String(p.time), lat, lon, Number.isFinite(prof) ? prof : null, p.mag, p.magType ?? '', p.place ?? '', p.type ?? ''];
  };
  const uguale = (v, o) => o && v[2] === o.tempo && v[3] === o.lat && v[4] === o.lon && v[5] === o.prof && v[6] === o.mag && v[7] === o.tipo_mag && v[8] === o.luogo && v[9] === o.tipo;
  const comeFeature = r => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: r.prof == null ? [r.lon, r.lat] : [r.lon, r.lat, r.prof] },
    properties: { eventId: r.id, time: r.tempo, mag: r.mag, magType: r.tipo_mag, place: r.luogo, type: r.tipo },
  });

  return {
    // Salva (o aggiorna) gli eventi; restituisce quanti sono nuovi o cambiati
    salva(features) {
      let cambiati = 0;
      db.exec('BEGIN');
      try {
        for (const f of features) {
          const v = riga(f);
          if (!v || uguale(v, leggi.get(v[0]))) continue;
          scrivi.run(...v);
          cambiati++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return cambiati;
    },
    interroga({ da, a, magMin, profMin = null, profMax = null, area, limite }) {
      const { dove, par } = clausola({ da, a, magMin, profMin, profMax, area });
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM eventi WHERE ${dove}`).get(...par);
      const righe = db.prepare(`SELECT * FROM eventi WHERE ${dove} ORDER BY ts DESC LIMIT ?`).all(...par, limite);
      return { eventi: righe.map(comeFeature), totale: n };
    },
    // Conteggi per classe di magnitudo (0,1) e per mese UTC, per le serie storiche e il confronto: il browser non scarica gli eventi
    riepilogo({ da, a, magMin, profMin = null, profMax = null, area }) {
      const { dove, par } = clausola({ da, a, magMin, profMin, profMax, area });
      const tutte = sql => db.prepare(sql).all(...par).map(r => ({ ...r }));
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM eventi WHERE ${dove}`).get(...par);
      return {
        totale: n,
        perMagnitudo: tutte(`SELECT ROUND(mag, 1) AS mag, COUNT(*) AS n FROM eventi WHERE ${dove} GROUP BY 1 ORDER BY 1`),
        perMese: tutte(`SELECT substr(tempo, 1, 7) AS mese, COUNT(*) AS n, MAX(mag) AS magMax FROM eventi WHERE ${dove} GROUP BY 1 ORDER BY 1`),
      };
    },
    ultimoTs() { return db.prepare('SELECT MAX(ts) AS m FROM eventi').get().m; },
    chiudi() { db.close(); },
  };
}
