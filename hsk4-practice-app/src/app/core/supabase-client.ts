/**
 * Creates the Supabase client.
 *
 * This is one thin service so that (a) the supabase-js import lives in a single
 * place and (b) specs can supply a stand-in instead of reaching the network.
 */

import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class SupabaseClientFactory {
  create(url: string, anonKey: string): SupabaseClient {
    return createClient(url, anonKey, {
      auth: {
        // Survives reloads; refreshed in the background so a long practice
        // session does not expire mid-deck.
        persistSession: true,
        autoRefreshToken: true,
        // Picks the tokens out of the URL when a password-reset link lands.
        detectSessionInUrl: true,
        // Supabase's default recovery-link template produces an implicit-flow
        // link, so this needs no custom email template or extra route.
        flowType: 'implicit',
      },
    });
  }
}
