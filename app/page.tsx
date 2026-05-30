import { Blocks } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthActions } from "@/components/auth-actions";
import { LearningWorkbench } from "@/components/learning-workbench";
import {
  getOwnerGitHubUsername,
  isAuthConfigured,
  isDevAuthBypassEnabled,
  isOwnerAuthorized,
} from "@/lib/auth-policy";
import { getLearningData } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isDevBypass = isDevAuthBypassEnabled();

  if (!isDevBypass && !isAuthConfigured()) {
    redirect("/signin?setup=1");
  }

  const [data, session] = await Promise.all([
    getLearningData(),
    isDevBypass ? Promise.resolve(null) : auth(),
  ]);

  if (!isDevBypass && !session) {
    redirect("/signin");
  }

  if (!isOwnerAuthorized(session?.user?.githubLogin)) {
    redirect("/denied");
  }

  const canUseReview =
    isOwnerAuthorized(session?.user?.githubLogin) && Boolean(process.env.XAI_API_KEY);
  const canUseCloudSync = isOwnerAuthorized(session?.user?.githubLogin) && isDatabaseConfigured();

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span>
            <Blocks aria-hidden="true" size={24} />
          </span>
          <div>
            <strong>Scene Builder</strong>
            <small>GitHub: {getOwnerGitHubUsername()}</small>
          </div>
        </div>
        <AuthActions devBypass={isDevBypass} session={session} />
      </header>

      <LearningWorkbench
        data={data}
        canUseCloudSync={canUseCloudSync}
        canUseReview={canUseReview}
      />
    </main>
  );
}
