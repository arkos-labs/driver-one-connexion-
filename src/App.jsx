import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import MissionsList from "./pages/MissionsList.jsx";
import MissionDetails from "./pages/MissionDetails.jsx";
import MapPage from "./pages/MapPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import GainsPage from "./pages/GainsPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import MissionMonitor from "./components/MissionMonitor.jsx";
import BottomNav from "./components/BottomNav.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

function AppShell() {
  const location = useLocation();
  const isAuthPage = ["/login", "/register", "/"].includes(location.pathname);

  return (
    <div className={`app-shell flex flex-col min-h-screen ${isAuthPage ? "bg-white" : "bg-slate-50"}`}>
      <MissionMonitor />
      <main className={`flex-1 overflow-y-auto ${isAuthPage ? "" : "pb-24"}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/missions" element={<RequireAuth><MissionsList /></RequireAuth>} />
          <Route path="/missions/:id" element={<RequireAuth><MissionDetails /></RequireAuth>} />
          <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
          <Route path="/gains" element={<RequireAuth><GainsPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      {!isAuthPage && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
