const MC_API_BASE = "/api/mc";

export async function mcByVin(vin, { zip = "", radius = 200, pick = "nearest" } = {}) {
  const qp = new URLSearchParams();
  if (zip) qp.set("zip", String(zip).replace(/\D/g, ""));
  if (radius) qp.set("radius", String(radius));
  if (pick) qp.set("pick", pick);
  const r = await fetch(`${MC_API_BASE}/by-vin/${encodeURIComponent(vin)}?${qp.toString()}`);
  if (!r.ok) {
    let message = `byVin failed (${r.status})`;
    let body = null;
    try {
      body = await r.json();
    } catch {
      try {
        const text = await r.text();
        if (text) body = text;
      } catch {
        /* ignore */
      }
    }
    if (body && typeof body === "object") {
      const detail =
        (typeof body.detail === "string" && body.detail.trim()) ||
        (typeof body.error === "string" && body.error.trim()) ||
        "";
      if (detail) message = detail;
    } else if (typeof body === "string" && body.trim()) {
      message = body.trim();
    }
    const error = new Error(message);
    error.status = r.status;
    throw error;
  }
  return r.json();
}

export async function mcListing(id) {
  const r = await fetch(`${MC_API_BASE}/listing/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`listing failed (${r.status})`);
  return r.json();
}
