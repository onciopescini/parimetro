import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// I caratteri delle card da condividere (vedi lib/card): il canvas li legge da queste variabili CSS
const cardSerif = Newsreader({ variable: "--font-card-serif", subsets: ["latin"], weight: ["500", "600"] });
const cardSans = IBM_Plex_Sans({ variable: "--font-card-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const cardMono = IBM_Plex_Mono({ variable: "--font-card-mono", subsets: ["latin"], weight: ["400", "500"] });

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
      className={`${geistSans.variable} ${geistMono.variable} ${cardSerif.variable} ${cardSans.variable} ${cardMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
