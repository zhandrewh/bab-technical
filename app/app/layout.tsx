import type { Metadata } from "next";
import { DM_Mono, EB_Garamond, Poppins } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";
import { HexBackground } from "@/components/hex-background";
import { WalletButton } from "@/components/wallet";

// Only the weights the UI uses (no font-light anywhere); each extra weight is another font file per visitor.
const sans = Poppins({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-poppins" });
const mono = DM_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-dm-mono" });
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond" });

export const metadata: Metadata = {
  title: "Verity",
  description: "A market where observers of public records get paid for being early and right — and only if the finding reaches the public.",
};

const NAV = [
  ["feed", "/"],
  ["market", "/market"],
  ["bids", "/bids"],
  ["how it works", "/how"],
  ["ledger", "/ledger"],
  ["agents", "/agents"],
  ["commit", "/commit"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <HexBackground />
          <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold text-gold">verity</span>
              </Link>
              <nav className="flex flex-wrap gap-x-6 gap-y-1">
                {NAV.map(([label, href]) => (
                  <Link key={href} href={href} className="text-[13px] capitalize text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                ))}
              </nav>
              <span className="flex-1" />
              <WalletButton />
            </div>
          </header>
          <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-border/50">
            <div className="flex justify-center px-4 py-5 text-[12px]">
              <span className="surface-gold rounded px-2.5 py-0.5 text-gold">Base Sepolia</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
