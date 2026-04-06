import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatProvider } from "@/context/ChatContext";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton, SignOutButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index.tsx";
import DeepDive from "./pages/DeepDive.tsx";
import DeepDives from "./pages/DeepDives.tsx";
import Invite from "./pages/Invite.tsx";
import NotFound from "./pages/NotFound.tsx";
import { Button } from "./components/ui/button";
import { BrandLogo } from "./components/brand/BrandLogo";

const queryClient = new QueryClient();
const enableVercelAnalytics = import.meta.env.PROD && import.meta.env.VITE_ENABLE_VERCEL_ANALYTICS === "true";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {enableVercelAnalytics ? <Analytics /> : null}
        <BrowserRouter>
          <AuthLoading>
            <div className="flex min-h-screen items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-3 animate-fade-up">
                <BrandLogo showLabel={false} />
                <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
              </div>
            </div>
          </AuthLoading>
          <Unauthenticated>
            <div className="gradient-bg-mesh flex min-h-screen items-center justify-center px-6">
              <div className="w-full max-w-sm animate-fade-up">
                <SignedOut>
                  <div className="flex flex-col items-center text-center">
                    <BrandLogo />

                    <h1 className="mt-8 text-2xl font-display tracking-tight text-foreground">
                      Sign in to oryx
                    </h1>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Projects, threads, and multi-model conversations.
                    </p>

                    <div className="mt-8 w-full">
                      <SignInButton mode="modal" forceRedirectUrl={window.location.pathname}>
                        <button className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                          Continue with Google
                        </button>
                      </SignInButton>
                    </div>

                    <p className="mt-6 text-[10px] text-muted-foreground/40 uppercase tracking-widest">
                      Powered by Convex & Clerk
                    </p>
                  </div>
                </SignedOut>
                <SignedIn>
                  <div className="flex flex-col items-center text-center">
                    <BrandLogo />

                    <h1 className="mt-8 text-xl font-display tracking-tight text-foreground">
                      Finishing setup...
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Clerk is signed in, but Convex is not accepting the session token yet.
                    </p>

                    <div className="mt-6 w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left">
                      <p className="text-xs font-medium text-amber-400">Setup checklist</p>
                      <p className="mt-1.5 text-[11px] leading-5 text-amber-400/70">
                        1) Clerk Dashboard → JWT Templates → create template <strong>"convex"</strong> (audience: <strong>convex</strong>). 2) Convex env var <strong>CLERK_JWT_ISSUER_DOMAIN</strong> = your Clerk Frontend API URL.
                      </p>
                    </div>

                    <div className="mt-8 flex w-full flex-col gap-2">
                      <Button
                        onClick={() => window.location.reload()}
                        className="w-full"
                      >
                        Retry
                      </Button>
                      <SignOutButton>
                        <Button variant="ghost" className="w-full text-muted-foreground">
                          Sign out
                        </Button>
                      </SignOutButton>
                    </div>
                  </div>
                </SignedIn>
              </div>
            </div>
          </Unauthenticated>
          <Authenticated>
            <ChatProvider>
              <Routes>
                <Route path="/" element={<DeepDives />} />
                <Route path="/dive/:diveId" element={<DeepDive />} />
                <Route path="/invite/:token" element={<Invite />} />
                <Route path="/playground" element={<Index />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ChatProvider>
          </Authenticated>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
