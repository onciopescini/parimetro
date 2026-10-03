# Parimetro · officina dati

Il **sito e' statico** su Cloudflare Pages: online non gira nessun database ne'
nessun server. Questa cartella serve solo alla macchina che prepara i dati —
un portatile vecchio va benissimo, e puo' restare spento quando non lavora.

Flusso: `docker compose up -d` → ETL → `pubblica.sh` → sito aggiornato.

---

## 1 · Debian, senza interfaccia grafica

Installa Debian stable togliendo l'ambiente desktop e lasciando "utilita' di
sistema standard" e il server SSH. Poi via SSH:

```bash
ssh utente@ip-del-portatile
```

## 2 · Due impostazioni del portatile

Non deve essere acceso 24/7, ma quando lavora non deve addormentarsi:

```
# /etc/systemd/logind.conf
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
```

```bash
sudo systemctl restart systemd-logind
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Se resta spesso in carica, attiva il limite di carica all'85% (BIOS o
`/sys/class/power_supply/BAT0/charge_control_end_threshold`): la batteria
dura anni invece di uno.

## 3 · Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl git python3-venv
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER   # poi esci e rientra
```

## 4 · Database

```bash
git clone <questo-repository> ~/parimetro
cd ~/parimetro/selfhost
cp .env.example .env && openssl rand -base64 24   # incolla in .env
docker compose up -d
docker compose ps             # db "healthy"
./applica-migrazioni.sh       # schema, RPC, indici
```

## 5 · Dati

```bash
cd ~/parimetro/etl
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env          # DATABASE_URL con la password di sopra
```

Poi confini → popolazione → bilanci, come nel README dell'ETL.

## 6 · Pubblicare

Una volta sola: `npm install -g wrangler && wrangler login`, poi
`wrangler pages project create parimetro`.

Da li' in avanti, dopo ogni import:

```bash
~/parimetro/selfhost/pubblica.sh
```

Il sito e' su `parimetro.pages.dev`. Un dominio proprio si aggiunge dal
pannello Pages in un minuto, quando vorrai.

## Backup?

Non serve: i dati si rigenerano dall'ETL e i JSON pubblicati restano sulla
CDN anche se il portatile muore. Se vuoi evitare le ore di re-import,
`docker compose exec db pg_dump -U postgres -Fc mappabilanci > dump.bak`.
