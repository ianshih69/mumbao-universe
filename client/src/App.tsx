import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import FixedViewport from "@/components/utils/FixedViewport";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MumbaoChatLauncher } from "./components/ai/MumbaoChatLauncher";
import Home from "./pages/Home";
import About from "./pages/About";
import Mumbao from "./pages/Mumbao";
import Admin from "./pages/Admin";
import AiChat from "./pages/AiChat";
import Chat from "./pages/Chat";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/about"} component={About} />
      <Route path={"/ai-chat"} component={AiChat} />
      <Route path={"/chat"} component={Chat} />
      <Route path={"/about-mumbao"} component={Mumbao} />
      <Route path={"/mumbao"} component={Mumbao} />
      <Route path={"/zh-TW/about-mumbao"} component={Mumbao} />
      <Route path={"/en/about-mumbao"} component={Mumbao} />
      <Route path={"/ja/about-mumbao"} component={Mumbao} />
      <Route path={"/ko/about-mumbao"} component={Mumbao} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <FixedViewport />
      <ThemeProvider
        defaultTheme="light"
      // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <MumbaoChatLauncher />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
