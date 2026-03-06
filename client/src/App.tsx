import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Analysis from "./pages/Analysis";
import Chat from "./pages/Chat";
import Tech from "./pages/Tech";
import Match from "./pages/Match";
import Reports from "./pages/Reports";
import NavBar from "./components/NavBar";

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <div className="flex-1">
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/match"} component={Match} />
          <Route path={"/reports"} component={Reports} />
          <Route path={"/chat"} component={Chat} />
          <Route path={"/tech"} component={Tech} />
          <Route path={"/admin"} component={Admin} />
          <Route path={"/analysis/:id"} component={Analysis} />
          <Route path={"/dashboard"}>
            <Redirect to="/" />
          </Route>
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}


function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
