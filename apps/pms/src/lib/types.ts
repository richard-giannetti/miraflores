// Row shapes of the tables in supabase/migrations. Keep in step with the schema.

export type Role = "owner" | "manager" | "staff";
export type ReservationKind = "booking" | "block";
export type ReservationStatus = "option" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type ReservationSource = "direct" | "airbnb" | "booking" | "phone" | "email" | "other";

export const statuses: ReservationStatus[] = ["option", "confirmed", "checked_in", "checked_out", "cancelled"];
export const sources: ReservationSource[] = ["airbnb", "direct", "phone", "email", "booking", "other"];

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  language: string;
}

export interface Property {
  id: string;
  name: string;
  slug: string;
  locality: string;
  color: string;
  sort: number;
}

export interface Unit {
  id: string;
  property_id: string;
  name: string;
  capacity: number;
  bedrooms: number | null;
  sort: number;
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string;
}

export interface Reservation {
  id: string;
  unit_id: string;
  guest_id: string | null;
  kind: ReservationKind;
  status: ReservationStatus;
  source: ReservationSource;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD, the departure day (not a night)
  adults: number;
  children: number;
  total_amount: number | null;
  title: string;
  notes: string;
  updated_at: string;
  guest?: Guest | null;
}
