const MC_API_BASE = "/api/mc";

export async function mcByVin(vin, { zip = "", radius = 200, pick = "nearest" } = {}) {
  const qp = new URLSearchParams();
  if (zip) qp.set("zip", String(zip).replace(/\D/g, ""));
  if (radius) qp.set("radius", String(radius));
  if (pick) qp.set("pick", pick);
  const r = await fetch(`${MC_API_BASE}/by-vin/${encodeURIComponent(vin)}?${qp.toString()}`);
  if (!r.ok) throw new Error(`byVin failed (${r.status})`);
  return r.json();
}

export async function mcListing(id) {
  const r = await fetch(`${MC_API_BASE}/listing/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`listing failed (${r.status})`);
  return r.json();
}
