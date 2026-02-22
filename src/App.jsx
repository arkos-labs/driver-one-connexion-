import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MissionsList from "./pages/MissionsList.jsx";
import MissionDetails from "./pages/MissionDetails.jsx";
import MapPage from "./pages/MapPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import MissionMonitor from "./components/MissionMonitor.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <MissionMonitor />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/missions" element={<MissionsList />} />
          <Route path="/missions/:id" element={<MissionDetails />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
