import { Link, useLocation } from "react-router-dom";
import { useDriverCounts } from "../lib/useDriverCounts";

const MissionsIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const HistoryIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const StatsIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ChatIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ProfileIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default function BottomNav() {
  const location = useLocation();
  const { unread, active } = useDriverCounts();

  const navItems = [
    { path: "/missions", label: "Missions", icon: MissionsIcon },
    { path: "/map", label: "Historique", icon: HistoryIcon },
    { path: "/chat", label: "Chat", icon: ChatIcon },
    { path: "/profile", label: "Profil", icon: ProfileIcon },
  ];

  return (
    <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 bg-ink border-t border-white/10 z-40 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path === "/missions" && location.pathname.startsWith("/missions/"));
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-1 min-w-[64px] transition-all duration-200 ${
                isActive 
                  ? "text-accent font-bold"
                  : "text-white/55 hover:text-white"
              }`}
            >
              <div className="relative p-1.5 rounded-xl transition-colors">
                <Icon active={isActive} />
                {(() => {
                  const n = item.path === "/chat" ? unread : item.path === "/missions" ? active : 0;
                  if (n <= 0) return null;
                  const label = item.path === "/chat" ? `${n} message(s) non lu(s)` : `${n} course(s) en cours`;
                  return (
                    <span className="absolute -right-1 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ink" aria-label={label}>
                      {n > 99 ? "99+" : n}
                    </span>
                  );
                })()}
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="h-2" />
    </nav>
  );
}
