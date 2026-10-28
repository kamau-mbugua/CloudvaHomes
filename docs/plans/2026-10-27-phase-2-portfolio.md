# Phase 2 — Portfolio (implementation plan)

**Date:** 2026-10-27
**Design:** `docs/specs/2026-10-27-hodi-platform-design.md` §2 (naming), §5.1 (tenancy fields), §5.3 (landlords), §5.5 (schema), §8 (personal data)
**Depends on:** phase 1 (done)
**Status:** DONE 2026-10-27 — see "Outcome" at the end
**Goal:** an organisation can record what it manages and who lives there. That means landlords (agencies only), properties, unit types, categories and features, units (one at a time or in bulk), tenants, and tenancies (move-in, notice, move-out). Staff limited to some properties see only those. Tenant and landlord ID numbers are encrypted at rest. Every change is audited.

## Decisions made while planning

| Topic | Decision | Why |
|---|---|---|
| Property-limited staff | `Membership.propertyIds` (phase 1; empty = all) is now enforced. The guard puts the list in the request context; portfolio services filter by it. A property outside the list behaves like a missing one (404) | Caretakers usually look after one compound |
| What limited staff see | Properties and units in their list. Tenancies on those units. Tenants with a tenancy (any status) on those units, plus tenants with no tenancy yet (so a caretaker can register someone, then move them in). Landlords owning one of those properties. Unit types, categories and features are organisation-wide | Simplest rule that still lets a caretaker do a move-in |
| Creating properties | Needs `properties:create` **and** access to all properties | A limited user could not see what they created |
| Deleting | Hard delete only when nothing depends on it: a property with units, a unit or tenant with any tenancy, a landlord with properties, or a type/category/feature in use all return `409`. Otherwise set `status: INACTIVE` | No soft-delete filter to forget on every query; history is never lost |
| Occupancy | Derived, not stored: a unit is `OCCUPIED` with an `ACTIVE` tenancy, `NOTICE` with a `NOTICE` tenancy, else `VACANT`. A partial unique index allows one `ACTIVE`/`NOTICE` tenancy per unit | Can never disagree with the tenancy table |
| Codes | Tenants `T00001`, landlords `L0001`, generated per organisation from an `OrgCounter` row (atomic `INSERT … ON CONFLICT … RETURNING`). Property codes are typed by staff (2–10 letters/digits, upper-cased) and unique per organisation | Paybill account references in phase 5 use these codes; invoices reuse the counter in phase 3 |
| Unit numbers | Unique within a property. Bulk create takes a list of numbers (the web app builds it from prefix + range); all-or-nothing, max 500 | Onboarding a 40-unit block shouldn't take 40 forms |
| ID numbers (tenant, landlord) | AES-256-GCM field encryption, bound to the organisation id (AAD). Keys come from `FIELD_ENCRYPTION_KEYS` (`keyId:base64,…`, the first is used for new writes, the others still decrypt, so rotation is add-new-first). A keyed HMAC "blind index" (`FIELD_INDEX_KEY`) detects duplicates without decrypting. The last 3 characters are stored as a hint for masked display (`•••••678`). The full value only comes from `GET …/:id/id-number`, which is audited | Design §8. **Deviation:** keys come from Secret Manager rather than a Cloud KMS-wrapped data key. KMS envelope can wrap the same key ring later without changing stored data. Security should confirm before go-live |
| Tenant phone | E.164, unique per organisation (`409 PHONE_TAKEN` names the existing tenant code) | Phone is the paybill/OTP identity in later phases |
| Move-in | `POST /tenancies` with an existing `tenantId` or a new `tenant` object in one call. Rent defaults to the unit's rent; billing day defaults to the start day capped at 28. A new tenancy can't start before the unit's previous tenant moved out (`422` on `startDate`). `depositHeld` may be entered as an opening balance (for migrating existing tenants); move-in invoices arrive in phase 3 | Fastest path for both new lets and migration |
| Notice / move-out | Notice sets `NOTICE` + the expected `endDate` and can be withdrawn. Move-out sets `ENDED` + actual `endDate` (≥ start) + reason. Deposit settlement arrives in phase 4 | Matches how agents work |
| Deleting a tenancy | Allowed (`tenancies:delete`) for mistakes; phase 3 adds "no invoices yet" | |
| Agency vs landlord org | Landlord endpoints answer `403 AGENCY_ONLY` in a landlord organisation. Properties of an agency **must** name a landlord; properties of a landlord org **must not** | Design §5.3 |
| Catalogue permissions | `unit-categories:*` covers unit types, categories and features (label updated). Reads also allowed with `units:view` (unit forms need the pickers) | Keeps the role editor small |
| Staff property lists | `POST /users/invitations` and `PATCH /users/:id` now reject property ids that aren't the organisation's (`422`) | Now that properties exist |

## Data model (migration `portfolio`)

- `OrgCounter (orgId, name, value)` — PK `(orgId, name)`.
- `Landlord` — `code`, `name`, `kind INDIVIDUAL|COMPANY`, `phone`, `email?`, `kraPin?`, `idNumberEnc Bytes?`, `idNumberIndex?`, `idNumberHint?`, `status ACTIVE|INACTIVE`. Unique `(orgId, code)`. Payout details, agreements and portal access arrive in 6b.
- `Property` — `landlordId?`, `name`, `code`, `location?`, `county?`, `floors`, `status`. Unique `(orgId, code)`.
- `UnitType`, `UnitCategory`, `UnitFeature` — `name`, `description?`; unique `(orgId, name)`.
- `Unit` — `propertyId`, `unitTypeId?`, `categoryId?`, `number`, `floor`, `sizeSqft?`, `rentAmount BigInt`, `description?`, `featureIds uuid[]`, `status`. Unique `(propertyId, number)`. CHECK `rentAmount >= 0`.
- `Tenant` — `code`, `firstName`, `lastName`, `phone`, `email?`, `idNumberEnc/Index/Hint`, `kraPin?`, `emergencyContactName?`, `emergencyContactPhone?`, `notes?`, `userId?` (portal, phase 7), `creditBalance BigInt` (phase 4). Unique `(orgId, code)`, `(orgId, phone)`, `(orgId, idNumberIndex)`.
- `Tenancy` — `tenantId`, `unitId`, `rentAmount`, `billingDay` (CHECK 1–28), `startDate date`, `endDate date?`, `noticeGivenAt?`, `depositHeld BigInt`, `status ACTIVE|NOTICE|ENDED`, `moveOutReason?`. Partial unique index: one `ACTIVE`/`NOTICE` per unit. CHECK `endDate >= startDate`.

All are org-scoped (`ORG_SCOPED_MODELS`) and have `createdAt`/`updatedAt`.

## API contract (under `/api/v1`, envelope and errors as before)

Money is integer minor units (KES cents). Dates are `YYYY-MM-DD`. Lists take `page`/`pageSize` and return `{ data, meta }`; catalogue lists are short and return `{ data }`.

**Shapes**

```jsonc
// Landlord
{ "id", "code": "L0001", "name", "kind": "INDIVIDUAL|COMPANY", "phone", "email", "kraPin",
  "idNumberMasked": "•••••678" | null, "status": "ACTIVE|INACTIVE", "propertyCount", "createdAt", "updatedAt" }
// Property
{ "id", "code": "KIL", "name", "location", "county", "floors", "status",
  "landlord": { "id", "code", "name" } | null,
  "unitCount", "occupiedCount", "noticeCount", "vacantCount", "createdAt", "updatedAt" }
// UnitType | UnitCategory | UnitFeature
{ "id", "name", "description", "unitCount" }
// Unit
{ "id", "number": "A4", "floor", "sizeSqft", "rentAmount": 2500000, "description", "status",
  "property": { "id", "code", "name" }, "unitType": { "id", "name" } | null,
  "category": { "id", "name" } | null, "features": [{ "id", "name" }],
  "occupancy": "OCCUPIED|NOTICE|VACANT",
  "currentTenancy": { "id", "status", "startDate", "endDate",
                      "tenant": { "id", "code", "firstName", "lastName", "phone" } } | null,
  "createdAt", "updatedAt" }
// Tenant
{ "id", "code": "T00001", "firstName", "lastName", "phone", "email", "idNumberMasked", "kraPin",
  "emergencyContactName", "emergencyContactPhone", "notes",
  "status": "CURRENT|PAST|PROSPECT",           // has an ACTIVE/NOTICE tenancy | only ENDED ones | none
  "currentUnits": [{ "tenancyId", "unitId", "unitNumber", "propertyName" }], "createdAt", "updatedAt" }
// Tenancy
{ "id", "status": "ACTIVE|NOTICE|ENDED", "rentAmount", "billingDay", "startDate", "endDate",
  "noticeGivenAt", "depositHeld", "moveOutReason",
  "tenant": { "id", "code", "firstName", "lastName", "phone" },
  "unit": { "id", "number", "property": { "id", "code", "name" } }, "createdAt", "updatedAt" }
```

**Endpoints**

| Method & path | Permission | Notes |
|---|---|---|
| `GET /landlords?q&status` | `landlords:view` | Agency only (`403 AGENCY_ONLY`) |
| `POST /landlords` `{name, kind, phone, email?, idNumber?, kraPin?}` | `landlords:create` | `409 ID_NUMBER_TAKEN` |
| `GET /landlords/:id` · `PATCH` (same fields + `status`) · `DELETE` | view · update · delete | Delete → `409 LANDLORD_HAS_PROPERTIES` |
| `GET /landlords/:id/id-number` → `{ idNumber }` | `landlords:view` | Audited `landlord.reveal_id` |
| `GET /properties?q&status&landlordId` | `properties:view` | |
| `POST /properties` `{name, code, location?, county?, floors?, landlordId?}` | `properties:create` + all-property access | `409 CODE_TAKEN`; `landlordId` required for agencies, rejected for landlords (`422`) |
| `GET /properties/:id` · `PATCH` (+`status`) · `DELETE` | view · update · delete | Delete → `409 PROPERTY_HAS_UNITS` |
| `GET /unit-types` · `/unit-categories` · `/unit-features` | `unit-categories:view` or `units:view` | `{ data: [...] }` sorted by name |
| `POST` `{name, description?}` · `PATCH /:id` · `DELETE /:id` on each | `unit-categories:create/update/delete` | `409 NAME_TAKEN`; delete in use → `409 IN_USE` |
| `GET /units?q&propertyId&status&occupancy&unitTypeId&categoryId` | `units:view` | `q` matches unit number or current tenant name/phone |
| `POST /units` `{propertyId, number, floor?, sizeSqft?, rentAmount, unitTypeId?, categoryId?, featureIds?, description?}` | `units:create` | `409 NUMBER_TAKEN` |
| `POST /units/bulk` `{propertyId, numbers[1..500], floor?, rentAmount, unitTypeId?, categoryId?, featureIds?}` → `{ created: n }` | `units:create` | All or nothing; `409 NUMBER_TAKEN` with `details` listing the clashes |
| `GET /units/:id` · `PATCH` (not `propertyId`; + `status`) · `DELETE` | view · update · delete | Delete → `409 UNIT_HAS_HISTORY`; deactivating an occupied unit → `409 UNIT_OCCUPIED` |
| `GET /tenants?q&status&propertyId` | `tenants:view` | `q`: name, phone, code, email |
| `POST /tenants` `{firstName, lastName, phone, email?, idNumber?, kraPin?, emergencyContactName?, emergencyContactPhone?, notes?}` | `tenants:create` | `409 PHONE_TAKEN` / `ID_NUMBER_TAKEN` |
| `GET /tenants/:id` · `PATCH` · `DELETE` | view · update · delete | Delete → `409 TENANT_HAS_HISTORY` |
| `GET /tenants/:id/id-number` → `{ idNumber }` | `tenants:view` | Audited `tenant.reveal_id` |
| `GET /tenancies?q&status&propertyId&unitId&tenantId` | `tenancies:view` | Newest first |
| `POST /tenancies` `{unitId, tenantId? \| tenant?, rentAmount?, billingDay?, startDate, depositHeld?}` | `tenancies:create` (+`tenants:create` when `tenant` is given) | `409 UNIT_OCCUPIED`, `409 UNIT_INACTIVE`; exactly one of `tenantId`/`tenant` |
| `GET /tenancies/:id` · `PATCH` `{rentAmount?, billingDay?}` · `DELETE` | view · update · delete | Only `ACTIVE`/`NOTICE` can be edited |
| `POST /tenancies/:id/notice` `{endDate}` · `DELETE /tenancies/:id/notice` | `tenancies:update` | Give / withdraw notice |
| `POST /tenancies/:id/move-out` `{endDate, reason?}` | `tenancies:update` | → `ENDED`; `endDate ≥ startDate` |

New error codes: `AGENCY_ONLY`, `CODE_TAKEN`, `NUMBER_TAKEN`, `PHONE_TAKEN`, `ID_NUMBER_TAKEN`, `IN_USE`, `LANDLORD_HAS_PROPERTIES`, `PROPERTY_HAS_UNITS`, `UNIT_HAS_HISTORY`, `TENANT_HAS_HISTORY`, `UNIT_OCCUPIED`, `UNIT_INACTIVE`, `TENANCY_ENDED`.

## Frontend

1. **Properties:** list (search, status, landlord filter for agencies, unit/occupied/vacant counts), add/edit sheet, property page with its units table, "Add units" (single, or bulk: prefix + from–to → preview of numbers).
2. **Units:** list across properties (filters: property, occupancy, type, category, status), add/edit sheet, unit page with current tenancy and history; "Move in" on vacant units.
3. **Tenants:** list (search, status, property), add/edit sheet, tenant page (profile, masked ID with "Show", tenancies); "Move in" from a tenant.
4. **Tenancies:** list (status, property) and move-in sheet (pick unit + existing or new tenant, rent, billing day, start date, opening deposit); give/withdraw notice and move-out dialogs.
5. **Landlords** (agency orgs only; hidden for landlord orgs): list, add/edit sheet, landlord page with their properties.
6. **Unit setup** (`/app/unit-categories`): tabs for categories, types and features.
7. Users: property picker for "limit to properties" in the invite/edit sheet.

## Tests

- **Unit:** field cipher (round-trip, AAD mismatch fails, key rotation, tamper detection), blind index normalisation, ID masking, property-scope helper, bulk unit number validation, billing-day default.
- **e2e:** full portfolio flow (agency: landlord → property → bulk units → tenant → move-in → notice → withdraw → move-out → unit vacant again); one current tenancy per unit (including concurrent move-ins); landlord-org vs agency rules; delete guards (409s); ID number encrypted in the database, masked in responses, revealed with an audit row; property-limited caretaker sees only their property's units, tenancies and tenants and gets 404 on others; **cross-org suite** extended to every new endpoint.
- **Frontend:** unit-number range builder, money input parsing, occupancy labels.
- Manual browser check of each new screen.

## Not in phase 2

Charges, move-in invoices and deposits as money (3–4), landlord payout details, agreements and owner portal (6b), tenant portal logins (7), unit/category images, CSV import of units and tenants (later, when onboarding real customers), tenant anonymisation (needs Legal's retention periods).

## Done when

Backend and frontend lint/typecheck/test/build pass; e2e passes on Postgres; locally an agency can add a landlord, a property with 10 units in bulk, a tenant, move them in, give notice and move them out, a property-limited caretaker sees only their property, and each step is in the audit log.

## Outcome (2026-10-27)

- Backend: 84 unit + 52 e2e tests (real Postgres): full agency flow, concurrent move-ins (one wins), delete guards, ID-number encryption/masking/audited reveal, property-limited caretaker and manager, cross-org suite over every new endpoint (incl. a second agency for landlords). Frontend: 120 tests. Lint, typecheck, build and OpenAPI export pass.
- Verified in a browser against the real API: property list with occupancy counts, move-in from the tenancies screen, tenant page with ID reveal, unit list at 390px (no sideways scroll).
- Added during the build: a tenancy can't start before the unit's previous tenant moved out; unit numbers sort naturally (A2 before A10, ICU collation `natural`); e2e tests refuse to run on a database whose name lacks "test".
- Not built in the web app yet: editing a tenancy's rent / billing day (`PATCH /tenancies/:id` exists).
- New env: `FIELD_ENCRYPTION_KEYS`, `FIELD_INDEX_KEY` (Secret Manager `hodi-field-keys`, `hodi-field-index-key`).
