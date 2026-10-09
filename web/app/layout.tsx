import type { Metadata } from "next";
import { DM_Mono, Figtree, Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { TOKEN_MISURA } from "@/lib/misura";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// L'identita' di Parimetro: Fraunces "morbida" per titoli e numeri, Figtree per il testo, DM Mono per fonti e anni.
// Fraunces e' servita dal nostro sito (public/fonts, licenza OFL) con l'asse SOFT fissato a 100, perche' un <canvas>
// non puo' impostarlo: cosi' le card hanno lo stesso carattere del sito. Il canvas legge le famiglie da queste variabili.
const display = localFont({ src: "../public/fonts/fraunces-morbida-latin.woff2", variable: "--f-display", weight: "100 900", style: "normal", display: "swap" });
const testo = Figtree({ variable: "--f-testo", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const codice = DM_Mono({ variable: "--f-codice", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Parimetro · i bilanci dei comuni italiani",
  description:
    "Mappa 3D interattiva di entrate e spese di quasi 8.000 comuni italiani, 2020-2024: in cosa spende ogni comune e come si colloca rispetto ai comuni simili. Dati aperti ISTAT e SIOPE.",
  openGraph: {
    title: "Parimetro · i bilanci dei comuni italiani",
    description: "In cosa spende il tuo comune, e come si colloca rispetto ai comuni simili.",
    type: "website",
    locale: "it_IT",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${testo.variable} ${codice.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={`{"token": "${TOKEN_MISURA}"}`} />
      </body>
    </html>
  );
}
