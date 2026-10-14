"""Riassume l'output di controllo_fonte.py (righe RIGA ...) letto da standard input."""
import json
import statistics as st
import sys

righe = [json.loads(l[5:]) for l in sys.stdin if l.startswith("RIGA")]
for tipo in ("entrate", "spese"):
    r = [x for x in righe if x[2] == tipo and x[5]]
    if not r:
        continue
    v = [x[5] for x in r]
    print(f"{tipo}: {len(r)} comuni, mediana {st.median(v):.4f}, scarto massimo {max(abs(x - 1) for x in v) * 100:.2f}%, "
          f"oltre lo 0,5%: {sum(abs(x - 1) > 0.005 for x in v)}, oltre il 5%: {sum(abs(x - 1) > 0.05 for x in v)}")
    for x in sorted(r, key=lambda x: -abs(x[5] - 1))[:4]:
        if abs(x[5] - 1) > 0.005:
            print("   ", x)
