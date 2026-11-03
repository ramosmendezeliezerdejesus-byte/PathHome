import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(environment.supabaseUrl && environment.supabasePublishableKey);
}

/** Returns the shared Supabase client, or null until project credentials are configured. */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  client ??= createClient(environment.supabaseUrl, environment.supabasePublishableKey);
  return client;
}
