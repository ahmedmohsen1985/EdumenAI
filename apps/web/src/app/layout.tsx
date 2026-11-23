import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../components/Navbar';

export const metadata: Metadata = {
  title: 'EdumenAI — Oxford AQA Writing & Assessment Platform',
  description:
    'Multi-skill AI-powered practice, OCR transcription, and examiner feedback for Oxford AQA IGCSE ESL.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 print:hidden">
          <div className="mx-auto max-w-6xl px-4">
            EdumenAI powered by <span className="font-semibold text-brand-navy">EDUMENIA</span> ·
            Oxford AQA Writing &amp; Assessment Platform
          </div>
        </footer>
      </body>
    </html>
  );
}
