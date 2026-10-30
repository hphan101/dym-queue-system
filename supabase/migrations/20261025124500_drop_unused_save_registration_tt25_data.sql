-- Security Hardening (H-02):
-- Drop the legacy public.save_registration_tt25_data RPC because public.issue_registration
-- now atomically persists tt25_data during registration INSERT.

drop function if exists public.save_registration_tt25_data(text, integer, text, jsonb);
