-- Normalize unique constraints for shared_vehicles so ON CONFLICT works

-- Drop partial indexes if they exist
drop index if exists shared_vehicles_user_vehicle_unique;
drop index if exists shared_vehicles_user_vin_unique;

-- Add explicit unique constraints
alter table public.shared_vehicles
  add constraint shared_vehicles_user_shared_from_vehicle_unique unique (user_id, shared_from_vehicle_id);

alter table public.shared_vehicles
  add constraint shared_vehicles_user_vin_unique unique (user_id, vin);
