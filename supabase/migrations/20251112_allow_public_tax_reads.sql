-- Allow public read access to county_surtax_windows table
-- Tax rates are public data and need to be readable by anonymous users

-- Enable RLS on the table (if not already enabled)
ALTER TABLE county_surtax_windows ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read tax rates
CREATE POLICY "Allow public read access to tax rates"
  ON county_surtax_windows
  FOR SELECT
  TO anon
  USING (true);

-- Also allow authenticated users to read
CREATE POLICY "Allow authenticated read access to tax rates"
  ON county_surtax_windows
  FOR SELECT
  TO authenticated
  USING (true);
