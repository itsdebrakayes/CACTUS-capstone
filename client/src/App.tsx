import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardHome from "./pages/DashboardHome";
import SchedulePage from "./pages/SchedulePage";
import MapPage from "./pages/MapPage";
import ProfilePage from "./pages/ProfilePage";
import ClassChatPage from "./pages/ClassChatPage";
// Legacy full-featured panels (walking body, reports, check-ins)
import Dashboard from "./pages/Dashboard";

function Router() {
  return (
    <Switch>
      {/* Auth */}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />

      {/* Main app tabs */}
      <Route path="/dashboard" component={DashboardHome} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/map" component={MapPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/class-chat" component={ClassChatPage} />

      {/* Legacy full-featured panels (walking, reports, check-ins) */}
      <Route path="/walking" component={Dashboard} />
      <Route path="/reports" component={Dashboard} />
      <Route path="/check-in" component={Dashboard} />

      {/* Root redirect to dashboard */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
