import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameWeek(a, b) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatMoney(value) {
  if (typeof value !== 'number') return "0.00 €";
  return `${value.toFixed(2)} €`;
}

function computeStats(list) {
  let total = 0;
  let count = 0;
  list.forEach((m) => {
    if (typeof m.price_ht === "number") total += m.price_ht;
    count += 1;
  });
  return { total, count };
}

export default function GainsPage() {
  const [doneMissions, setDoneMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    fetchGains();
  }, []);

  const fetchGains = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('orders')
      .select('price_ht, updated_at')
      .eq('driver_id', user.id)
      .eq('status', 'delivered');

    if (!error && data) {
      setDoneMissions(data);
    }
    setLoading(false);
  };

  const dayMissions = doneMissions.filter((m) => isSameDay(new Date(m.updated_at), now));
  const weekMissions = doneMissions.filter((m) => isSameWeek(new Date(m.updated_at), now));
  const monthMissions = doneMissions.filter((m) => isSameMonth(new Date(m.updated_at), now));

  const dayStats = computeStats(dayMissions);
  const weekStats = computeStats(weekMissions);
  const monthStats = computeStats(monthMissions);
  const totalStats = computeStats(doneMissions);

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* menu removed */}
          <h1 className="text-lg font-bold tracking-tight uppercase">Gains</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2" />
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 text-white shadow-[0_16px_30px_rgba(15,23,42,0.24)] mx-4 mt-4">
          <div className="text-sm text-slate-300">Solde Total</div>
          <div className="mt-2 flex items-center gap-3">
            <div className="text-4xl font-semibold">{formatMoney(totalStats.total)}</div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/40 px-3 py-1 text-sm text-emerald-300">
              <span>📈</span>
              +12%
            </div>
          </div>
          <button
            type="button"
            className="mt-6 w-full rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(59,130,246,0.35)]"
          >
            💳 Retirer les fonds
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between mx-4">
          <div className="text-lg font-semibold text-slate-900">Performance</div>
          <div className="text-sm font-semibold text-slate-500">7 derniers jours</div>
        </div>

        <div className="mt-3 rounded-[24px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.06)] mx-4">
          <div className="flex items-end justify-between text-xs text-slate-400">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mer</span>
            <span className="font-semibold text-slate-900">Jeu</span>
            <span>Ven</span>
            <span>Sam</span>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">22.00 €</div>
          </div>
        </div>

        <div className="mt-6 text-lg font-semibold text-slate-900 mx-4">Statistiques</div>

        <div className="mt-3 rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] mx-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Aujourd'hui</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(dayStats.total)}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">🚚 {dayStats.count} mission</div>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-[6px] border-blue-500 text-sm font-semibold text-slate-900">
              75%
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 mx-4">
          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100 text-lg">📊</div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">+5%</span>
            </div>
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Semaine</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(weekStats.total)}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">{weekStats.count} mission</div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-lg">🗓️</div>
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Mois</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(monthStats.total)}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">{monthStats.count} mission</div>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 app-nav">
        <div className="flex items-center justify-around h-16">
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/missions">
            <span>📋</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Mission</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/map">
            <span>🕓</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Historique</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-[#1d283a]" to="/gains">
            <span>💳</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Gains</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/profile">
            <span>👤</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profil</span>
          </Link>
        </div>
        <div className="h-5 bg-white" />
      </nav>
    </div>
  );
}
