import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { convexApi } from "@/lib/convex-api";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function Invite() {
  const navigate = useNavigate();
  const { token } = useParams();
  const acceptInvite = useConvexMutation(convexApi.deepDives.acceptInvite);
  const declineInvite = useConvexMutation(convexApi.deepDives.declineInvite);
  const inviteInfo = useConvexQuery(convexApi.deepDives.getInviteInfo, token ? { token } : "skip") as
    | { deepDiveId: string; title: string; role: "editor" | "commenter" | "viewer"; expiresAt: number | null }
    | null
    | undefined;
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const status = useMemo(() => {
    if (error) return { title: "Invite failed", body: error };
    if (!token) return { title: "Invite failed", body: "Missing invite token." };
    if (inviteInfo === undefined) return { title: "Loading invite...", body: "Checking invite status." };
    if (!inviteInfo) return { title: "Invite unavailable", body: "This invite is expired, already used, or you don't have access." };
    return { title: "You've been invited", body: `Join "${inviteInfo.title}" as ${inviteInfo.role}.` };
  }, [error, inviteInfo, token]);

  const onAccept = async () => {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await acceptInvite({ token });
      navigate(`/dive/${result.deepDiveId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept invite");
    } finally {
      setIsWorking(false);
    }
  };

  const onDecline = async () => {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    try {
      await declineInvite({ token });
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deny invite");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="gradient-bg-mesh min-h-screen">
      <AppHeader />
      <div className="mx-auto flex min-h-[70vh] max-w-sm items-center justify-center px-6 py-10">
        <div className="w-full text-center animate-slide-up">
          <BrandLogo gradient showLabel={false} className="justify-center" />

          <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">Invite</p>
          <h1 className="mt-3 text-2xl font-display text-foreground">{status.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{status.body}</p>

          {inviteInfo ? (
            <div className="mt-8 flex flex-col gap-2">
              <button
                className="btn-gradient w-full rounded-xl px-6 py-3 text-sm font-medium shadow-md gradient-glow"
                disabled={isWorking}
                onClick={() => void onAccept()}
              >
                Accept invite
              </button>
              <Button variant="ghost" className="w-full" disabled={isWorking} onClick={() => void onDecline()}>
                Decline
              </Button>
            </div>
          ) : null}

          <Link to="/" className="mt-8 inline-flex text-sm text-primary hover:text-primary/80">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
