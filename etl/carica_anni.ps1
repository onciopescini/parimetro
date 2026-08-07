# Carica piu' esercizi SIOPE in sequenza: scarica, importa, libera il disco.
# Un anno alla volta, cosi' il picco di spazio resta ~3 GB invece di ~11.
#
# Uso:
#   .\carica_anni.ps1                      # 2023, 2022, 2021, 2020
#   .\carica_anni.ps1 -Anni 2019,2018
#   .\carica_anni.ps1 -Dati D:\scarichi    # dove tenere i CSV temporanei
param(
    [int[]] $Anni = @(2023, 2022, 2021, 2020),
    [string] $Dati = (Join-Path $PSScriptRoot "..\..\etl-data")
)

$ErrorActionPreference = 'Continue'
$etl = $PSScriptRoot
$Dati = [System.IO.Path]::GetFullPath($Dati)
New-Item -ItemType Directory -Force -Path $Dati | Out-Null

Write-Output "ETL:  $etl"
Write-Output "Dati: $Dati"

foreach ($anno in $Anni) {
    $dest = Join-Path $Dati "siope_$anno"
    Write-Output "===== $anno - download ====="
    python (Join-Path $etl "scarica_siope.py") --anno $anno --dest $dest 2>&1 | Select-Object -Last 4

    $n = (Get-ChildItem $dest -Filter *.csv -ErrorAction SilentlyContinue).Count
    if ($n -lt 40) {
        Write-Output "!!! $anno : solo $n file su 40, salto l'import per non caricare dati parziali"
        continue
    }

    Write-Output "===== $anno - import ====="
    Push-Location $etl
    python 04_import_siope.py --dir $dest --year $anno 2>&1 | Select-Object -Last 6
    Pop-Location

    Write-Output "===== $anno - pulizia ====="
    Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "$anno completato, CSV rimossi"
}
Write-Output "TUTTO FINITO"
