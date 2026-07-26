import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { ExpressionCaptureForm } from "@/components/expression-capture-form";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";
import { listPrimarySituationDefinitions } from "@/lib/expression-store";

export const dynamic = "force-dynamic";

export default async function InputPage() {
  if (isDevAuthBypassEnabled()) {
    const primarySituations = await listPrimarySituationDefinitions(ownerGithubUsername).catch(() => []);
    return (
      <AppFrame activePath="input" roleLabel="owner" userLabel={ownerGithubUsername}>
        <ExpressionCaptureForm primarySituations={primarySituations} />
      </AppFrame>
    );
  }

  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");
  if (!isOwnerSession(session)) redirect("/denied");
  const ownerLogin = session.user.githubLogin ?? ownerGithubUsername;
  const primarySituations = await listPrimarySituationDefinitions(ownerLogin).catch(() => []);

  return (
    <AppFrame activePath="input" roleLabel="owner" userLabel={ownerLogin}>
      <ExpressionCaptureForm primarySituations={primarySituations} />
    </AppFrame>
  );
}
