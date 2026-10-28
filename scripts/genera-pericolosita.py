"""Costruisce dati/pericolosita-mps04.pmtiles: la mappa di pericolosità sismica MPS04 a fasce di ag.

Parte dal GeoJSON delle fasce poligonali (41 poligoni, uno o più per fascia di 0,025 g, campo «mediana» 1–12) e lo
impacchetta in tile vettoriali con tippecanoe. Il campo «mediana» diventa «classe» (0–11, la fascia n parte da n × 0,025 g).
  python3 scripts/genera-pericolosita.py "percorso/pericolosità_simisca_0,002_aree.geojson"
Il risultato si committa; lo script si rilancia solo se cambia il dato.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

USCITA = Path(__file__).resolve().parent.parent / 'dati' / 'pericolosita-mps04.pmtiles'
FASCE = 12


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sorgente = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    features = []
    for f in sorgente['features']:
        classe = int(f['properties']['mediana']) - 1
        assert 0 <= classe < FASCE, f'fascia fuori scala: {f["properties"]}'
        features.append({'type': 'Feature', 'properties': {'classe': classe}, 'geometry': f['geometry']})
    assert {f['properties']['classe'] for f in features} == set(range(FASCE)), 'mancano delle fasce'

    with tempfile.TemporaryDirectory(prefix='mps04-') as tmp:
        fasce = Path(tmp) / 'fasce.geojson'
        fasce.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}), encoding='utf-8')
        # le fasce vicine condividono i bordi (--detect-shared-borders): niente fessure fra una fascia e l'altra
        subprocess.run([
            'tippecanoe', '-q', '-f', '-o', str(USCITA), '-l', 'pericolosita', '-n', 'pericolosita-mps04', '-Z3', '-z10',
            '--no-tile-size-limit', '--no-feature-limit', '--detect-shared-borders', '--simplification=4', '--no-tiny-polygon-reduction', str(fasce),
        ], check=True)
    print(f'scritto {USCITA}')


if __name__ == '__main__':
    main()
