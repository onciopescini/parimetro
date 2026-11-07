#!/bin/bash
echo "--- simulazione: cosa farebbe apt-get install gdal-bin ---"
apt-get install -s --no-install-recommends gdal-bin 2>&1 > /tmp/sim.txt
echo "nuovi pacchetti: $(grep -c '^Inst' /tmp/sim.txt)"
echo "aggiornamenti/rimozioni di pacchetti postgres o gia' installati:"
grep -E "^(Inst|Remv)" /tmp/sim.txt | grep -iE "postgres|pgvector|postgis" || echo "  nessuno"
grep -E "^Inst" /tmp/sim.txt | grep -E "\[" | head -5 | sed 's/^/  aggiorna: /'
echo "--- spazio ---"; grep -E "disk space" /tmp/sim.txt
