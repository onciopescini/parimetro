# mappa-bilanci in casa

Stack di autohosting su un portatile. Tre container: Postgres+PostGIS,
l'applicazione Next.js, e il tunnel Cloudflare.

Un portatile e' un buon server: consuma ~10 W (contro i ~60 W di un desktop,
cioe' 22 €/anno invece di 130), ha un SSD NVMe che per PostGIS conta piu'
della CPU, ed **ha gia' un gruppo di continuita' dentro** — la batteria.
Un blackout durante una scrittura puo' corrompere Postgres, ed e' il motivo
per cui chi mette server in casa compra un UPS da 100 €.

---

## 1 · Debian, senza interfaccia grafica

Installa **Debian stable** e nella scelta dei pacchetti **togli** l'ambiente
desktop, lasciando solo "utilita' di sistema standard" e il server SSH.
Un server con un desktop acceso consuma il doppio per non mostrare niente
a nessuno.

Da qui in poi lavori via SSH da questo PC:

```bash
ssh utente@ip-del-portatile
```

## 2 · Le tre insidie del portatile-server

Sono la parte che si dimentica, e ognuna si manifesta giorni dopo.

**Il coperchio chiuso sospende la macchina.** In `/etc/systemd/logind.conf`:

```
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

poi `sudo systemctl restart systemd-logind`.

**Sospensione e ibernazione vanno spente del tutto**, non basta il coperchio:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

**La batteria sempre al 100% si rovina in un anno.** Sui Galaxy Book c'e' il
limite di carica all'85%: attivalo nel BIOS se c'e' la voce, altrimenti da
Linux quando il driver lo espone:

```bash
cat /sys/class/power_supply/BAT*/charge_control_end_threshold   # esiste?
echo 85 | sudo tee /sys/class/power_supply/BAT0/charge_control_end_threshold
```

Se il valore non sopravvive al riavvio, mettilo in un servizio systemd o in
`/etc/rc.local`. Con la carica limitata la batteria resta un UPS utile per
anni invece che per mesi.

**Nota sui blackout lunghi.** La batteria copre un'interruzione breve. Se si
scarica del tutto, molti portatili **non si riaccendono da soli** al ritorno
della corrente: controlla nel BIOS se c'e' "restore on AC power loss".

## 3 · Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # poi esci e rientra
```

## 4 · Il progetto

```bash
sudo mkdir -p /opt && sudo chown $USER /opt
git clone <url-del-repo> /opt/mappabilanci
cd /opt/mappabilanci/selfhost
cp .env.example .env
openssl rand -base64 32   # una per POSTGRES_PASSWORD, una per READONLY_PASSWORD
nano .env
```

## 5 · Il tunnel Cloudflare

Serve un dominio su Cloudflare (anche uno da 5 €/anno). Su
**dash.cloudflare.com → Zero Trust → Networks → Tunnels → Create a tunnel**:
scegli *Cloudflared*, dai un nome, copia il **token** in `.env`.

Poi, nella scheda **Public Hostname** del tunnel, aggiungi:

| Campo | Valore |
|---|---|
| Subdomain | `bilanci` (o quello che vuoi) |
| Domain | il tuo dominio |
| Service | `http://web:3000` |

Il tunnel esce dalla tua rete verso Cloudflare: **nessuna porta aperta sul
router**, funziona anche dietro CGNAT, e l'IP di casa non viene mai esposto.

## 6 · Accensione

```bash
docker compose up -d --build
docker compose ps            # tutti "running", db "healthy"
./applica-migrazioni.sh      # ricrea schema, RPC e indici
```

Il database e' pubblicato solo su `127.0.0.1:5432`: ci arriva l'ETL dalla
stessa macchina, mai internet.

## 7 · I dati

L'ETL sta nell'altro repository. Il suo `.env` ora punta in locale:

```
DATABASE_URL=postgres://postgres:LA-PASSWORD@localhost:5432/mappabilanci
```

Ordine: confini → popolazione → bilanci. Vedi il README dell'ETL.

## 8 · Backup, prima di dimenticarsene

```bash
crontab -e
# 30 3 * * * /opt/mappabilanci/selfhost/backup.sh >> /var/log/mappabilanci-backup.log 2>&1
```

Lo script verifica che il dump sia rileggibile **prima** di cancellare i
vecchi, e non sovrascrive mai un backup valido con uno troncato.

Tieni una copia **fuori casa**: un backup che sta nella stessa stanza del
server non protegge da furto, incendio o allagamento. Cloudflare R2 ha 10 GB
gratuiti e nessun costo di egress; un dump ci sta comodamente.

## Manutenzione

```bash
docker compose logs -f web            # cosa dice l'applicazione
docker compose exec db psql -U postgres -d mappabilanci
docker compose pull && docker compose up -d   # aggiornamenti
docker system prune -af --volumes             # ATTENZIONE: --volumes cancella il DB
```

L'ultimo comando e' utile ma pericoloso: senza `--volumes` libera spazio in
sicurezza, con `--volumes` cancella anche il database.
