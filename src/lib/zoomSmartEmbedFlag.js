/**
 * Global kill-switch for Zoom Phone Smart Embed.
 * Defaults to on. Set NEXT_PUBLIC_ZOOM_SMART_EMBED=false to disable for all users
 * even if canUseZoomPhone is granted.
 */
export const ZOOM_SMART_EMBED_ENABLED =
  String(process.env.NEXT_PUBLIC_ZOOM_SMART_EMBED || "true").trim().toLowerCase() !== "false";
