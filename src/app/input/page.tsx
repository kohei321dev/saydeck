import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { ExpressionCaptureForm } from "@/components/expression-capture-form";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InputPage() {
  if (isDevAuthBypassEnabled()) {
    return (
      <AppFrame activePath="input" roleLabel="owner" userLabel={ownerGithubUsername}>
        <ExpressionCaptureForm />
      </AppFrame>
    );
  }

  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");
  if (!isOwnerSession(session)) redirect("/denied");

  return (
    <AppFrame activePath="input" roleLabel="owner" userLabel={session.user.githubLogin ?? undefined}>
      <ExpressionCaptureForm />
    </AppFrame>
  );
}
