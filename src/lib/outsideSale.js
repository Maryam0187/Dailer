/** Leads created from the Outside customers tab (one sale per row). */
export const OUTSIDE_SALE_SOURCE = "outside_sale";

export function isOutsideSaleSource(source) {
  return source === OUTSIDE_SALE_SOURCE;
}
