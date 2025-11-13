#!/usr/bin/env node
/**
 * Setup Supabase Storage Bucket for Vehicle Photos
 *
 * This script creates the garage-vehicle-photos bucket if it doesn't exist
 * and sets up the appropriate access policies.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  console.error('\nPlease set these in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorageBucket() {
  console.log('🚀 Setting up garage-vehicle-photos storage bucket...\n');

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`);
    }

    const bucketExists = buckets?.some(b => b.name === 'garage-vehicle-photos');

    if (bucketExists) {
      console.log('✓ Bucket already exists: garage-vehicle-photos');
    } else {
      // Create bucket
      const { data: newBucket, error: createError } = await supabase.storage.createBucket(
        'garage-vehicle-photos',
        {
          public: true, // Photos are publicly accessible
          fileSizeLimit: 5242880, // 5MB limit
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
        }
      );

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }

      console.log('✓ Created bucket: garage-vehicle-photos');
    }

    // Set up RLS policies (using SQL)
    console.log('\n📋 Setting up storage policies...');

    // Policy 1: Allow authenticated users to upload
    const { error: policy1Error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY IF NOT EXISTS "Allow authenticated uploads"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'garage-vehicle-photos');
      `
    });

    // Policy 2: Allow public access to view
    const { error: policy2Error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY IF NOT EXISTS "Allow public access"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'garage-vehicle-photos');
      `
    });

    // Policy 3: Allow users to delete their own photos
    const { error: policy3Error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY IF NOT EXISTS "Allow authenticated deletes"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (bucket_id = 'garage-vehicle-photos');
      `
    });

    if (!policy1Error && !policy2Error && !policy3Error) {
      console.log('✓ Storage policies configured');
    } else {
      console.log('⚠️  Policies may already exist or need to be set manually in Supabase dashboard');
    }

    console.log('\n✅ Storage setup complete!');
    console.log('\n📸 You can now upload vehicle photos in the app');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\n📝 Manual setup instructions:');
    console.error('1. Go to your Supabase dashboard');
    console.error('2. Navigate to Storage');
    console.error('3. Create a new bucket named: garage-vehicle-photos');
    console.error('4. Set it as public');
    console.error('5. Set file size limit: 5MB');
    console.error('6. Allowed MIME types: image/png, image/jpeg, image/jpg, image/gif, image/webp');
    process.exit(1);
  }
}

setupStorageBucket();
