import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-black text-slate-800 mb-4">404</p>
        <h1 className="text-xl font-bold text-slate-200 mb-2">Page not found</h1>
        <p className="text-sm text-slate-500 mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
