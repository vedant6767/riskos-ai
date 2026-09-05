import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: {
    default: 'RiskOS AI — Detect Risk Before It Becomes Loss',
    template: '%s | RiskOS AI',
  },
  description:
    'An explainable, human-governed AI risk operating system for merchants. ' +
    'Detects suspicious payment behavior, investigates evidence, and keeps automated actions bounded and auditable.',
  keywords: ['fraud detection', 'risk management', 'AI risk', 'payment security', 'fintech'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'RiskOS AI',
    description: 'Detect Risk Before It Becomes Loss',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100`}>
        {children}
      </body>
    </html>
  );
}
