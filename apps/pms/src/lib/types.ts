// Row shapes of the tables in supabase/migrations. Keep in step with the schema.

export type Role = "owner" | "manager" | "staff";
export type ReservationKind = "booking" | "block";
export type ReservationStatus = "option" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type ReservationSource = "direct" | "airbnb" | "booking" | "phone" | "email" | "other";

export const statuses: ReservationStatus[] = ["option", "confirmed", "checked_in", "checked_out", "cancelled"];
// Channels offered when entering a booking: direct and Airbnb only (Booking.com is out for now).
export const sources: ReservationSource[] = ["airbnb", "direct", "phone", "email", "other"];

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  language: string;
  must_change_password?: boolean;
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

export interface GuestFull extends Guest {
  language: string | null;
  nationality: string | null;
  updated_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

export interface Task {
  id: string;
  unit_id: string;
  reservation_id: string | null;
  kind: "cleaning" | "inspection" | "maintenance" | "other";
  title: string;
  due_date: string;
  status: TaskStatus;
  assigned_to: string | null;
  checked: string[];
  notes: string;
  completed_at: string | null;
}

export interface ChecklistItem {
  id: string;
  property_id: string;
  label: string;
  sort: number;
}

// SES.Hospedajes's payment codes: cash, card, payment platform (Airbnb…), bank transfer, mobile, gift card,
// paid at the property, other.
export const paymentMethods = ["TRANS", "TARJT", "PLATF", "EFECT", "MOVIL", "DESTI", "TREG", "OTRO"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

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
  // How the stay was paid, in SES.Hospedajes's codes; null = work it out (Airbnb → PLATF).
  payment_method: PaymentMethod | null;
  title: string;
  notes: string;
  updated_at: string;
  guest?: Guest | null;
}

export type Department = "management" | "reception" | "housekeeping" | "maintenance" | "kitchen" | "restaurant" | "pool" | "spa";
export const departments: Department[] = ["management", "reception", "housekeeping", "maintenance", "kitchen", "restaurant", "pool", "spa"];
export type ContractKind = "employee" | "freelancer" | "company";
export const contracts: ContractKind[] = ["employee", "freelancer", "company"];

export interface StaffMember {
  id: string;
  user_id: string | null;
  full_name: string;
  department: Department;
  contract: ContractKind;
  phone: string | null;
  email: string | null;
  weekly_hours: number | null;
  notes: string;
  active: boolean;
}

export type ShiftKind = "work" | "off" | "holiday" | "sick";
export const shiftKinds: ShiftKind[] = ["work", "off", "holiday", "sick"];

export interface Shift {
  id: string;
  staff_id: string;
  property_id: string | null;
  day: string; // YYYY-MM-DD
  kind: ShiftKind;
  starts: string | null; // "HH:MM:SS", villas' local time
  ends: string | null;
  note: string;
}

export interface TimeEntry {
  id: string;
  staff_id: string;
  property_id: string | null;
  clock_in: string; // ISO instant
  clock_out: string | null;
  source: "app" | "manual";
  voided_at: string | null;
}

export type IssueStatus = "open" | "in_progress" | "waiting" | "done";
export const issueStatuses: IssueStatus[] = ["open", "in_progress", "waiting", "done"];
export type IssuePriority = "low" | "normal" | "urgent";
export const issuePriorities: IssuePriority[] = ["low", "normal", "urgent"];

export interface Issue {
  id: string;
  property_id: string;
  title: string;
  description: string;
  location: string;
  priority: IssuePriority;
  status: IssueStatus;
  photos: string[];
  assigned_to: string | null;
  due_date: string | null;
  recurring_job_id: string | null;
  cost: number | null;
  resolution: string;
  reported_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface RecurringJob {
  id: string;
  property_id: string;
  title: string;
  notes: string;
  every: number;
  unit: "week" | "month";
  next_due: string;
  assigned_to: string | null;
  active: boolean;
}
