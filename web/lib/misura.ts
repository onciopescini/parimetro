// Cloudflare Web Analytics: misura le visite in forma aggregata, senza cookie.
// Il token e' pubblico (finisce nell'HTML di ogni pagina): non e' un segreto.
export const TOKEN_MISURA = "2e4e8a6c62b2406ab899e715a9f15563";

export const SCRIPT_MISURA = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${TOKEN_MISURA}"}'></script>`;
