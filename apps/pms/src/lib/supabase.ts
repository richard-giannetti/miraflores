import { createClient } from "@supabase/supabase-js";

// Public by design: the publishable key only allows what the row-level security policies allow.
const url = "https://lkbrydeqxnspsnpvimil.supabase.co";
const publishableKey = "sb_publishable_oAAH6Hy8Xg2AGtNJfJfXiA_cW_SeP2y";

export const supabase = createClient(url, publishableKey);

// Signing out ends the session on this device only: the family shares logins across phones and laptops, and the
// library's default would sign every one of them out.
export const signOut = () => supabase.auth.signOut({ scope: "local" });

// When a server function refuses us, the session may have ended elsewhere (an older "sign out everywhere", a
// password change) while this page still holds data. Then show the sign-in screen instead of a puzzling error.
export async function sessionEnded(): Promise<boolean> {
  const { error } = await supabase.auth.getUser();
  if (!error || (error.status !== 401 && error.status !== 403)) return false;
  await signOut();
  return true;
}

// Postgres error raised by the reservations_no_overlap constraint.
export const OVERLAP = "23P01";
