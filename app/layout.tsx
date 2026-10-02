import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
