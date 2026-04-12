import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// ---------------------------------------------------------------------------
// Fonts — bundled locally via next/font/google to avoid COOP/COEP issues
// with external <link> requests
// ---------------------------------------------------------------------------

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

// ---------------------------------------------------------------------------
// SEO Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "ReadAloud — Real-Time Guided Reading",
  description:
    "A real-time guided reading system that listens to you read, highlights words live, and provides deep grading reports. Powered by browser-native WASM speech recognition.",
  keywords: [
    "reading",
    "guided reading",
    "speech recognition",
    "STT",
    "education",
    "literacy",
  ],
};

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
