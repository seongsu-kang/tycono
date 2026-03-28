import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Tycono — Your company, in code.",
  description:
    "Define your org. Give one order. Your AI team plans, builds, and learns — and they remember everything next time. Open-source, local-first.",
  openGraph: {
    title: "Tycono — Your company, in code.",
    description: "Define your org. Give one order. Your AI team plans, builds, and learns — and they remember everything next time.",
    type: "website",
    url: "https://tycono.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tycono — Your company, in code.",
    description: "Define your org. Give one order. Your AI team plans, builds, and learns — and they remember everything next time.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23111118'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%23FF8C42' font-family='sans-serif' font-weight='700' font-size='18'>T</text></svg>" />
      </head>
      <body className="min-h-screen bg-grid overflow-x-hidden">
        <Navbar />
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
