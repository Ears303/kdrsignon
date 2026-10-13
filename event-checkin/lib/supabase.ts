import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export const isConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)

/** Created lazily so the build doesn't fail when env vars aren't set yet. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
      throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
    }
    client = createClient(url, key)
  }
  return client
}

/** Fetch every row of a table for an event, paging past Supabase's 1000-row default limit. */
export async function fetchAll<T>(table: string, eventId: string, columns = '*', order = 'id'): Promise<T[]> {
  const sb = getSupabase()
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select(columns).eq('event_id', eventId).order(order).range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}
