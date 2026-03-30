import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App.tsx";
import "@fontsource/google-sans/latin-400.css";
import "@fontsource/google-sans/latin-500.css";
import "@fontsource/google-sans/latin-600.css";
import "@fontsource/google-sans/latin-700.css";
import "@fontsource/google-sans/latin-ext-400.css";
import "@fontsource/google-sans/latin-ext-500.css";
import "@fontsource/google-sans/latin-ext-600.css";
import "@fontsource/google-sans/latin-ext-700.css";
import "./index.css";
import "katex/dist/katex.min.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function inferSetupHint(message: string) {
  if (
    message.includes("Could not find public function") ||
    message.includes("Could not find function") ||
    message.includes("There is no public function") ||
    message.includes("deployment") ||
    message.includes("Convex")
  ) {
    return "Your Convex backend likely hasn't been pushed yet. Run `npx convex dev` or `npx convex deploy` in this repo so the new backend functions exist in the `oryx` project.";
  }

  return "Check the browser console for the exact runtime error, then we can tighten the failing path.";
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const message = this.state.error.message || "Unknown error";
    const hint = inferSetupHint(message);

    return (
      <div className="gradient-bg-mesh min-h-screen text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-6 py-12">
          <div className="w-full animate-fade-up">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">App Error</p>
            <h1 className="mt-3 text-3xl font-display text-foreground">The app failed to start.</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{hint}</p>
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {message}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  convexUrl && clerkPubKey ? (
    <ClerkProvider publishableKey={clerkPubKey}>
      <AppErrorBoundary>
        <ConvexProviderWithClerk client={new ConvexReactClient(convexUrl)} useAuth={useAuth}>
          <App />
        </ConvexProviderWithClerk>
      </AppErrorBoundary>
    </ClerkProvider>
  ) : (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: '"Google Sans", system-ui, sans-serif',
        background: "hsl(240 6% 6%)",
        color: "hsl(240 5% 93%)",
      }}
    >
      <div style={{ maxWidth: 560, lineHeight: 1.6 }}>
        Missing <code>VITE_CONVEX_URL</code> or <code>VITE_CLERK_PUBLISHABLE_KEY</code>.
        Add them in <code>.env.local</code> to run the app.
      </div>
    </div>
  ),
);
