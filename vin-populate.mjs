/* global supabase */
import { mcByVin } from "./mc-client.mjs";

const SELECT_COLS = `
  id, user_id, vehicle, heading, vin, year, make, model, trim, mileage, asking_price,
  dealer_name, dealer_street, dealer_city, dealer_state, dealer_zip, dealer_phone,
  dealer_lat, dealer_lng, listing_id, listing_source, listing_url, photo_url,
  marketcheck_payload
`;

function parseVehicleFromUrl(url) {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    let year = null;
    let model = null;
    let make = null;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (/^\d{4}$/.test(segment)) {
        year = Number(segment);
        if (i >= 1) {
          model = segments[i - 1];
        }
        if (i >= 2) {
          make = segments[i - 2];
        }
        break;
      }
    }
    const normalizeToken = (token) =>
      token ? token.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() : null;
    return {
      year: Number.isFinite(year) ? year : null,
      make: normalizeToken(make),
      model: normalizeToken(model),
    };
  } catch (error) {
    console.warn("[vin] failed to parse vehicle from URL", error);
    return {};
  }
}

function buildHistoryFallback(historyEntries, vin) {
  if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
    return null;
  }
  const sorted = historyEntries
    .slice()
    .sort(
      (a, b) =>
        Number(b?.last_seen_at || b?.scraped_at || 0) -
        Number(a?.last_seen_at || a?.scraped_at || 0)
    );
  const latest = sorted[0];
  if (!latest) return null;

  const parsed = parseVehicleFromUrl(latest.vdp_url);
  const make = parsed.make || null;
  const model = parsed.model || null;
  const year = parsed.year || null;
  const headingBase = [make, model].filter(Boolean).join(" ").trim() || null;

  if (!year && !make && !model && !headingBase) {
    return null;
  }

  return {
    vin,
    year,
    make,
    model,
    trim: null,
    heading: headingBase,
    vehicle: headingBase,
    mileage: latest.miles ?? latest.mileage ?? null,
    asking_price: latest.price ?? null,
    dealer_name:
      latest.seller_name || latest.dealer_name || latest.dealer || null,
    dealer_street: latest.dealer_street || latest.street || null,
    dealer_city: latest.city || latest.dealer_city || null,
    dealer_state: latest.state || latest.dealer_state || null,
    dealer_zip: latest.zip || latest.dealer_zip || null,
    dealer_phone: latest.dealer_phone || null,
    dealer_lat: latest.latitude ?? null,
    dealer_lng: latest.longitude ?? null,
    listing_id: latest.id || latest.listing_id || null,
    listing_source: latest.source || "MARKETCHECK",
    listing_url: latest.vdp_url || null,
    photo_url: null,
  };
}

export async function populateVehicleFromVinSecure({
  vin,
  userId,
  vehicleId,
  vehicleSelectEl,
  vehiclesCacheRef,
  modalFields,
  homeZip,
}) {
  if (!supabase) throw new Error("Supabase client unavailable.");
  const cleanVin = String(vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(cleanVin)) throw new Error("Invalid VIN");

  const normalizedHomeZip = homeZip
    ? String(homeZip).replace(/\D/g, "")
    : window?.homeLocationState?.postalCode
    ? String(window.homeLocationState.postalCode).replace(/\D/g, "")
    : "";
  const { found, payload, extras } = await mcByVin(cleanVin, {
    radius: 200,
    pick: "nearest",
  });
  const historyFallback = buildHistoryFallback(extras?.history ?? [], cleanVin);
  if (!payload && !historyFallback) {
    throw new Error("No active listing for this VIN");
  }
  const effectivePayload = payload || historyFallback;

  const isValidUuid = (value) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    );
  const cleanUserId = isValidUuid(userId) ? userId : null;

  if (!cleanUserId) {
    throw new Error("Sign in to populate vehicles from VIN.");
  }

  if (modalFields) {
    const set = (el, v) => {
      if (!el) return;
      el.value = v == null ? "" : String(v);
    };
    const nickname =
      effectivePayload.vehicle ||
      effectivePayload.heading ||
      [
        effectivePayload.year,
        effectivePayload.make,
        effectivePayload.model,
        effectivePayload.trim,
      ]
        .filter(Boolean)
        .join(" ");
    set(modalFields.vehicle, nickname);
    set(modalFields.vin, effectivePayload.vin);
    set(modalFields.year, effectivePayload.year);
    set(modalFields.make, effectivePayload.make);
    set(modalFields.model, effectivePayload.model);
    set(modalFields.trim, effectivePayload.trim);
    set(modalFields.mileage, effectivePayload.mileage);
    set(modalFields.asking_price, effectivePayload.asking_price);
    set(modalFields.dealer_name, effectivePayload.dealer_name);
    set(modalFields.dealer_phone, effectivePayload.dealer_phone);
    set(modalFields.dealer_street, effectivePayload.dealer_street);
    set(modalFields.dealer_city, effectivePayload.dealer_city);
    set(modalFields.dealer_state, effectivePayload.dealer_state);
    set(modalFields.dealer_zip, effectivePayload.dealer_zip);
    set(modalFields.dealer_lat, effectivePayload.dealer_lat);
    set(modalFields.dealer_lng, effectivePayload.dealer_lng);
  }

  const row = {
    ...(vehicleId ? { id: vehicleId } : {}),
    ...(cleanUserId ? { user_id: cleanUserId } : {}),
    ...Object.fromEntries(
      Object.entries(effectivePayload).filter(([, v]) => v !== undefined)
    ),
    marketcheck_payload: {
      payload: effectivePayload,
      extras: extras ?? null,
    },
  };

  let { data, error } = await supabase
    .from("vehicles")
    .upsert(row, { onConflict: "vin,user_id" })
    .select(SELECT_COLS)
    .single();

  const conflictRegex =
    /no unique or exclusion constraint matching the ON CONFLICT specification/i;

  if (error && conflictRegex.test(error.message || "")) {
    // Fallback for databases missing the vin/user unique index:
    // attempt manual select + update/insert.
    let lookupQuery = supabase
      .from("vehicles")
      .select(SELECT_COLS)
      .eq("vin", row.vin);
    lookupQuery = cleanUserId
      ? lookupQuery.eq("user_id", cleanUserId)
      : lookupQuery.is("user_id", null);
    const { data: existing, error: lookupError } = await lookupQuery.maybeSingle();

    if (lookupError && lookupError.message) {
      throw lookupError;
    }

    if (existing?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("vehicles")
        .update(row)
        .eq("id", existing.id)
        .select(SELECT_COLS)
        .single();
      data = updated;
      error = updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("vehicles")
        .insert(row)
        .select(SELECT_COLS)
        .single();
      data = inserted;
      error = insertError;
    }
  }

  const rlsRegex = /row-level security/i;
  if (error && rlsRegex.test(error.message || "")) {
    throw new Error(
      "Supabase blocked the save because row-level security is still enforced. Update the public.vehicles policies to allow this operation or sign in."
    );
  }

  if (error) throw error;

  if (Array.isArray(vehiclesCacheRef?.value)) {
    const idx = vehiclesCacheRef.value.findIndex((v) => String(v.id) === String(data.id));
    if (idx >= 0) {
      vehiclesCacheRef.value[idx] = data;
    } else {
      vehiclesCacheRef.value.unshift(data);
    }
  }

  if (vehicleSelectEl instanceof HTMLSelectElement) {
    const label = [data.year, data.make, data.model, data.trim].filter(Boolean).join(" ");
    let opt = vehicleSelectEl.querySelector(`option[value="${data.id}"]`);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = String(data.id);
      vehicleSelectEl.appendChild(opt);
    }
    opt.textContent = label || data.vehicle || "Vehicle";
    vehicleSelectEl.value = String(data.id);
  }

  return { row: data, payload };
}
