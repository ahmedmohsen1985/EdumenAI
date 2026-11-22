import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EdumenAI — Exercise 4 Article Writing',
  description: 'AI-powered marking and feedback for Oxford AQA IGCSE ESL Exercise 4'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
