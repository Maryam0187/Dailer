import { formatLocationLabel } from "@/server/activity/resolveRequestLocation";

function toCoordinate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object" && typeof value.toNumber === "function") {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(typeof value === "object" && value?.toString ? value.toString() : value);
  return Number.isFinite(n) ? n : null;
}

export function serializeUserActivity(row) {
  const plain = typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
  return {
    ...plain,
    latitude: toCoordinate(plain.latitude),
    longitude: toCoordinate(plain.longitude),
  };
}

export function serializeUserActivityListItem(row) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    createdAt: row.createdAt,
    country: row.country,
    region: row.region,
    city: row.city,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    location: formatLocationLabel(row),
  };
}
