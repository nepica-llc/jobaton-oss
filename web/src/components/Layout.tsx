import { NavLink, Outlet, Link } from "react-router-dom";
import { FileText, Settings, Briefcase, User, ClipboardList, LayoutDashboard, Crown, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/resume", icon: FileText, label: "Base Resumes" },
  { to: "/jobs", icon: ClipboardList, label: "Jobs" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="min-h-screen th-bg flex flex-col transition-colors">
      {/* Top nav */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex items-center h-14 gap-6">
            <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Jobaton" className="h-6 w-6 rounded object-contain" />
              <span className={`font-semibold text-sm ${isDark ? "text-white" : "text-[#0a2540]"}`}>
                Jobaton <span className={`text-[10px] font-normal ${isDark ? "text-[#555]" : "text-[#8898aa]"}`}>OSS</span>
              </span>
            </Link>

            <nav className="flex items-center gap-0.5 overflow-x-auto flex-1">
              {nav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? isDark ? "text-white bg-white/[0.06]" : "text-[#0a2540] bg-black/[0.04]"
                        : isDark ? "text-[#888] hover:text-white" : "text-[#8898aa] hover:text-[#0a2540]"
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className={`p-1.5 rounded-md transition-all ${isDark ? "text-[#888] hover:text-amber-300 hover:bg-white/[0.04]" : "text-[#8898aa] hover:text-[#0a2540] hover:bg-black/[0.04]"}`}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            <a
              href="https://jobaton.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all shrink-0 ${
                isDark
                  ? "text-amber-400 border border-amber-400/20 hover:bg-amber-400/5"
                  : "text-amber-700 border border-amber-300/40 hover:bg-amber-50"
              }`}
            >
              <Crown className="h-3 w-3" /> Pro
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-[1440px] mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="glass-footer py-3">
        <div className={`max-w-[1440px] mx-auto px-8 flex items-center justify-between text-[11px] ${isDark ? "text-[#555]" : "text-[#8898aa]"}`}>
          <span>Jobaton OSS — Self-hosted AI career toolkit</span>
          <a href="https://jobaton.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#028FA2] transition-colors">
            jobaton.com
          </a>
        </div>
      </footer>
    </div>
  );
}
