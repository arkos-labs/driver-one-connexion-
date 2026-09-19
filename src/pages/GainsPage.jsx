import { useEffect, useState } from "react";
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

function computeStats(list) {
  const count = list.length;
  const revenue = list.reduce((sum, m) => sum + (Number(m.price_estimate) || 0), 0);
  return { count, revenue };
}

function getLast7DaysCounts(missions) {
  const counts = Array(7).fill(0);
  const now = new Date();
  for (const m of missions) {
    const d = new Date(m.updated_at);
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      counts[6 - diff]++;
    }
  }
  return counts;
}

export default function GainsPage() {
  const [doneMissions, setDoneMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('orders')
      .select('updated_at, price_estimate')
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

  const weekDayCounts = getLast7DaysCounts(doneMissions);
  const maxCount = Math.max(...weekDayCounts, 1);

  const fmt = (n) => n.toFixed(2).replace('.', ',');

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-100/50 px-4 py-3.5 flex items-center justify-between backdrop-blur-md bg-white/90">
        <h1 className="text-sm font-black tracking-[0.1em] uppercase text-slate-900">Gains & Activité</h1>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1 pb-10">
        <div className="rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 text-white shadow-[0_16px_30px_rgba(15,23,42,0.24)] mx-4 mt-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Chiffre d'affaires total</div>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-black">{fmt(totalStats.revenue)} €</div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">{totalStats.count} missions</span>
              <span className="text-[10px] font-medium text-slate-400">Total historique HT</span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Aujourd'hui</div>
              <div className="text-lg font-bold">{fmt(dayStats.revenue)} €</div>
              <div className="text-[9px] text-slate-500">{dayStats.count} course{dayStats.count > 1 ? 's' : ''}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Semaine</div>
              <div className="text-lg font-bold">{fmt(weekStats.revenue)} €</div>
              <div className="text-[9px] text-slate-500">{weekStats.count} course{weekStats.count > 1 ? 's' : ''}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Mois</div>
              <div className="text-lg font-bold">{fmt(monthStats.revenue)} €</div>
              <div className="text-[9px] text-slate-500">{monthStats.count} course{monthStats.count > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between mx-6">
          <div className="text-sm font-black uppercase tracking-widest text-slate-900">7 derniers jours</div>
        </div>

        <div className="mt-3 rounded-[24px] border border-white bg-white p-6 shadow-sm mx-4">
           <div className="flex items-end justify-between h-24 gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
             {weekDayCounts.map((count, i) => {
               const dayLabels = (() => {
                 const labels = [];
                 for (let d = 6; d >= 0; d--) {
                   const date = new Date();
                   date.setDate(date.getDate() - d);
                   labels.push(['D','L','M','M','J','V','S'][date.getDay()]);
                 }
                 return labels;
               })();
               return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${i === 6 ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-slate-300'}`}
                    style={{ height: `${(count / maxCount) * 100}%`, minHeight: count > 0 ? '8px' : '2px' }}
                  />
                  <span className={`text-[8px] font-bold ${i === 6 ? 'text-blue-600' : 'text-slate-400'}`}>
                    {dayLabels[i]}
                  </span>
                </div>
               );
             })}
           </div>
        </div>

        <div className="mt-8 mx-6">
          <div className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">Aujourd'hui</div>

          <div className="rounded-[24px] border border-white bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Gains du jour</div>
                <div className="text-3xl font-black text-slate-900">{fmt(dayStats.revenue)} €</div>
                <p className="mt-1 text-[10px] font-medium text-slate-500">{dayStats.count} mission{dayStats.count > 1 ? 's' : ''} terminée{dayStats.count > 1 ? 's' : ''}</p>
              </div>
              <div className="relative flex items-center justify-center">
                 <svg className="w-20 h-20 -rotate-90">
                    <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                    <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8" fill="transparent"
                      strokeDasharray="201"
                      strokeDashoffset={201 - (Math.min(dayStats.count / 10, 1) * 201)}
                      className="text-blue-600 transition-all duration-1000"
                    />
                 </svg>
                 <span className="absolute text-xs font-black text-slate-900">{dayStats.count}/10</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 mx-6 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
           — One Connexion —
        </div>
      </main>
    </div>
  );
}
