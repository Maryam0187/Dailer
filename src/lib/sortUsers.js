function presenceRank(presence) {
  if (presence === "online") return 0;
  if (presence === "away") return 1;
  return 2;
}

function listRank(user) {
  if (user.role === "admin") return 4;
  if (user.isActive === false || user.isActive === 0) return 3;
  return presenceRank(user.presence);
}

function lastActiveMs(user) {
  if (!user.lastActiveAt) return 0;
  const ms = new Date(user.lastActiveAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Online → away → offline → inactive → admin; online/away/offline by last active desc. */
export function sortUsersForDisplay(users) {
  return [...(users || [])].sort((a, b) => {
    const rankDiff = listRank(a) - listRank(b);
    if (rankDiff !== 0) return rankDiff;

    const rank = listRank(a);
    if (rank <= 2) {
      const activeDiff = lastActiveMs(b) - lastActiveMs(a);
      if (activeDiff !== 0) return activeDiff;
    }

    return (a.username || "").localeCompare(b.username || "");
  });
}
