import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { load, save } from "./cache";
import type { Profile, Property, Unit } from "./types";

// Villas, their units and the team: small lists every screen needs, cached for offline use.
export function useVillas() {
  const [properties, setProperties] = useState<Property[]>(() => load("properties") ?? []);
  const [units, setUnits] = useState<Unit[]>(() => load("units") ?? []);
  const [team, setTeam] = useState<Profile[]>(() => load("team") ?? []);
  // Bumped by Settings after a property or room changes, so every screen picks it up.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from("properties").select("id, name, slug, locality, color, sort").is("deleted_at", null).order("sort"),
      supabase.from("units").select("id, property_id, name, capacity, bedrooms, sort").is("deleted_at", null).eq("active", true).order("sort"),
      supabase.from("profiles").select("id, full_name, role, language").order("full_name"),
    ]).then(([p, u, t]) => {
      if (p.data) {
        save("properties", p.data);
        setProperties(p.data as Property[]);
      }
      if (u.data) {
        save("units", u.data);
        setUnits(u.data as Unit[]);
      }
      if (t.data) {
        save("team", t.data);
        setTeam(t.data as Profile[]);
      }
    });
  }, [version]);

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "";
  const propertyOf = (unitId: string) => properties.find((p) => p.id === units.find((u) => u.id === unitId)?.property_id);
  return { properties, units, team, unitName, propertyOf, reload: () => setVersion((v) => v + 1) };
}

export type Villas = ReturnType<typeof useVillas>;

export const RESERVATION_FIELDS =
  "id, unit_id, guest_id, kind, status, source, check_in, check_out, adults, children, total_amount, title, notes, updated_at, guest:guests(id, first_name, last_name, email, phone, notes)";
