import { useEffect, useState, useMemo } from "react";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";
import { cityOnly } from "../lib/address";

function formatTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function dayKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Aujourd'hui";
  if (dayKey(d) === dayKey(yesterday)) return "Hier";
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export default function MapPage() {
  const [doneMissions, setDoneMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setDoneMissions(data);
    }
    setLoading(false);
  };

  const { groups, todayCount, weekCount } = useMemo(() => {
    const byDay = new Map();
    const today = dayKey(new Date());
    const weekStart = startOfWeek().getTime();
    let t = 0;
    let w = 0;
    for (const m of doneMissions) {
      const when = m.delivered_at || m.updated_at;
      const key = dayKey(when);
      if (!byDay.has(key)) byDay.set(key, { key, label: dayLabel(when), items: [] });
      byDay.get(key).items.push({ ...m, when });
      if (key === today) t += 1;
      if (new Date(when).getTime() >= weekStart) w += 1;
    }
    return { groups: [...byDay.values()], todayCount: t, weekCount: w };
  }, [doneMissions]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md">
        <h1 className="text-base font-bold tracking-tight text-ink">Historique</h1>
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "calc(50% + env(safe-area-inset-top, 0px) / 2)" }}>
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-paper-card" />
            ))}
          </div>
        ) : doneMissions.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-line bg-paper-card px-6 py-12 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <svg className="h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </div>
            <p className="text-base font-bold text-ink">Aucune course terminée</p>
            <p className="mt-1.5 max-w-[16rem] text-sm text-muted">Vos livraisons apparaîtront ici dès qu'elles seront validées.</p>
          </div>
        ) : (
          <>
            {/* Résumé */}
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Aujourd'hui", todayCount],
                ["Semaine", weekCount],
                ["Total", doneMissions.length],
              ].map(([label, value], i) => (
                <div key={label} className={`rounded-xl px-3 py-3 ${i === 0 ? "bg-ink text-white" : "border border-line bg-paper-card"}`}>
                  <p className={`font-mono text-[10px] uppercase tracking-[0.12em] ${i === 0 ? "text-white/60" : "text-label"}`}>{label}</p>
                  <p className={`mt-1 text-2xl font-bold leading-none ${i === 0 ? "text-accent" : "text-ink"}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Courses par jour */}
            <div className="mt-6 space-y-6">
              {groups.map((g) => (
                <section key={g.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-label">{g.label}</span>
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[11px] text-label">{g.items.length}</span>
                  </div>

                  {g.items.map((m) => {
                    const pickupPlace = cityOnly(m.pickup_address, m.pickup_city, m.pickup_postal_code);
                    const deliveryPlace = cityOnly(m.dropoff_address || m.delivery_address, m.delivery_city, m.delivery_postal_code);
                    return (
                      <div
                        key={m.id}
                        className="block rounded-xl border border-line bg-paper-card p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            Livrée à {formatTime(m.when)}
                          </span>
                          <span className="font-mono text-[11px] text-label">{m.tracking_code || `#${m.id.slice(0, 6)}`}</span>
                        </div>

                        <div className="mt-3 flex gap-3">
                          <div className="flex flex-col items-center pt-1.5">
                            <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-paper-card" />
                            <span className="my-1 w-px flex-1 bg-line" />
                            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-3">
                            <div>
                              <p className="text-[15px] font-bold leading-tight text-ink line-clamp-1">{m.pickup_name || "Enlèvement"}</p>
                              <p className="mt-0.5 text-xs text-muted line-clamp-1">{pickupPlace}</p>
                            </div>
                            <div>
                              <p className="text-[15px] font-bold leading-tight text-ink line-clamp-1">{m.delivery_name || "Livraison"}</p>
                              <p className="mt-0.5 text-xs text-muted line-clamp-1">{deliveryPlace}</p>
                            </div>
                          </div>
                        </div>

                        {m.delivery_recipient && (
                          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                            Réceptionné par <span className="font-bold text-ink">{m.delivery_recipient}</span>
                            {m.delivery_department ? ` · ${m.delivery_department}` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
