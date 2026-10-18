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
import OfflineBanner from "./components/OfflineBanner.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireDriverProfile from "./components/RequireDriverProfile.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import DeepLinkHandler from "./components/DeepLinkHandler.jsx";

function AppShell() {
  const location = useLocation();
  const isAuthPage = ["/login", "/register", "/onboarding", "/forgot-password", "/reset-password", "/"].includes(location.pathname);

  return (
    <div className={`app-shell flex flex-col min-h-screen ${isAuthPage ? "bg-white" : "bg-slate-50"}`}>
      <DeepLinkHandler />
      <MissionMonitor />
      <OfflineBanner />
      <main className={`flex-1 overflow-y-auto ${isAuthPage ? "" : "pb-24"}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route path="/missions" element={<RequireAuth><RequireDriverProfile><MissionsList /></RequireDriverProfile></RequireAuth>} />
          <Route path="/missions/:id" element={<RequireAuth><RequireDriverProfile><MissionDetails /></RequireDriverProfile></RequireAuth>} />
          <Route path="/map" element={<RequireAuth><RequireDriverProfile><MapPage /></RequireDriverProfile></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><RequireDriverProfile><ChatPage /></RequireDriverProfile></RequireAuth>} />
          <Route path="/gains" element={<RequireAuth><RequireDriverProfile><GainsPage /></RequireDriverProfile></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><RequireDriverProfile><ProfilePage /></RequireDriverProfile></RequireAuth>} />
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
