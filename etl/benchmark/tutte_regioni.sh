#!/bin/bash
# Controllo SIOPE 2024 su tutte le regioni non ancora viste, con tentativi ripetuti (il catalogo BDAP cade spesso)
export PYTHONUTF8=1 TMP_SIOPE="C:/Users/alfon/AppData/Local/Temp/claude/C--dev-mappabilanci/39db003c-963d-44c0-b2d9-ab7079f37284/scratchpad/siope"
cd "$(dirname "$0")"
for r in "Abruzzo" "Calabria" "Campania" "Emilia-Romagna" "Friuli-Venezia Giulia" "Lazio" "Lombardia" "Marche" "Piemonte" "Puglia" "Sardegna" "Sicilia" "Toscana" "Umbria" "Valle D'Aosta" "Veneto"; do
  for t in 1 2 3 4 5; do
    python controllo_fonte.py 2024 "$r" > "cf_$r.txt" 2>&1 && grep -q RIGA "cf_$r.txt" && break
    sleep 10
  done
  echo "== $r"; python riepilogo_fonte.py < "cf_$r.txt"
  rm -f "cf_$r.txt"
done
echo FINE
