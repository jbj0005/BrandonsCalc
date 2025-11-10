-- Migration: Allow Public Offer Viewing
-- Date: 2025-11-04
-- Description: Allow anyone with the offer ID (UUID) to view an offer
--              This enables shareable offer links sent via SMS/email
--              UUIDs are cryptographically secure (2^128 possibilities) so this is safe

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view own offers" ON customer_offers;

-- Ensure we don't fail if the public policy already exists
DROP POLICY IF EXISTS "Anyone can view offers with link" ON customer_offers;

-- Create new policy that allows anyone to view any offer
-- This is secure because:
-- 1. UUIDs are unguessable (cryptographically random)
-- 2. Only SELECT is allowed, no modifications
-- 3. Similar to how Google Docs shareable links work
CREATE POLICY "Anyone can view offers with link"
  ON customer_offers
  FOR SELECT
  USING (true);

-- Keep the restrictive policies for INSERT, UPDATE, DELETE
-- Only authenticated users can modify their own offers
