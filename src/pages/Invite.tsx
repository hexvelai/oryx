import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { convexApi } from "@/lib/convex-api";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";

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
    if (inviteInfo === undefined) return { title: "Loading invite…", body: "Checking invite status." };
    if (!inviteInfo) return { title: "Invite unavailable", body: "This invite is expired, already used, or you don’t have access to it." };
    return { title: "You’ve been invited", body: `Join "${inviteInfo.title}" as ${inviteInfo.role}.` };
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
    <div className="app-canvas min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-6 py-10">
        <div className="surface-panel w-full rounded-[28px] px-8 py-10 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Invite</div>
          <div className="mt-4 text-3xl text-foreground">{status.title}</div>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">{status.body}</p>

          {inviteInfo ? (
            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button className="h-10 rounded-full px-6" disabled={isWorking} onClick={() => void onAccept()}>
                Accept invite
              </Button>
              <Button variant="outline" className="h-10 rounded-full px-6" disabled={isWorking} onClick={() => void onDecline()}>
                Deny
              </Button>
            </div>
          ) : null}

          <Link to="/" className="mt-8 inline-flex text-sm font-medium text-foreground underline underline-offset-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
