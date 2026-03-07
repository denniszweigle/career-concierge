import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useSiteName } from "@/hooks/useSiteName";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, LayoutDashboard, MessageSquare, Cpu, Settings, LogOut, LogIn, FileSearch, BarChart2, Sun, Moon } from "lucide-react";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const siteName = useSiteName();

  const navLink = (path: string, label: string, Icon: React.ElementType) => {
    const active = location === path || (path !== "/" && location.startsWith(path));
    return (
      <button
        onClick={() => navigate(path)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  };

  return (
    <nav className="bg-background border-b px-4 py-2 flex items-center justify-between sticky top-0 z-50 gap-2">
      {/* Brand */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 font-semibold text-foreground hover:text-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
      >
        <BriefcaseBusiness className="h-5 w-5 text-blue-600 flex-shrink-0" />
        {siteName}
      </button>

      {/* Links */}
      <div className="flex items-center gap-1 overflow-x-auto flex-shrink min-w-0">
        {navLink("/", "Home", LayoutDashboard)}
        {navLink("/match", "Match", FileSearch)}
        {navLink("/chat", "Chat", MessageSquare)}
        {navLink("/tech", "Tech", Cpu)}
        {navLink("/reports", "Reports", BarChart2)}
        {isAuthenticated && navLink("/admin", "Admin", Settings)}
      </div>

      {/* Auth + theme toggle */}
      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <>
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.name || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (window.location.href = import.meta.env.DEV ? "/api/dev-login" : "/api/oauth/callback")}
            className="text-muted-foreground"
          >
            <LogIn className="h-4 w-4 mr-1" />
            Sign in
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </nav>
  );
}
