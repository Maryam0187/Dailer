/**
 * Railway-style deployment identity. Use the same optional vars on every Railway
 * service (Dialer + CRM) so all apps show one label:
 *   DEPLOYMENT_TAG or RELEASE_TAG — highest priority, set manually to match CRM.
 * Otherwise mirrors typical Railway: git tag → short commit SHA → deployment id.
 */

function trimStr(v) {
  if (v == null || typeof v !== "string") return "";
  const t = v.trim();
  return t || "";
}

/** Git short SHA length (matches default `git rev-parse --short`). */
const SHORT_SHA_LEN = 7;

export function getDeploymentTag() {
  const shared =
    trimStr(process.env.DEPLOYMENT_TAG) ||
    trimStr(process.env.RELEASE_TAG) ||
    trimStr(process.env.APP_VERSION);
  if (shared) return shared;

  const gitTag = trimStr(process.env.RAILWAY_GIT_TAG);
  if (gitTag) return gitTag;

  const sha = trimStr(process.env.RAILWAY_GIT_COMMIT_SHA);
  if (sha) {
    return sha.length > SHORT_SHA_LEN ? sha.slice(0, SHORT_SHA_LEN) : sha;
  }

  const deploymentId = trimStr(process.env.RAILWAY_DEPLOYMENT_ID);
  if (deploymentId) return deploymentId;

  return trimStr(process.env.RAILWAY_SNAPSHOT_ID) || null;
}

export function getDeploymentTimestampRaw() {
  const candidates = [
    process.env.RAILWAY_DEPLOYMENT_CREATED_AT,
    process.env.RAILWAY_DEPLOYED_AT,
    process.env.NEXT_PUBLIC_DEPLOYED_AT,
    process.env.NEXT_PUBLIC_BUILD_TIME,
  ];
  for (const c of candidates) {
    const t = trimStr(c);
    if (t) return t;
  }
  return null;
}
