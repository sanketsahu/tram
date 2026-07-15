import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Set NEXT_PUBLIC_SITE_URL to the deployed origin so OG/canonical URLs are absolute.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jetplane.dev";
const TITLE = "jetplane — low-footprint Expo/React Native dev servers";
const DESCRIPTION =
  "Run many Expo/React Native dev environments per machine. Cross-project transform cache, thin no-Metro dev server, live HMR — ~40 MB per server vs Metro's ~325 MB idle / ~2 GB cold.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — jetplane" },
  description: DESCRIPTION,
  applicationName: "jetplane",
  keywords: [
    "jetplane", "expo", "react native", "metro", "bundler", "dev server",
    "hmr", "transform cache", "content-addressed", "monorepo", "memory", "fleet",
  ],
  authors: [{ name: "Sanket Sahu", url: "https://github.com/sanketsahu" }],
  creator: "Sanket Sahu",
  category: "technology",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "jetplane",
    title: TITLE,
    description: DESCRIPTION,
    // og image is app/opengraph-image.png (auto-detected by Next)
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@sanketsahu",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "jetplane",
      description: DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      name: "jetplane",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux",
      description: DESCRIPTION,
      url: SITE_URL,
      author: { "@type": "Person", name: "Sanket Sahu", url: "https://github.com/sanketsahu" },
      license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      sameAs: ["https://github.com/sanketsahu/jetplane"],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
