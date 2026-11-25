# PMS — feature draft

**Status:** draft for discussion with the family · 2026-11-25

The property management system (`apps/pms`) is the back-office for running the villas day to day.
It covers Villa Los Olivos and Villa La Playa now, and is shaped so a small hotel can be added later
without a rewrite. It is not just a booking database: it also has to help the parents and their
staff with rooms, cleaning, people and guest check-in.

Backend choice: [ADR 0002](../adr/0002-pms-backend.md).

## Who uses it

| Role | Who | Uses it for | Device |
| --- | --- | --- | --- |
| Owner | Parents | Everything; today's overview, bookings, guests, money | Phone + laptop |
| Manager | Family / a future hotel manager | Same as owner, minus finance settings | Laptop |
| Staff | Cleaners, maintenance, gardener/pool | Their tasks, checklists, clocking in/out | Phone, in Spanish |
| Guest | Each booking's guests | Online check-in form, arrival info | Phone, EN/ES |

Interface in **Spanish and English** (Spanish first for staff), and it should work on a phone.
Installed on the home screen as an app (a PWA), so no app store is needed.

## Legal requirements that shape the design

These are not optional for a tourist rental in Andalucía, and they're the main reason a custom
system is worth it over a spreadsheet.

1. **Guest registration (SES.Hospedajes, Real Decreto 933/2021).** Every guest has to be reported to
   the Ministerio del Interior within 24 hours of check-in, together with booking data. Airbnb does
   **not** do this for the host. Records are kept for **3 years**. Guides disagree on the exact field
   list and the age threshold, so the form must follow the Ministry's official specification, not a blog.
   The data protection agency considers keeping a **copy of the ID** excessive: collect the data,
   don't store photos of passports.
   SES.Hospedajes accepts automatic submission through a web service (credentials ending in "WS"
   that are issued when the establishment is registered for it).
2. **Andalucía tourist registration.** Each villa's registration number (VFT/VUT/GR/…) must appear
   in listings. The national single registry (NRUA) was annulled by the Supreme Court in 2026, but the
   regional registration still applies. Store each property's numbers in the PMS and show them
   on the website.
3. **Working-time records for staff (registro de jornada).** Employers must record start and end times.
   A Royal Decree making the record **digital and tamper-evident** (corrections logged, kept 4 years)
   has been in progress since 2025; its final status needs checking in the BOE. Building the time clock
   digital from day one covers both.
4. **Personal data (GDPR).** Guest identity data, staff data. Store in the EU, restrict who can see ID data,
   delete it after the retention period, log who accessed or changed it.
5. **No tourist tax** in Andalucía as of 2026, but Málaga is pushing for one. Keep the pricing model able to
   add a per-night, per-person tax later.

## Feature modules

Each module is tagged with the phase it belongs to (see [Phases](#phases)).

### 1. Properties and rooms · MVP

- Properties (Villa Los Olivos, Villa La Playa; later, the hotel), each with its units.
  A villa is one bookable unit made of suites; a hotel has room types and rooms. Same model for both.
- Per unit: capacity, beds, suites/bathrooms, amenities, photos, house rules, Wi-Fi, door codes,
  registration numbers, Airbnb listing link and iCal URLs.
- Unit status: clean / dirty / inspected / out of order.

### 2. Calendar and reservations · MVP

- One calendar across both villas (and later, every room), by month and by timeline.
- Reservations from every source in one place: **Airbnb** (synced), **direct** (website, later),
  **phone / email / repeat guests** (entered by hand), and later Booking.com.
- **Blocks:** owner stays, maintenance, "hold for friends".
- **No double bookings**, enforced by the database itself rather than by careful clicking.
- **Airbnb sync via iCal**, both directions. The PMS imports each listing's Airbnb calendar every few
  minutes and publishes its own calendar for Airbnb to import back. Airbnb refreshes imported calendars
  roughly every 3 hours, so a direct booking can't instantly block Airbnb. This is acceptable at
  two villas. Airbnb's real API is only for approved software partners, and new access is very limited.
- iCal only carries dates, not guest names or prices. Airbnb reservations get completed in the PMS
  (guest name, number of guests, payout). Later option: read Airbnb's confirmation emails automatically.
- Reservation details: guests (adults/children), arrival/departure times, status, source, price breakdown,
  notes, linked tasks and messages.

### 3. Guests · MVP

- Guest profiles shared across bookings: contact details, language, nationality, notes, preferences
  ("allergic to feathers", "returning family, likes the pool heated").
- Repeat-guest detection, and history of their stays.
- Marketing consent tracked separately; contact details are not reused for mailings without it.

### 4. Online check-in and guest registration · MVP

This replaces the old WordPress `/checking` form, and the Airbnb messages that currently cover it.

- Each reservation gets a private **check-in link**, sent before arrival (EN/ES).
- The guest fills in every traveller's registration data (SES.Hospedajes fields), arrival time,
  accepts the house rules, and signs on screen.
- The PMS checks completeness and shows a status per booking: *not started / partial / complete / sent*.
- **Submission to SES.Hospedajes:**
  - First version: the PMS produces the file or form data so it can be uploaded in seconds.
  - Later: automatic submission through the Ministry's web service, with error alerts and resend.
- Retention: registration data deleted automatically 3 years after departure. Only owners and managers
  can see it.
- After check-in, the same link becomes the **guest page**: address and map, door code (shown on
  arrival day only), Wi-Fi, house manual, local tips from the website's Things to do and blog, and contact.

### 5. Housekeeping and maintenance · MVP (cleaning) / Phase B (maintenance)

- **Automatic cleaning tasks** created from departures: checkout → clean → inspect, with the time
  window until the next arrival and the next group's size (so the right number of beds get made).
- Task board for today and the week; each staff member sees only their own tasks on their phone.
- **Checklists** per villa (beds, bathrooms, pool, terrace, restock), with photos when something's wrong.
- Linen and laundry counts; consumables to restock (toiletries, coffee, cleaning products).
- **Maintenance tickets:** anyone can report an issue with a photo ("pool pump noisy"); the ticket gets
  assigned and tracked. A broken item can block a room.
- **Recurring jobs:** pool, garden, AC service, boiler, extinguishers, pest control. Each has its own interval.

### 6. Staff · Phase B

- Staff directory: role, phone, languages, contract type (employee / freelancer / cleaning company).
- Schedules and shifts, built around the cleaning tasks; availability and holidays.
- **Time clock** on the phone (clock in/out per villa) → compliant working-time register, monthly totals,
  export for the gestor's payroll. The PMS doesn't do payroll itself.
- Hours per person per month; cost of cleaning per stay.

### 7. Guest messages · MVP (templates) / Phase B (automation)

- Message templates in EN/ES with placeholders (name, dates, door code, check-in link).
- Scheduled messages for direct-booking guests by email (later WhatsApp): confirmation, check-in link,
  arrival instructions, checkout reminder, review request.
- Airbnb guests: Airbnb's own scheduled messages stay in use (the user already set them up),
  because writing into Airbnb's inbox needs the partner API. The PMS gives the text and the check-in link
  to paste in.

### 8. Money · Phase B

- Income per reservation: Airbnb payout (imported from Airbnb's earnings CSV), direct payments,
  extras (late checkout, private chef, airport transfer).
- Expenses per villa: cleaning, laundry, utilities, repairs, supplies, commissions.
- Monthly and yearly results per villa; export for the accountant (gestor).
- Invoices for direct bookings. Spain's new invoicing-software rules (VeriFactu) and the right VAT
  treatment must be checked with the gestor before the PMS issues invoices itself.

### 9. Rates and direct booking · Phase C

- Seasonal rates, weekend rates, minimum stay, extra-guest fee, cleaning fee, discounts and promo codes.
- Availability and price API for the website (`apps/web`), with a "Book direct" flow.
- Payments with Stripe: deposit at booking, balance before arrival, refundable damage-deposit hold.
- Cancellation policies and automatic refunds.
- Tourist tax line, ready if Andalucía introduces one.

### 10. Today screen and reports · MVP (today) / Phase B (reports)

- **Today:** arrivals and departures, who has checked in online, cleaning status, open issues,
  messages to send. This is the parents' home screen.
- Occupancy, average nightly rate, revenue per available night, revenue by channel (Airbnb vs direct),
  booking lead time, nationality mix (from registrations).

### 11. Hotel-ready · Phase D

Not built now, but the data model leaves room for it:
- Room types vs physical rooms, rate plans, room assignment.
- Front-desk screen, guest folio (charges during the stay), group bookings.
- More channels through a certified channel manager, if Airbnb/Booking volume justifies it.

### Across all modules

- Roles and permissions (owner / manager / staff), and a record of who changed what.
- Works on a phone; installed on the home screen; Spanish and English.
- Nightly backups kept outside the main provider (see ADR 0002).

## Phases

| Phase | Goal | Modules |
| --- | --- | --- |
| **MVP** | Replace spreadsheets and the WordPress check-in form | 1, 2, 3, 4, cleaning part of 5, message templates, Today screen |
| **B** | Run the team and see the numbers | maintenance, 6 staff + time clock, 7 automation, 8 money, reports |
| **C** | Direct bookings on the website | 9, website integration, Stripe |
| **D** | Add the hotel | 11 |

## Build vs buy — honest note

Off-the-shelf tools (Smoobu, Lodgify, Hostaway and others) already do calendar sync, messaging and,
for many, SES.Hospedajes submission, for roughly €30–100 a month for two listings. The reasons to
build our own anyway:
- **Direct bookings on our own site**, with no commission.
- **Staff and time-clock** features, which these tools mostly lack.
- **The hotel later**, which most vacation-rental tools don't handle well.
- **Data and costs** that stay in our hands.

If the MVP drags on, a paid tool for check-in and SES.Hospedajes (Chekin, for example) can cover the
legal part in the meantime.

## Questions for the parents

1. How is guest registration done today? Manually on SES.Hospedajes, or through a service?
   Do they have web-service credentials?
2. Who cleans each villa? Employees, freelancers or a company? How many people, and how are they paid?
3. What's tracked today, and where (Excel, paper, WhatsApp)? Which of it should we import?
4. Each villa's registration numbers (Andalucía, and any municipal licence).
5. Extras they sell, or want to sell: private chef, transfers, late checkout, pool heating…
6. Who else should have access (siblings, a manager)?
7. Anything they hate about Airbnb's host tools that this should fix?

## Sources

- SES.Hospedajes obligations: [CasaHero guide (2026)](https://www.casa-hero.com/guest-registration-spain),
  [HolidayHero guide](https://www.holidayhero.com/blog/the-complete-guide-to-ses-hospedajes-guest-and-reservation-registration-requirements-in-spain),
  [PropertyHost guide](https://propertyhost.es/en/compliance/ses-hospedajes),
  [Travelnest](https://travelnest.com/news-and-insights/your-guide-to-spain-s-vacation-rental-registration-rules)
- SES.Hospedajes web-service credentials: [net2rent guide](https://net2rent.com/guia-completa-ses-hospedajes/),
  [Lodgify help](https://help.lodgify.com/hc/en-us/articles/20385793072796)
- NRUA annulment / Andalucía registration: [apartop](https://apartop.com/blog/registro-unico-nrua),
  [winahost](https://winahost.com/blog/nrua-registro-unico-alquiler-turistico),
  [Real Estate Andalusia](https://realestateandalusia.es/the-guide-to-tourist-rental-licences-in-andalusia/)
- Working-time register: [DLA Piper](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/Spain-moves-to-standardise-digital-working-time-records),
  [Cuatrecasas](https://www.cuatrecasas.com/es/latam/laboral/art/registro-jornada-laboral-espana-rd)
- Tourist tax status: [tuvisadoonline (May 2026)](https://www.tuvisadoonline.com/blog/tasa-turistica-espana-2026-precios-ciudades),
  [esdiario](https://www.esdiario.com/andalucia/251222/175396/malaga-cierra-ano-politico-pidiendo-via-libre-implantar-tasa-turistica.html)
- Airbnb API vs iCal: [Jetstream](https://jetstreamtech.io/blog/airbnb-calendar-sync-hotels),
  [Hostex](https://hostex.io/blog/how-to-get-the-airbnb-api/)
- Off-the-shelf PMS comparisons: [eviivo](https://eviivo.com/trade-secrets/best-vacation-rental-property-management-software/),
  [Stayfi](https://stayfi.com/vrm-insider/2026/06/24/lodgify-vs-smoobu/)

Most of these are secondary or vendor sources. Check the legal points against the BOE, the BOJA and
the Ministerio del Interior's SES.Hospedajes specification before building the check-in module.
