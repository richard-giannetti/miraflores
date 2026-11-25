import { createClient } from "@supabase/supabase-js";

// Public by design: the publishable key only allows what the row-level security policies allow.
const url = "https://lkbrydeqxnspsnpvimil.supabase.co";
const publishableKey = "sb_publishable_oAAH6Hy8Xg2AGtNJfJfXiA_cW_SeP2y";

export const supabase = createClient(url, publishableKey);

// Postgres error raised by the reservations_no_overlap constraint.
export const OVERLAP = "23P01";
