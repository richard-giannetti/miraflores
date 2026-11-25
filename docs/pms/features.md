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
6. **VAT on stays from 1 December 2026.** Sources report that Real Decreto-ley 29/2026 puts tourist
   rentals of 30 nights or less at **10% VAT**. Until now they were exempt unless hotel services were provided.
   Airbnb's commission invoices change too. This makes invoicing a real need straight away; confirm the
   details with the gestor and the BOE.
7. **VeriFactu (invoicing software rules, RD 1007/2023).** Every invoice issued with software must be
   recorded tamper-proof: chained records, a QR code, and optionally sent to the tax agency in real time.
   The villas are owned by a company (Miraflores Costa Tropical SL). Under the law as published, companies
   must comply from **1 January 2027**. A postponement to 2028 has been announced but wasn't in the BOE
   as of October 2026. See [module 9](#9-invoicing-facturación--wave-2).

## Feature modules

Each module is tagged with the wave it belongs to (see [Waves](#waves)).

### 1. Properties and rooms · Wave 1

- Properties (Villa Los Olivos, Villa La Playa; later, the hotel), each with its units.
  Modelled like a hotel from day one: property → room types → rooms. A villa is one bookable unit
  made of suites, and could later be let room by room. The calendar works at room level.
- Per unit: capacity, beds, suites/bathrooms, amenities, photos, house rules, Wi-Fi, door codes,
  registration numbers, Airbnb listing link and iCal URLs.
- Unit status: clean / dirty / inspected / out of order.

### 2. Calendar and reservations · Wave 1 (Airbnb sync: Wave 3)

**The calendar is the centre of the app.** Everything else (cleaning, check-in, invoices, staff,
money) hangs off a reservation on it, so it's built first.

- One planning view across both villas and, later, every room: a timeline (rooms down the side,
  days across), plus month and week views.
- Create a reservation by selecting dates on a row; move it by dragging, and extend it by dragging an edge.
  Colours show status (option, confirmed, checked in, checked out, cancelled) and source.
- Reservations from every source in one place. In Wave 1 all of them are entered in the PMS: phone,
  email, repeat guests, and **Airbnb bookings typed in by hand**. Wave 3 adds automatic Airbnb sync,
  the website's direct bookings and, later, Booking.com.
- **Blocks:** owner stays, maintenance, "hold for friends".
- **No double bookings**, enforced by the database itself rather than by careful clicking.
- **Airbnb sync via iCal** (Wave 3), both directions. The PMS imports each listing's Airbnb calendar every few
  minutes and publishes its own calendar for Airbnb to import back. Airbnb refreshes imported calendars
  roughly every 3 hours, so a direct booking can't instantly block Airbnb. This is acceptable at
  two villas. Airbnb's real API is only for approved software partners, and new access is very limited.
- iCal only carries dates, not guest names or prices. Airbnb reservations get completed in the PMS
  (guest name, number of guests, payout). Later option: read Airbnb's confirmation emails automatically.
- Reservation details: guests (adults/children), arrival/departure times, status, source, price breakdown,
  notes, linked tasks and messages.

### 3. Guests · Wave 1

- Guest profiles shared across bookings: contact details, language, nationality, notes, preferences
  ("allergic to feathers", "returning family, likes the pool heated").
- Repeat-guest detection, and history of their stays.
- Marketing consent tracked separately; contact details are not reused for mailings without it.

### 4. Online check-in and guest registration · Wave 2

This replaces the old WordPress `/checking` form, and the Airbnb messages that currently cover it.
It's the part of Hotelgest the family likes most ("recepción autónoma"), so it's the guest-facing
model to follow: no app to download, one link per reservation, on the phone.

- Each reservation gets a private **check-in link**, sent before arrival (EN/ES). It can go by email,
  by WhatsApp, as a QR code, or pasted into the Airbnb chat.
- **ID scan:** the guest photographs their DNI, NIE or passport and the form fills itself in from the
  machine-readable zone. The guest confirms the data. The image is used for reading and then discarded,
  not stored (see legal point 1).
- The guest fills in every traveller's registration data (SES.Hospedajes fields), arrival time,
  accepts the house rules, and signs on screen.
- **Invoice details:** a guest who needs a full invoice (a company, or a tax ID) enters the details here
  and receives the invoice by email (see module 9).
- **Payments** (once direct bookings exist): balance, extras and a damage-deposit pre-authorisation
  that is released automatically.
- **Door code shown only when everything's ready:** paid, checked in online, villa cleaned and inspected,
  and arrival time reached. Smart-lock integration can come later.
- The PMS checks completeness and shows a status per booking: *not started / partial / complete / sent*.
- **Submission to SES.Hospedajes:**
  - First version: the PMS produces the file or form data so it can be uploaded in seconds.
  - Later: automatic submission through the Ministry's web service, with error alerts and resend.
- Retention: registration data deleted automatically 3 years after departure. Only owners and managers
  can see it.
- After check-in, the same link becomes the **guest page**: address and map, door code (shown on
  arrival day only), Wi-Fi, house manual, local tips from the website's Things to do and blog, and contact.

### 5. Housekeeping and maintenance · Wave 1 (cleaning) / Wave 2 (maintenance)

- **Automatic cleaning tasks** created from departures: checkout → clean → inspect, with the time
  window until the next arrival and the next group's size (so the right number of beds get made).
- Task board for today and the week; each staff member sees only their own tasks on their phone.
- **Checklists** per villa (beds, bathrooms, pool, terrace, restock), with photos when something's wrong.
- Linen and laundry counts; consumables to restock (toiletries, coffee, cleaning products).
- **Maintenance tickets:** anyone can report an issue with a photo ("pool pump noisy"); the ticket gets
  assigned and tracked. A broken item can block a room.
- **Recurring jobs:** pool, garden, AC service, boiler, extinguishers, pest control. Each has its own interval.

### 6. Staff · Wave 2

- Staff directory: role, phone, languages, contract type (employee / freelancer / cleaning company).
- Schedules and shifts, built around the cleaning tasks; availability and holidays.
- **Time clock** on the phone (clock in/out per villa) → compliant working-time register, monthly totals,
  export for the gestor's payroll. The PMS doesn't do payroll itself.
- Hours per person per month; cost of cleaning per stay.

### 7. Guest messages · Wave 2

- Message templates in EN/ES with placeholders (name, dates, door code, check-in link).
- Scheduled messages for direct-booking guests by email (later WhatsApp): confirmation, check-in link,
  arrival instructions, checkout reminder, review request.
- Airbnb guests: Airbnb's own scheduled messages stay in use (the user already set them up),
  because writing into Airbnb's inbox needs the partner API. The PMS gives the text and the check-in link
  to paste in.

### 8. Money · Wave 2

- Income per reservation: Airbnb payout (imported from Airbnb's earnings CSV), direct payments,
  extras (late checkout, private chef, airport transfer).
- Expenses per villa: cleaning, laundry, utilities, repairs, supplies, commissions.
- Monthly and yearly results per villa; export for the accountant (gestor).
- Airbnb's commission invoices recorded as expenses, with their VAT treatment (see legal point 6).

### 9. Invoicing (facturación) · Wave 2

The father's top concern. 10% VAT applies from December 2026 and VeriFactu from 2027, so it comes
right after the calendar, at the start of Wave 2.

- **An invoice per stay**, generated from the reservation: nights, cleaning fee, extras, VAT at the
  correct rate, totals. This covers Airbnb stays as well as direct ones, if the gestor confirms the
  company has to invoice the guest for Airbnb bookings.
- **Simplified invoices** by default. A **full invoice** when the guest gives a company name and tax
  ID, either at online check-in or when added by the family.
- **Corrective invoices** (rectificativas) and credit notes linked to the original, never edits or
  deletions. **Proformas** and deposit invoices for direct bookings. Separate numbering series per type,
  and per property if the gestor wants that.
- **VeriFactu compliance:** each invoice recorded, chained and QR-coded at the moment it's issued;
  optional real-time submission to the tax agency.
- **Payments matched to invoices:** Airbnb payouts, card and Bizum, bank transfers, and what's still owed.
- **Exports for the gestor:** an invoice register (CSV/Excel) and a ZIP of PDFs per quarter, VAT summaries
  that feed Modelo 303, yearly totals per client for Modelo 347. Optionally an export for their software
  (A3, Sage, Holded — Hotelgest supports these).
- Invoices in Spanish, with an English version for foreign guests.

**Build vs integrate:** whoever produces invoicing software must certify it meets VeriFactu
(a *declaración responsable*). Building our own signing and record chain is a real legal and technical
burden for one family company. The safer route: the PMS prepares the invoice data and sends it to a
certified VeriFactu invoicing service or API (several exist, some aimed at developers), which signs,
numbers and reports it. The PMS stores the resulting PDF and QR. The provider gets chosen with the gestor.

### 10. Rates and direct booking · Wave 3

- Seasonal rates, weekend rates, minimum stay, extra-guest fee, cleaning fee, discounts and promo codes.
- Availability and price API for the website (`apps/web`), with a "Book direct" flow.
- Payments with Stripe: deposit at booking, balance before arrival, refundable damage-deposit hold.
- Cancellation policies and automatic refunds.
- Tourist tax line, ready if Andalucía introduces one.

### 11. Today screen and reports · Wave 1 (today) / Wave 2 (reports)

- **Today:** arrivals and departures, who has checked in online, cleaning status, open issues,
  messages to send. This is the parents' home screen.
- Occupancy, average nightly rate, revenue per available night, revenue by channel (Airbnb vs direct),
  booking lead time, nationality mix (from registrations).

### 12. Hotel extras · Wave 4

Not built now, but the data model leaves room for it:
- Room types vs physical rooms, rate plans, room assignment.
- Front-desk screen, guest folio (charges during the stay), group bookings.
- More channels through a certified channel manager, if Airbnb/Booking volume justifies it.

### Across all modules

- Roles and permissions (owner / manager / staff), and a record of who changed what.
- Works on a phone; installed on the home screen; Spanish and English.
- Nightly backups kept outside the main provider (see ADR 0002).

## Waves

Order agreed with the father (2026-11-25):
- **Start with internal management**, with the calendar at the centre.
- **Connections to the platforms** (Airbnb sync, Booking, website bookings) come afterwards.

| Wave | Goal | Modules |
| --- | --- | --- |
| **1** | **The calendar and day-to-day running** | 1 properties and rooms, 2 calendar and reservations (entered in the PMS), 3 guests, cleaning part of 5, Today screen (11) |
| **2** | **The rest of internal management** | 9 invoicing first, 4 online check-in and SES.Hospedajes, maintenance (5), 6 staff and time clock, 7 messages, 8 money, reports (11) |
| **3** | **Connect to the outside** | Airbnb sync (2), 10 rates and direct booking on the website with Stripe, Booking.com later |
| **4** | **Hotel extras** | 12 front desk, guest bill during the stay, groups |

- **Invoicing has a deadline:** 10% VAT applies from 1 December 2026, and VeriFactu from 1 January 2027
  unless the postponement is published. Until the PMS issues invoices, they come from a certified tool;
  the gestor may already have one.
- **Airbnb bookings until Wave 3:** they're typed into the PMS calendar by hand. That's a few minutes per
  booking at two villas, and the price of getting the internal side right first.

## Build vs buy — honest note

Off-the-shelf tools (Smoobu, Lodgify, Hostaway and others) already do calendar sync, messaging and,
for many, SES.Hospedajes submission, for roughly €30–100 a month for two listings. The reasons to
build our own anyway:
- **Direct bookings on our own site**, with no commission.
- **Staff and time-clock** features, which these tools mostly lack.
- **The hotel later**, which most vacation-rental tools don't handle well.
- **Data and costs** that stay in our hands.

If Wave 2 drags on, a paid tool for check-in and SES.Hospedajes (Chekin, for example) can cover the
legal part in the meantime.

**Decision: we build our own.** The family doesn't want to use an off-the-shelf PMS.

**Hotelgest** is the reference to take inspiration from: a Spanish PMS for hotels and vacation rentals
that the father likes. Ideas taken from it so far:
- The guest-facing online check-in: link, ID scan, signature, invoice details, door code.
- VeriFactu invoicing with exports for the accountant.
- Housekeeping checklists and the "Today" planning view.

## Questions for the parents

1. How is guest registration done today? Manually on SES.Hospedajes, or through a service?
   Do they have web-service credentials?
2. Who cleans each villa? Employees, freelancers or a company? How many people, and how are they paid?
3. What's tracked today, and where (Excel, paper, WhatsApp)? Which of it should we import?
4. Each villa's registration numbers (Andalucía, and any municipal licence).
5. Extras they sell, or want to sell: private chef, transfers, late checkout, pool heating…
6. Who else should have access (siblings, a manager)?
7. Anything they hate about Airbnb's host tools that this should fix?
8. Invoicing today: who issues invoices, with what tool, and does the gestor want a particular export
   or software? Has the gestor said how the 10% VAT from December applies to Airbnb stays?
9. Beyond online check-in and invoicing, which Hotelgest screens or features does the father like most?

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
- Hotelgest: [home](https://www.hotelgest.com/), [online check-in](https://www.hotelgest.com/recepcion-autonoma),
  [accounting and invoicing](https://www.hotelgest.com/contabilidad), [SES.Hospedajes](https://www.hotelgest.com/ses-hospedajes),
  [plans](https://www.hotelgest.com/planes)
- VeriFactu dates: [Infoautónomos](https://www.infoautonomos.com/blog/verifactu-cuando-es-obligatorio-a-quien-afecta/),
  [Webpsilon (postponement)](https://www.webpsilon.com/blog/verifactu-que-es-cuando-entra-en-vigor-y-a-quien-afecta/),
  [B2Brouter](https://www.b2brouter.net/es/sistema-verifactu/)
- 10% VAT on tourist rentals: [net2rent](https://net2rent.com/subida-iva-pisos-turisticos/),
  [winahost](https://winahost.com/blog/iva-pisos-turisticos), [CasitaTax (commissions)](https://casitatax.com/es/guides/iva-airbnb-booking/)
- Off-the-shelf PMS comparisons: [eviivo](https://eviivo.com/trade-secrets/best-vacation-rental-property-management-software/),
  [Stayfi](https://stayfi.com/vrm-insider/2026/06/24/lodgify-vs-smoobu/)

Most of these are secondary or vendor sources. Check the legal points against the BOE, the BOJA and
the Ministerio del Interior's SES.Hospedajes specification before building the check-in module.
