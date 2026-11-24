import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import { Navbar } from '../components/Navbar';
import { MotionProvider } from '../components/ui/MotionPrimitives';

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
      <body className="relative flex min-h-screen flex-col font-sans text-zinc-900 antialiased">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden"
        >
          <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-white/70 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-[480px] w-[480px] rounded-full bg-zinc-300/30 blur-3xl" />
          <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-slate-300/30 blur-3xl" />
        </div>
        <MotionProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="px-4 pb-6 pt-2 text-center text-xs text-zinc-500 print:hidden">
            <div className="mx-auto max-w-6xl rounded-full border border-white/70 bg-white/50 px-4 py-2.5 backdrop-blur-xl ring-1 ring-zinc-900/[0.04]">
              EdumenAI powered by <span className="font-semibold text-zinc-800">EDUMENIA</span> ·
              Oxford AQA Writing &amp; Assessment Platform
            </div>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
