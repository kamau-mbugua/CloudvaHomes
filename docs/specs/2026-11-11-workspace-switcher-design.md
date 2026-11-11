# Workspace switcher — design

Date: 2026-11-11 · Status: draft, for the owner's review

## 1. Why

One KodiHub login can belong to several places at once: staff (owner, manager, …) in
several organisations, a tenant in one or more homes, a landlord with an owner portal, and a
KodiHub operator (salesperson or superadmin). Today the way between them is scattered: a
profile menu with vague links ("Staff app", "Tenant portal") that don't say which
organisation or home they open, an organisation list that only appears with two or more,
and a landing after sign-in that ignores where the person last was.

The owner's rule: **show people every organisation and home they belong to, let them pick
one, and keep that pick — across refresh, sign-out, sign-in and devices — until they pick
another.** Which place matters most is personal; KodiHub doesn't decide it for them.

Success: someone in three organisations who rents a home can see all four at a glance, from
any page, named, and land back in the one they chose last — on the web and on their phone.

## 2. Decided by the owner

- **A switcher at the top of the side menu** (option A of the mockups). It always names
  where the person is now; clicking it opens the full list.
- **The sales console stays in the profile menu** (avatar, top right). It is not in the
  switcher.
- **The pick persists** through refresh, sign-out and sign-in, until the person switches.
- **It follows the person across devices**: chosen on the laptop, the phone opens there too
  (and the other way round). So it is stored on the server, not in the browser or phone.

## 3. The switcher (web)

Shown in the staff app and in the tenant and owner portals, in the same place: the top of
the side menu, replacing the current organisation title. Closed, it shows a badge (initials),
the place's name and a second line:

- an organisation: its kind and the person's role — "Short stays · Owner";
- a home: "Tenant · <organisation>"; with several homes and "all" chosen, "All my homes (2)";
- an owner portal: "Landlord · <agency>".

Open, a list in groups, each group only when it has rows, current row ticked:

1. **Organisations** — every membership: name, kind · role.
   - **Invited** memberships are listed with an "Invited" tag. Choosing one asks "Join
     <organisation> as <role>?" and accepts it in place — no need to dig out the email
     *(my call)*. This needs a small signed-in accept (e.g. `POST /auth/invitations/:membershipId/accept`)
     that only accepts an INVITED membership belonging to the signed-in user; the emailed
     link keeps working as before.
   - Inactive memberships are not listed.
2. **Homes I rent** — one row per tenant account (home · organisation); when there are two
   or more, an "All my homes" row first. This **replaces the tenant portal's current
   "Showing: All my homes" picker** so the tenant sidebar has one picker, not two *(my call)*.
3. **Landlord of** — one row per landlord profile (owner portal), only for those who have one
   *(my call)*.

A search box appears at the top when the list has more than 6 rows *(my call)*. Keyboard:
the list is a proper menu (arrow keys, Enter, Escape), focus returns to the trigger.

Choosing a row switches immediately (organisation → staff app home of that organisation;
home → tenant portal scoped to it; landlord → owner portal for it), shows "Switched to …",
and saves the choice (section 5). On a phone-width screen the switcher sits at the top of
the slide-out menu, same behaviour. Collapsed sidebar: the badge alone, list opens beside it.

The owner portal has no side menu (a header and a row of tabs). There the switcher takes the
place of the header's organisation name and landlord picker, top-left, with the same list
*(my call)*.

## 4. The profile menu (web)

Keeps: who you are, appearance, My account, Sign out. Adds/changes:

- **Operators**: "Sales console" (salesperson) / "Platform admin" (superadmin), as today.
- **In the admin area** (which has no switcher), the profile menu's vague "Staff app" /
  "Tenant portal" links become **"Back to <name of the last place>"** — e.g. "Back to Makini
  Homes" — plus the same grouped list as the switcher, so the admin area reaches every place
  by name *(my call)*.
- The organisation list and the "Staff app / Owner portal / Tenant portal" links are removed
  from the profile menu everywhere else: the switcher is the one place for that.

## 5. Remembering the choice (server)

Already stored on the user: the last organisation (`defaultOrgId`), home (`defaultTenantId`)
and landlord profile (`defaultLandlordId`), saved by `POST /auth/switch-context`.

Missing: **which kind of place** was chosen last. Add to `User`:

- `defaultPlace` — `STAFF | TENANT | OWNER | PLATFORM`, nullable (null = today's rule).

Set it:
- `switch-context` / `switch-org` accept an optional `place`; the switcher sends it with the
  organisation / tenant / landlord it picks. Choosing "All my homes" stores `TENANT` with no
  tenant id.
- Opening the sales console from the profile menu stores `PLATFORM` (a small endpoint, e.g.
  `POST /auth/place { place: 'PLATFORM' }`, or the same `switch-context` with `place` only).

Read it: the session payload gains `defaultPlace`. After sign-in, on refresh, and at the site
root `/`, web and mobile go to:

| `defaultPlace` | still allowed? | lands in |
|---|---|---|
| PLATFORM | is an operator | sales console / admin area |
| TENANT | has a tenant account | tenant portal, on `defaultTenantId` (or all homes) |
| OWNER | has a landlord profile | owner portal, on `defaultLandlordId` |
| STAFF or null | has an organisation | staff app, in `defaultOrgId` (existing `pickOrg`) |

If the remembered place is gone (left the organisation, tenancy ended, no longer an
operator), fall back down the existing order (staff → tenant → owner → platform) and don't
error. A deep link (`/login?next=…`) still wins over the remembered place.

This **replaces the per-device memory** added on 2026-11-11 (`frontend/src/lib/auth/lastPlace.ts`
in localStorage; `readLastMode/writeLastMode` in the mobile token store). Those are removed.

## 6. Mobile

The mobile account sheet ("Where do you want to go?") already lists organisations, homes and
the platform. It gets the same groups and labels as the web switcher (Organisations with
kind · role and Invited tags, Homes I rent, Landlord of; Platform last for operators), and its
mode choice is saved and restored through the same `defaultPlace` + default ids instead of
device storage. The app's own top-left title shows where you are, as on the web.

## 7. Non-goals

- No new roles or permissions; nothing changes in what a person may do in a place.
- No "favourites", pinning or reordering of places.
- No change to the admin area's own navigation, and no switcher inside it (section 4).
- No merging of data across organisations (no combined dashboard).

## 8. Anti-goals (would make it a failure even if it works)

- A place the person belongs to that they cannot find from the switcher.
- Landing somewhere other than the last pick, on any device, without the person having
  lost access to it.
- Two pickers on one screen that disagree (e.g. tenant home picker vs switcher).
- Showing places the person does not belong to, or leaking other organisations' names.

## 9. Left to the builder

Visual details within the existing design system (badges, spacing, icons); exact endpoint
shape for setting `PLATFORM`; how the tenant portal's existing home-scope state is folded into
the switcher; test layout. Tests must cover: every group appears only when it has rows;
choosing each kind of row switches and saves; landing after sign-in for each `defaultPlace`
including fallbacks; a second device (new session) lands in the same place.
