import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatProvider } from "@/context/ChatContext";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton, SignOutButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import Index from "./pages/Index.tsx";
import DeepDive from "./pages/DeepDive.tsx";
import DeepDives from "./pages/DeepDives.tsx";
import Invite from "./pages/Invite.tsx";
import NotFound from "./pages/NotFound.tsx";
import { Button } from "./components/ui/button";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthLoading>
            <div className="flex min-h-screen items-center justify-center bg-background">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground animate-pulse">Loading Workspace...</div>
            </div>
          </AuthLoading>
          <Unauthenticated>
            <div className="app-canvas flex min-h-screen items-center justify-center bg-background px-6">
              <div className="surface-panel w-full max-w-md rounded-[32px] p-10 text-center shadow-xl">
                <SignedOut>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Welcome to Teselix</div>
                  <h1 className="mt-4 text-4xl font-medium tracking-tight text-foreground">Sign in to start a Deep Dive.</h1>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">Collaborate with multiple AI models in a single workspace.</p>
                  <div className="mt-10">
                    <SignInButton mode="modal" forceRedirectUrl={window.location.pathname}>
                      <Button size="lg" className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 py-6 text-base font-medium transition-all hover:scale-[1.02]">
                        Continue with Google
                      </Button>
                    </SignInButton>
                  </div>
                  <p className="mt-6 text-[10px] text-muted-foreground/60 uppercase tracking-widest">Powered by Convex & Clerk</p>
                </SignedOut>
                <SignedIn>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Signed in</div>
                  <h1 className="mt-4 text-3xl font-medium tracking-tight text-foreground">Finishing setup…</h1>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    Clerk is signed in, but Convex is not accepting the session token yet. This usually means the Clerk JWT template <strong>"convex"</strong> or the Convex issuer configuration is missing.
                  </p>
                  <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900/30 dark:bg-amber-900/10">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-400">Check these:</p>
                    <p className="mt-1 text-[11px] leading-5 text-amber-700 dark:text-amber-500/80">
                      1) Clerk Dashboard → JWT Templates → create template <strong>"convex"</strong> (audience: <strong>convex</strong>). 2) Convex env var <strong>CLERK_JWT_ISSUER_DOMAIN</strong> = your Clerk Frontend API URL (this repo defaults to <strong>https://prime-halibut-45.clerk.accounts.dev</strong>).
                    </p>
                  </div>
                  <div className="mt-10 flex flex-col gap-2">
                    <Button
                      size="lg"
                      className="w-full rounded-full bg-foreground py-6 text-base font-medium text-background hover:bg-foreground/90"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                    <SignOutButton>
                      <Button variant="outline" size="lg" className="w-full rounded-full py-6 text-base font-medium">
                        Sign out
                      </Button>
                    </SignOutButton>
                  </div>
                  <p className="mt-6 text-[10px] text-muted-foreground/60 uppercase tracking-widest">Powered by Convex & Clerk</p>
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
