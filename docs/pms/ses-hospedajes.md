# SES.Hospedajes: reporting guests to the Interior Ministry

Real Decreto 933/2021 (in force since 2 December 2024): every stay is reported to the Ministry's SES.Hospedajes
system. Guest reports ("parte de viajeros") are due within 24 hours of arrival; data is kept 3 years.

## Status (2026-11-27)

- **Not registered yet.** The family (or the gestor, with the company's certificate) registers the landlord and both
  villas at <https://hospedajes.ses.mir.es>, then turns on *sending by web service* ("Servicio de comunicación").
  SES then emails the landlord code, each villa's establishment code and a separate web-service user
  (usually the tax ID + "WS") and password.
- **Done in the PMS:** online check-in collects everything SES needs (see the mapping below), with an ID scan;
  bookings record how they were paid; the `ses-send` Edge Function reaches both SES servers.
- **To build once access exists:** sending (queue, XML, SOAP call, results), tested on the test server first.

## The web service

From the Ministry's package *MIR-HOSPE-DSI-WS-Servicio de Hospedajes - Comunicaciones v3.1.3* (17 Feb 2025; a copy
with the XSDs and WSDL is in [anclora-guesthub](https://github.com/ToniIAPro73/anclora-guesthub/tree/main/schemas/ses-hospedajes/v3.1.3)).

- SOAP, HTTP Basic authentication with the web-service user and password.
  - Test: `https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion`
  - Production: `https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion`
- `comunicacionRequest` → `peticion`:
  - `cabecera`: `codigoArrendador`, `aplicacion` (our name), `tipoOperacion` (A add, C query, B cancel),
    `tipoComunicacion` (PV guest report, RH accommodation booking).
  - `solicitud`: the XML (altaParteHospedaje / altaReservaHospedaje), **zipped and Base64-encoded**.
- The answer gives a batch (`lote`); `consultaLote` returns, per report, its `codigoComunicacion` or an error.
- **TLS:** the servers don't send FNMT's intermediate certificate ("AC Componentes Informáticos"), so a normal
  client refuses the connection. `supabase/functions/ses-send/fnmt.ts` carries it (valid until June 2028) and
  `Deno.createHttpClient({ caCerts })` trusts it for SES calls only. Checked: both servers answer 401 (reachable).

## Guest report (PV) and where each field comes from

| SES | Required | PMS |
| --- | --- | --- |
| `codigoEstablecimiento` | yes | per villa (setting, once registered) |
| contrato `referencia`, `fechaContrato` | yes | reservation id or Airbnb code; `created_at` |
| `fechaEntrada`, `fechaSalida` (date-time) | yes | check-in/out dates + the property's times |
| `numPersonas`, `numHabitaciones`, `internet` | yes / no / no | adults + children; unit bedrooms; true |
| `pago/tipoPago` | yes | `reservations.payment_method`; empty + Airbnb → `PLATF` |
| persona `rol` | yes | always `VI` |
| `nombre`, `apellido1`, `apellido2` | yes; apellido2 if NIF | first_name, last_name_1, last_name_2 |
| `tipoDocumento`, `numeroDocumento` | adults | doc_type → DNI `NIF`, NIE `NIE`, PASSPORT `PAS`, ID_CARD/OTHER `OTRO` |
| `soporteDocumento` | NIF/NIE | doc_support_number |
| `fechaNacimiento` | yes | birth_date |
| `nacionalidad` (ISO alpha-3) | no | nationality |
| `sexo` | no | sex → M `H`, F `M`, X `O` |
| `direccion`: address, `codigoPostal`, `pais` | yes | residence_*; minors take traveller 1's |
| `codigoMunicipio` (INE, 5 digits) | if Spain | residence_municipality_code (from `public/municipios.json`, INE 2026) |
| `nombreMunicipio` | if not Spain | residence_city |
| `telefono` / `correo` | one of them | own, else traveller 1's |
| `parentesco` | if minors | minor's `relationship` (child, grandchild, sibling, nephew_niece, ward, other) |

Code lists (`TIPO_DOCUMENTO`, `SEXO`, `TIPO_PAGO`, `TIPO_PARENTESCO`) come from the service's `catalogo`
operation. Payment, document and sex codes agree across open-source clients; the relationship codes differ between
sources (for example `PM` parent, `HJ` child, `AB` grandparent, `HR` sibling, `TU` guardian, `OT` other), so read
the catalogue with the real credentials before mapping, and check which person carries `parentesco` (the guide says
an adult must have their relationship to each minor).

To confirm with access: whether booking reports (RH) apply to these villas, and whether the test server needs its
own credentials.
