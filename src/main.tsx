import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App.tsx";
import "./index.css";

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
    return "Your Convex backend likely hasn't been pushed yet. Run `npx convex dev` or `npx convex deploy` in this repo so the new backend functions exist in the `mosaic` project.";
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
      <div className="app-canvas min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-12">
          <div className="surface-panel w-full rounded-[28px] p-8">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">App Error</div>
            <h1 className="mt-3 text-4xl text-foreground">The app failed to start.</h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{hint}</p>
            <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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
        fontFamily: "\"Instrument Sans\", system-ui, sans-serif",
        background: "hsl(38 29% 96%)",
        color: "hsl(22 20% 14%)",
      }}
    >
      <div style={{ maxWidth: 560, lineHeight: 1.6 }}>
        Missing <code>VITE_CONVEX_URL</code> or <code>VITE_CLERK_PUBLISHABLE_KEY</code>. 
        Add them in <code>.env.local</code> to run the app.
      </div>
    </div>
  ),
);
