const DEFAULT_OWNER = "uechikohei";

export function getOwnerGitHubUsername() {
  return (process.env.OWNER_GITHUB_USERNAME || DEFAULT_OWNER).trim();
}

export function isAllowedGitHubLogin(login: string | null | undefined) {
  const owner = getOwnerGitHubUsername().toLowerCase();

  return Boolean(login && login.toLowerCase() === owner);
}

export function readGitHubLogin(profile: unknown) {
  if (!profile || typeof profile !== "object") {
    return undefined;
  }

  const login = (profile as { login?: unknown }).login;

  return typeof login === "string" ? login : undefined;
}

export function isAuthConfigured() {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GITHUB_ID &&
      process.env.AUTH_GITHUB_SECRET,
  );
}

export function isDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}

export function isOwnerAuthorized(login: string | null | undefined) {
  return isAllowedGitHubLogin(login) || isDevAuthBypassEnabled();
}
