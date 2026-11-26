-- Wave 2: guest messages. Templates in EN/ES/FR with placeholders, each with a moment (after booking,
-- N days before arrival…). The PMS lists the messages due and sends them through the family's own
-- WhatsApp or email in one tap (no email provider yet); each send is recorded so nothing goes twice.
-- Airbnb guests keep Airbnb's own scheduled messages, so templates skip them unless told otherwise.

create type public.message_timing as enum ('manual', 'after_booking', 'before_arrival', 'on_arrival', 'before_departure', 'after_departure');

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null default '{}',
  timing public.message_timing not null default 'manual',
  offset_days integer not null default 0 check (offset_days between 0 and 60),
  subject jsonb not null default '{}',
  body jsonb not null default '{}',
  include_airbnb boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.messages_sent (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id),
  template_id uuid not null references public.message_templates (id),
  channel text not null check (channel in ('whatsapp', 'email', 'copy', 'other')),
  sent_by uuid references auth.users (id) default auth.uid(),
  sent_at timestamptz not null default now()
);
create index messages_sent_reservation_id_idx on public.messages_sent (reservation_id);
create index messages_sent_template_id_idx on public.messages_sent (template_id);
create index messages_sent_sent_by_idx on public.messages_sent (sent_by);

create trigger message_templates_updated_at before update on public.message_templates for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;
alter table public.messages_sent enable row level security;
create policy "managers manage templates" on public.message_templates for all to authenticated
  using ((select private.my_role()) in ('owner', 'manager')) with check ((select private.my_role()) in ('owner', 'manager'));
create policy "managers read sends" on public.messages_sent for select to authenticated using ((select private.my_role()) in ('owner', 'manager'));
create policy "managers record sends" on public.messages_sent for insert to authenticated
  with check ((select private.my_role()) in ('owner', 'manager') and sent_by = (select auth.uid()));
create policy "managers undo sends" on public.messages_sent for delete to authenticated using ((select private.my_role()) in ('owner', 'manager'));

-- Starting templates; the family edits them in Settings.
insert into public.message_templates (name, timing, offset_days, subject, body, sort) values
(
  '{"es": "Confirmación", "en": "Booking confirmation", "fr": "Confirmation"}', 'after_booking', 0,
  '{"es": "Tu reserva en {villa}", "en": "Your booking at {villa}", "fr": "Votre réservation à {villa}"}',
  '{"es": "Hola {name}:\n\n¡Gracias por reservar {villa}! Os esperamos del {arrival} al {departure} ({nights} noches).\n\nUnos días antes os enviaremos el enlace para el check-in online y cómo llegar.\n\nUn saludo,\nMiraflores Costa Tropical",
    "en": "Hi {name},\n\nThank you for booking {villa}! We look forward to welcoming you from {arrival} to {departure} ({nights} nights).\n\nA few days before you arrive we will send the online check-in link and directions.\n\nKind regards,\nMiraflores Costa Tropical",
    "fr": "Bonjour {name},\n\nMerci d''avoir réservé {villa} ! Nous vous attendons du {arrival} au {departure} ({nights} nuits).\n\nQuelques jours avant votre arrivée, nous vous enverrons le lien d''enregistrement en ligne et l''itinéraire.\n\nBien cordialement,\nMiraflores Costa Tropical"}',
  1
),
(
  '{"es": "Check-in online", "en": "Online check-in", "fr": "Enregistrement en ligne"}', 'before_arrival', 7,
  '{"es": "Check-in online para {villa}", "en": "Online check-in for {villa}", "fr": "Enregistrement en ligne pour {villa}"}',
  '{"es": "Hola {name}:\n\nPara preparar vuestra llegada el {arrival}, rellenad el check-in online (5 minutos). La ley española nos pide los datos de todos los viajeros:\n{checkin_link}\n\n¡Hasta pronto!",
    "en": "Hi {name},\n\nTo prepare your arrival on {arrival}, please complete the online check-in (5 minutes). Spanish law requires the details of every traveller:\n{checkin_link}\n\nSee you soon!",
    "fr": "Bonjour {name},\n\nPour préparer votre arrivée le {arrival}, merci de remplir l''enregistrement en ligne (5 minutes). La loi espagnole exige les informations de chaque voyageur :\n{checkin_link}\n\nÀ bientôt !"}',
  2
),
(
  '{"es": "Llegada", "en": "Arrival details", "fr": "Arrivée"}', 'before_arrival', 1,
  '{"es": "Mañana llegáis a {villa}", "en": "See you tomorrow at {villa}", "fr": "À demain à {villa}"}',
  '{"es": "Hola {name}:\n\n¡Mañana os esperamos en {villa}! Avisadnos de vuestra hora de llegada aproximada. Toda la información de la casa (Wi-Fi, cómo llegar…) está en vuestro enlace de check-in:\n{checkin_link}\n\n¡Buen viaje!",
    "en": "Hi {name},\n\nWe look forward to seeing you tomorrow at {villa}! Please let us know your approximate arrival time. All the house information (Wi-Fi, directions…) is on your check-in page:\n{checkin_link}\n\nSafe travels!",
    "fr": "Bonjour {name},\n\nNous vous attendons demain à {villa} ! Pouvez-vous nous indiquer votre heure d''arrivée approximative ? Toutes les informations de la maison (Wi-Fi, accès…) sont sur votre page d''enregistrement :\n{checkin_link}\n\nBon voyage !"}',
  3
),
(
  '{"es": "Salida", "en": "Check-out reminder", "fr": "Départ"}', 'before_departure', 1,
  '{"es": "Vuestra salida de {villa}", "en": "Your check-out from {villa}", "fr": "Votre départ de {villa}"}',
  '{"es": "Hola {name}:\n\nEsperamos que estéis disfrutando. Os recordamos que mañana {departure} es el día de salida. Si necesitáis algo, decidnos.\n\n¡Gracias!",
    "en": "Hi {name},\n\nWe hope you are enjoying your stay. Just a reminder that tomorrow, {departure}, is check-out day. Let us know if you need anything.\n\nThank you!",
    "fr": "Bonjour {name},\n\nNous espérons que vous profitez de votre séjour. Petit rappel : demain, {departure}, est le jour du départ. N''hésitez pas si vous avez besoin de quoi que ce soit.\n\nMerci !"}',
  4
),
(
  '{"es": "Opinión", "en": "Review request", "fr": "Avis"}', 'after_departure', 2,
  '{"es": "Gracias por vuestra estancia", "en": "Thank you for staying with us", "fr": "Merci pour votre séjour"}',
  '{"es": "Hola {name}:\n\nGracias por alojaros en {villa}. Esperamos que lo hayáis pasado muy bien. Si os ha gustado, una opinión nos ayuda muchísimo.\n\n¡Esperamos volver a veros!",
    "en": "Hi {name},\n\nThank you for staying at {villa}. We hope you had a wonderful time. If you enjoyed it, a review would help us a lot.\n\nWe hope to see you again!",
    "fr": "Bonjour {name},\n\nMerci d''avoir séjourné à {villa}. Nous espérons que vous avez passé un excellent moment. Si cela vous a plu, un avis nous aiderait beaucoup.\n\nAu plaisir de vous revoir !"}',
  5
);
