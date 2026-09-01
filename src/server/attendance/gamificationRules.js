export const BASE_DAILY_POINTS = 10;

export const POINT_TIERS = [
  { maxMinutesAfterStart: 30, percent: 100, tierKey: "full" },
  { maxMinutesAfterStart: 45, percent: 90, tierKey: "tier_90" },
  { maxMinutesAfterStart: 60, percent: 50, tierKey: "tier_50" },
  { maxMinutesAfterStart: 75, percent: 10, tierKey: "tier_10" },
];

/** Tiers that keep the on-time streak (100% or 90%). */
export const STREAK_QUALIFYING_TIER_KEYS = new Set(["full", "tier_90"]);

export const STREAK_BONUSES = [
  { days: 3, points: 15, reason: "streak_bonus_3" },
  { days: 7, points: 50, reason: "streak_bonus_7" },
  { days: 14, points: 100, reason: "streak_bonus_14" },
  { days: 30, points: 250, reason: "streak_bonus_30" },
];

export const BADGE_DEFINITIONS = [
  { badgeKey: "on_time_starter", label: "First on-time login", minStreak: null, type: "first_qualifying" },
  { badgeKey: "streak_3", label: "3-day streak", minStreak: 3, type: "streak" },
  { badgeKey: "streak_7", label: "7-day streak", minStreak: 7, type: "streak" },
  { badgeKey: "streak_14", label: "14-day streak", minStreak: 14, type: "streak" },
  { badgeKey: "streak_30", label: "30-day streak", minStreak: 30, type: "streak" },
  { badgeKey: "perfect_week", label: "Perfect week", minStreak: null, type: "perfect_week" },
];

export function resolvePointTier(minutesAfterStart) {
  if (minutesAfterStart == null || Number.isNaN(minutesAfterStart)) {
    return { tierKey: "none", percent: 0, maxMinutesAfterStart: null };
  }

  if (minutesAfterStart < 0) {
    return { tierKey: "full", percent: 100, maxMinutesAfterStart: 30 };
  }

  if (minutesAfterStart >= 90) {
    return { tierKey: "none", percent: 0, maxMinutesAfterStart: 90 };
  }

  if (minutesAfterStart > 75) {
    return { tierKey: "tier_10", percent: 10, maxMinutesAfterStart: 75 };
  }

  for (const tier of POINT_TIERS) {
    if (minutesAfterStart <= tier.maxMinutesAfterStart) {
      return tier;
    }
  }

  return { tierKey: "none", percent: 0, maxMinutesAfterStart: 90 };
}

export function pointsForTier(percent) {
  return Math.round((BASE_DAILY_POINTS * percent) / 100);
}

export function isStreakQualifyingTier(tierKey) {
  return STREAK_QUALIFYING_TIER_KEYS.has(tierKey);
}

export function buildTierDeadlineMinutes() {
  return [
    { minutesAfterStart: 30, percent: 100 },
    { minutesAfterStart: 45, percent: 90 },
    { minutesAfterStart: 60, percent: 50 },
    { minutesAfterStart: 75, percent: 10 },
    { minutesAfterStart: 90, percent: 0 },
  ];
}
