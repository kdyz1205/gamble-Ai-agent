/** Parse only JSON objects; null, arrays and malformed JSON are client errors. */
export async function readJsonObject(request: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** Never pass NaN, fractional, negative or overflowing values to Prisma pagination. */
export function pageInteger(raw: string | null, fallback: number, minimum: number,
  maximum: number, clampMaximum = false): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) return null;
  if (value > maximum) return clampMaximum ? maximum : null;
  return value;
}

export type NearbyQuery = { latitude: number; longitude: number; radiusMiles: number };
export function nearbyQuery(search: URLSearchParams): NearbyQuery | null {
  const latitudeRaw = search.get("lat"), longitudeRaw = search.get("lng");
  if (!latitudeRaw?.trim() || !longitudeRaw?.trim()) return null;
  const latitude = Number(latitudeRaw), longitude = Number(longitudeRaw);
  const radiusRaw = search.get("radius");
  const radiusMiles = radiusRaw === null || radiusRaw === "" ? 10 : Number(radiusRaw);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(radiusMiles) || radiusMiles <= 0) return null;
  return { latitude, longitude, radiusMiles };
}
