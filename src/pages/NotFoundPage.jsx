import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper text-ink px-4 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-muted">404</p>
      <h1 className="mt-2 text-3xl font-black">Page introuvable</h1>
      <p className="mt-3 text-sm text-muted">Cette page n&apos;existe pas.</p>
      <Link
        to="/missions"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-bold text-white"
      >
        Retour aux missions
      </Link>
    </div>
  );
}
