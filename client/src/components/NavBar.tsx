import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useSiteName } from "@/hooks/useSiteName";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, LayoutDashboard, MessageSquare, Cpu, Settings, LogOut, LogIn, FileSearch, BarChart2, Sun, Moon, Menu, X } from "lucide-react";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const siteName = useSiteName();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems: { path: string; label: string; Icon: React.ElementType }[] = [
    { path: "/", label: "Home", Icon: LayoutDashboard },
    { path: "/match", label: "Match", Icon: FileSearch },
    { path: "/chat", label: "Chat", Icon: MessageSquare },
    { path: "/tech", label: "Tech", Icon: Cpu },
    { path: "/reports", label: "Reports", Icon: BarChart2 },
    ...(isAuthenticated ? [{ path: "/admin", label: "Admin", Icon: Settings }] : []),
  ];

  const navLink = (path: string, label: string, Icon: React.ElementType, onClick?: () => void) => {
    const active = location === path || (path !== "/" && location.startsWith(path));
    return (
      <button
        key={path}
        onClick={() => { navigate(path); onClick?.(); }}
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
    <nav className="bg-background border-b sticky top-0 z-50">
      <div className="px-4 py-2 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-semibold text-foreground hover:text-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
        >
          <BriefcaseBusiness className="h-5 w-5 text-blue-600 flex-shrink-0" />
          {siteName}
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1 flex-shrink min-w-0">
          {navItems.map(({ path, label, Icon }) => navLink(path, label, Icon))}
        </div>

        {/* Right: auth + theme + hamburger */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground hidden lg:block">
                {user?.name || user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hidden md:flex">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = import.meta.env.DEV ? "/api/dev-login" : "/api/oauth/callback")}
              className="text-muted-foreground hidden md:flex"
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

          {/* Hamburger — mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t bg-background px-4 py-3 flex flex-col gap-1">
          {navItems.map(({ path, label, Icon }) => navLink(path, label, Icon, () => setMenuOpen(false)))}
          <div className="border-t mt-2 pt-2">
            {isAuthenticated ? (
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            ) : (
              <button
                onClick={() => (window.location.href = import.meta.env.DEV ? "/api/dev-login" : "/api/oauth/callback")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
