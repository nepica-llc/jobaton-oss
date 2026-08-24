import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Resume from "./pages/Resume";
import ATSScore from "./pages/ATSScore";
import CoverLetter from "./pages/CoverLetter";
import Interview from "./pages/Interview";
import Jobs from "./pages/Jobs";
import JobPrep from "./pages/JobPrep";
import Profile from "./pages/Profile";
import SettingsPage from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobPrep />} />
        <Route path="/ats" element={<ATSScore />} />
        <Route path="/cover-letter" element={<CoverLetter />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
