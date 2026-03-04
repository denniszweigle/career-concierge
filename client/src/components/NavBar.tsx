import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, LayoutDashboard, MessageSquare, Cpu, Settings, LogOut, LogIn, FileSearch, BarChart2 } from "lucide-react";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const navLink = (path: string, label: string, Icon: React.ElementType) => {
    const active = location === path || (path !== "/" && location.startsWith(path));
    return (
      <button
        onClick={() => navigate(path)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
          active
            ? "bg-slate-100 text-slate-900 font-medium"
            : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  };

  return (
    <nav className="bg-white border-b px-4 py-2 flex items-center justify-between sticky top-0 z-50">
      {/* Brand */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 font-semibold text-slate-900 hover:text-blue-600 transition-colors"
      >
        <BriefcaseBusiness className="h-5 w-5 text-blue-600" />
        Career Concierge
      </button>

      {/* Links */}
      <div className="flex items-center gap-1">
        {navLink("/", "Home", LayoutDashboard)}
        {navLink("/match", "Match", FileSearch)}
        {navLink("/chat", "Chat", MessageSquare)}
        {navLink("/tech", "Tech", Cpu)}
        {navLink("/reports", "Reports", BarChart2)}
        {isAuthenticated && navLink("/admin", "Admin", Settings)}
      </div>

      {/* Auth */}
      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <>
            <span className="text-sm text-slate-500 hidden sm:block">
              {user?.name || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500">
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (window.location.href = import.meta.env.DEV ? "/api/dev-login" : "/api/oauth/callback")}
            className="text-slate-500"
          >
            <LogIn className="h-4 w-4 mr-1" />
            Sign in
          </Button>
        )}
      </div>
    </nav>
  );
}
