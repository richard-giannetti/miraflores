// Interface text. Spanish for staff, French for the owners, English for everyone else.

export type Lang = "es" | "fr" | "en";
export const langs: Lang[] = ["es", "fr", "en"];
export const locale: Record<Lang, string> = { es: "es-ES", fr: "fr-FR", en: "en-GB" };

const dict = {
  appName: { es: "Miraflores · Gestión", fr: "Miraflores · Gestion", en: "Miraflores · Management" },
  signIn: { es: "Entrar", fr: "Se connecter", en: "Sign in" },
  signOut: { es: "Salir", fr: "Se déconnecter", en: "Sign out" },
  email: { es: "Email", fr: "E-mail", en: "Email" },
  password: { es: "Contraseña", fr: "Mot de passe", en: "Password" },
  signInFailed: { es: "Email o contraseña incorrectos.", fr: "E-mail ou mot de passe incorrect.", en: "Wrong email or password." },
  noAccess: {
    es: "Tu cuenta aún no tiene acceso. Pide a un propietario que te lo active.",
    fr: "Votre compte n'a pas encore accès. Demandez à un propriétaire de l'activer.",
    en: "Your account doesn't have access yet. Ask an owner to enable it.",
  },
  today: { es: "Hoy", fr: "Aujourd'hui", en: "Today" },
  twoWeeks: { es: "2 semanas", fr: "2 semaines", en: "2 weeks" },
  month: { es: "Mes", fr: "Mois", en: "Month" },
  previous: { es: "Anterior", fr: "Précédent", en: "Previous" },
  next: { es: "Siguiente", fr: "Suivant", en: "Next" },
  newReservation: { es: "Nueva reserva", fr: "Nouvelle réservation", en: "New reservation" },
  editReservation: { es: "Reserva", fr: "Réservation", en: "Reservation" },
  booking: { es: "Reserva", fr: "Réservation", en: "Booking" },
  block: { es: "Bloqueo", fr: "Blocage", en: "Block" },
  blockReason: { es: "Motivo (propietarios, mantenimiento…)", fr: "Motif (propriétaires, entretien…)", en: "Reason (owners, maintenance…)" },
  villa: { es: "Villa", fr: "Villa", en: "Villa" },
  arrival: { es: "Llegada", fr: "Arrivée", en: "Arrival" },
  departure: { es: "Salida", fr: "Départ", en: "Departure" },
  nights: { es: "noches", fr: "nuits", en: "nights" },
  firstName: { es: "Nombre", fr: "Prénom", en: "First name" },
  lastName: { es: "Apellidos", fr: "Nom", en: "Last name" },
  phone: { es: "Teléfono", fr: "Téléphone", en: "Phone" },
  adults: { es: "Adultos", fr: "Adultes", en: "Adults" },
  children: { es: "Niños", fr: "Enfants", en: "Children" },
  status: { es: "Estado", fr: "Statut", en: "Status" },
  source: { es: "Origen", fr: "Origine", en: "Source" },
  amount: { es: "Importe total (€)", fr: "Montant total (€)", en: "Total amount (€)" },
  notes: { es: "Notas", fr: "Notes", en: "Notes" },
  save: { es: "Guardar", fr: "Enregistrer", en: "Save" },
  cancel: { es: "Cancelar", fr: "Annuler", en: "Cancel" },
  delete: { es: "Eliminar", fr: "Supprimer", en: "Delete" },
  confirmDelete: { es: "¿Eliminar esta reserva?", fr: "Supprimer cette réservation ?", en: "Delete this reservation?" },
  overlap: {
    es: "Esas fechas ya están ocupadas en esta villa.",
    fr: "Ces dates sont déjà occupées dans cette villa.",
    en: "Those dates are already taken for this villa.",
  },
  badDates: { es: "La salida debe ser después de la llegada.", fr: "Le départ doit être après l'arrivée.", en: "Departure must be after arrival." },
  saveFailed: { es: "No se pudo guardar:", fr: "Impossible d'enregistrer :", en: "Couldn't save:" },
  offline: {
    es: "Sin conexión: mostrando los últimos datos guardados. Los cambios esperan a la conexión.",
    fr: "Hors ligne : affichage des dernières données enregistrées. Les modifications attendent la connexion.",
    en: "Offline: showing the last saved data. Changes wait for the connection.",
  },
  readOnly: { es: "Solo lectura", fr: "Lecture seule", en: "Read only" },
  guests: { es: "personas", fr: "personnes", en: "guests" },
  untitled: { es: "Sin nombre", fr: "Sans nom", en: "No name" },
  dragHint: {
    es: "Arrastra sobre los días para crear una reserva. Arrastra una reserva para moverla, o su borde para cambiar la salida.",
    fr: "Glissez sur les jours pour créer une réservation. Glissez une réservation pour la déplacer, ou son bord pour changer le départ.",
    en: "Drag across days to create a reservation. Drag a reservation to move it, or its edge to change departure.",
  },
  status_option: { es: "Opción", fr: "Option", en: "Option" },
  status_confirmed: { es: "Confirmada", fr: "Confirmée", en: "Confirmed" },
  status_checked_in: { es: "En casa", fr: "Arrivés", en: "Checked in" },
  status_checked_out: { es: "Salida hecha", fr: "Partis", en: "Checked out" },
  status_cancelled: { es: "Cancelada", fr: "Annulée", en: "Cancelled" },
  source_airbnb: { es: "Airbnb", fr: "Airbnb", en: "Airbnb" },
  source_direct: { es: "Directa", fr: "Directe", en: "Direct" },
  source_phone: { es: "Teléfono", fr: "Téléphone", en: "Phone" },
  source_email: { es: "Email", fr: "E-mail", en: "Email" },
  source_booking: { es: "Booking.com", fr: "Booking.com", en: "Booking.com" },
  source_other: { es: "Otro", fr: "Autre", en: "Other" },
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof dict;
export const t = (lang: Lang, key: Key) => dict[key][lang];

export const initialLang = (): Lang => {
  try {
    const saved = localStorage.getItem("lang");
    if (saved && (langs as string[]).includes(saved)) return saved as Lang;
  } catch {}
  const nav = navigator.language.slice(0, 2);
  return (langs as string[]).includes(nav) ? (nav as Lang) : "es";
};
