import { NavLink, Outlet, Link } from "react-router-dom";
import { FileText, Settings, Briefcase, User, ClipboardList, LayoutDashboard, Crown } from "lucide-react";
import ProfileSwitcher from "./ProfileSwitcher";

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/resume", icon: FileText, label: "Base Resumes" },
  { to: "/jobs", icon: ClipboardList, label: "Jobs" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  return (
    <div className="min-h-screen th-bg flex flex-col transition-colors">
      {/* Top nav */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex items-center h-14 gap-6">
            <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Jobaton" className="h-6 w-6 rounded object-contain" />
              <span className={`font-semibold text-sm text-white`}>
                Jobaton <span className={`text-[0.667rem] font-normal text-[#555]`}>OSS</span>
              </span>
            </Link>

            <nav className="flex items-center gap-0.5 overflow-x-auto flex-1">
              {nav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[0.867rem] font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? "text-white bg-white/[0.06]"
                        : "text-[#888] hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <ProfileSwitcher />

            <a
              href="https://jobaton.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[0.733rem] font-medium rounded-md transition-all shrink-0 text-amber-400 border border-amber-400/20 hover:bg-amber-400/5`}
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
        <div className={`max-w-[1440px] mx-auto px-8 flex items-center justify-between text-[0.733rem] text-[#555]`}>
          <span>Jobaton OSS: self-hosted AI career toolkit</span>
          <a href="https://jobaton.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#028FA2] transition-colors">
            jobaton.com
          </a>
        </div>
      </footer>
    </div>
  );
}
