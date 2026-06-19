import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Sync ist optional: ohne konfigurierte Umgebungsvariablen bleibt SemBan
// rein lokal (kein Konto, keine Cloud) – genau wie bisher.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSyncConfigured = Boolean(url && anonKey)

// Diagnose (hilft beim Deploy-Debugging): zeigt in der Browser-Konsole, ob die
// Env-Variablen im Build angekommen sind.
if (typeof console !== 'undefined') {
  console.info(
    '[SemBan] Cloud-Sync konfiguriert:',
    isSyncConfigured,
    '| URL gesetzt:',
    Boolean(url),
    '| Key gesetzt:',
    Boolean(anonKey),
  )
}

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
