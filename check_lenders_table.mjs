#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Try to query the lenders table
const { data, error } = await supabase
  .from('lenders')
  .select('*')
  .limit(5);

if (error) {
  if (error.message.includes('does not exist')) {
    console.log('❌ Lenders table does not exist yet');
  } else {
    console.error('Error:', error.message);
  }
  process.exit(1);
} else {
  console.log('✅ Lenders table exists!');
  console.log(`Found ${data.length} lenders:`, data);
}
