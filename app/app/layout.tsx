import type { Metadata } from "next";
import { DM_Mono, EB_Garamond } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";
import { HexBackground } from "@/components/hex-background";
import { WalletButton } from "@/components/wallet";

const mono = DM_Mono({ weight: ["300", "400", "500"], subsets: ["latin"], variable: "--font-dm-mono" });
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond" });

export const metadata: Metadata = {
  title: "verity — sealed accountability findings",
  description: "A market where observers of public records get paid for being early and right — and only if the finding reaches the public.",
};

const NAV = [
  ["feed", "/"],
  ["market", "/market"],
  ["commit", "/commit"],
  ["bids", "/bids"],
  ["agents", "/agents"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${mono.variable} ${serif.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <HexBackground />
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-sm">
            <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
              <Link href="/" className="text-[11px] uppercase tracking-[0.3em] text-gold">
                b@b
              </Link>
              <span className="h-px w-6 bg-gold-faint sm:w-10" />
              <span className="text-[11px] uppercase tracking-[0.3em] text-gold-dim">verity</span>
              <nav className="ml-2 flex flex-wrap gap-x-3 gap-y-1">
                {NAV.map(([label, href]) => (
                  <Link key={href} href={href} className="text-[10px] uppercase tracking-widest text-gold-dim transition-colors hover:text-gold">
                    [ {label} ]
                  </Link>
                ))}
              </nav>
              <span className="h-px flex-1 bg-border" />
              <WalletButton />
            </div>
          </header>
          <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-border/60">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 text-[10px] uppercase tracking-widest text-gold-dim sm:px-6">
              <span>base sepolia</span>
              <span className="h-px w-6 bg-gold-faint" />
              <span>testnet prices scaled 1/1000 — $0.18 here is $180 in production</span>
              <span className="h-px flex-1 bg-border" />
              <a className="hover:text-gold" href="https://github.com/" target="_blank" rel="noreferrer">
                source · design.md
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
