/**
 * Deployment label for the footer. Railway injects vars at **runtime**; Next.js can
 * inline `process.env.FOO` at **build** time if it sees a static property access.
 * Always read with dynamic keys so runtime values from Railway reach the server.
 *
 * Railway reference (no official `RAILWAY_GIT_TAG`; use SHA, branch, deployment id):
 * https://docs.railway.com/reference/variables
 */

function trimStr(v) {
  if (v == null || typeof v !== "string") return "";
  const t = v.trim();
  return t || "";
}

/** Git short SHA length (matches default `git rev-parse --short`). */
const SHORT_SHA_LEN = 7;

/**
 * @param {string} key
 * @returns {string}
 */
function env(key) {
  return trimStr(process.env[key]);
}

export function getDeploymentTag() {
  const explicitOrder = [
    "DEPLOYMENT_TAG",
    "RELEASE_TAG",
    "APP_VERSION",
    // Not injected by Railway by default; ok if you set it manually in the service.
    "RAILWAY_GIT_TAG",
    "SOURCE_VERSION",
  ];
  for (const k of explicitOrder) {
    const v = env(k);
    if (v) return v;
  }

  const shaFull = env("RAILWAY_GIT_COMMIT_SHA");
  const branch = env("RAILWAY_GIT_BRANCH");
  if (shaFull) {
    const short = shaFull.length > SHORT_SHA_LEN ? shaFull.slice(0, SHORT_SHA_LEN) : shaFull;
    if (branch) return `${branch}@${short}`;
    return short;
  }

  const deploymentId = env("RAILWAY_DEPLOYMENT_ID");
  if (deploymentId) return deploymentId;

  const snapshotId = env("RAILWAY_SNAPSHOT_ID");
  if (snapshotId) return snapshotId;

  if (branch) return branch;

  const replica = env("RAILWAY_REPLICA_ID");
  if (replica) return replica;

  return null;
}

export function getDeploymentTimestampRaw() {
  const keys = [
    "RAILWAY_DEPLOYMENT_CREATED_AT",
    "RAILWAY_DEPLOYED_AT",
    "NEXT_PUBLIC_DEPLOYED_AT",
    "NEXT_PUBLIC_BUILD_TIME",
  ];
  for (const k of keys) {
    const t = env(k);
    if (t) return t;
  }
  return null;
}
