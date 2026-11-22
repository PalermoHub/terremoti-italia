"""Area di studio degli esagoni -> dati/area-studio.json
Confini regionali ISTAT generalizzati (Limiti01012022_g, WGS84) uniti in un solo poligono, ingranditi di 30 km di mare
in EPSG:3035 (distanze vere), semplificati a 1,5 km e riportati in gradi. Serve a disegnare anche gli esagoni a zero eventi.
  python3 scripts/area-studio.py [percorso/Reg01012022_g_WGS84.shp]"""
import json, sys
from pathlib import Path
import geopandas as gpd

SHP = Path(sys.argv[1] if len(sys.argv) > 1 else "../potere_d'acquisto_reale/data/raw/confini/Limiti01012022_g/Reg01012022_g/Reg01012022_g_WGS84.shp")
OUT = Path(__file__).resolve().parent.parent / "dati" / "area-studio.json"
BUFFER_M, SEMPLIFICA_M = 30_000, 1_500

reg = gpd.read_file(SHP).to_crs(3035)
area = reg.geometry.union_all().buffer(BUFFER_M, resolution=8).simplify(SEMPLIFICA_M)
g = gpd.GeoSeries([area], crs=3035).to_crs(4326).iloc[0]
poligoni = [g] if g.geom_type == "Polygon" else list(g.geoms)
anelli = [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in poligoni if p.area > 0]
OUT.write_text(json.dumps({"tipo": "area-studio", "bufferKm": BUFFER_M // 1000, "poligoni": anelli}, separators=(",", ":")))
print(OUT, OUT.stat().st_size // 1024, "KB", len(anelli), "poligoni", sum(len(a) for a in anelli), "punti")
