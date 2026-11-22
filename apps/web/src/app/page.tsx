import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          EdumenAI
        </h1>
        <p className="text-lg text-slate-600">
          Oxford AQA IGCSE ESL Exercise 4 — Article Writing
        </p>
        <p className="text-slate-500">
          AI-powered marking, transcription, and feedback.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/exercise-4"
            className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Start Exercise 4
          </Link>
        </div>
      </div>
    </main>
  );
}
