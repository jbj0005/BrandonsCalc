-- Add condition column to vehicles table
alter table vehicles add column if not exists condition text;

comment on column vehicles.condition is 'Vehicle condition (e.g., New, Used, Certified)';
