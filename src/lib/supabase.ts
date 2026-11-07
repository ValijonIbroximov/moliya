"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function isCloudConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON);
}

/** Brauzer uchun Supabase mijozi; env sozlanmagan bo'lsa null (mehmon rejimi) */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!isCloudConfigured() || typeof window === "undefined") {
    client = null;
    return client;
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}
