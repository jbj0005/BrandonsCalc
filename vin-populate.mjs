/* global supabase */
import { mcByVin } from "./mc-client.mjs";

const SELECT_COLS = `
  id, user_id, vehicle, heading, vin, year, make, model, trim, mileage, asking_price,
  dealer_name, dealer_street, dealer_city, dealer_state, dealer_zip, dealer_phone,
  dealer_lat, dealer_lng, listing_id, listing_source, listing_url, photo_url,
  marketcheck_payload
`;

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
  const { found, payload } = await mcByVin(cleanVin, {
    zip: normalizedHomeZip,
    radius: 200,
    pick: "nearest",
  });
  if (!found) throw new Error("No active listing for this VIN");

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
      payload.vehicle ||
      payload.heading ||
      [payload.year, payload.make, payload.model, payload.trim]
        .filter(Boolean)
        .join(" ");
    set(modalFields.vehicle, nickname);
    set(modalFields.vin, payload.vin);
    set(modalFields.year, payload.year);
    set(modalFields.make, payload.make);
    set(modalFields.model, payload.model);
    set(modalFields.trim, payload.trim);
    set(modalFields.mileage, payload.mileage);
    set(modalFields.asking_price, payload.asking_price);
    set(modalFields.dealer_name, payload.dealer_name);
    set(modalFields.dealer_phone, payload.dealer_phone);
    set(modalFields.dealer_street, payload.dealer_street);
    set(modalFields.dealer_city, payload.dealer_city);
    set(modalFields.dealer_state, payload.dealer_state);
    set(modalFields.dealer_zip, payload.dealer_zip);
    set(modalFields.dealer_lat, payload.dealer_lat);
    set(modalFields.dealer_lng, payload.dealer_lng);
  }

  const row = {
    ...(vehicleId ? { id: vehicleId } : {}),
    ...(cleanUserId ? { user_id: cleanUserId } : {}),
    ...Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)),
    marketcheck_payload: payload,
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
