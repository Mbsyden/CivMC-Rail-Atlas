# CivMC Rail Atlas

A public CivMC railway map with:
- the imported VilyanZ base railway layer
- protected base data
- approved contributors
- station and rail-line additions
- a practical route planner
- route alternatives and transfer preferences

## 1. Create the Supabase database

Create a project at Supabase.

In **SQL Editor**, run these files in this order:

1. `schema.sql`
2. `seed_base_rail_data.sql`

The first file creates the database tables, permissions, contributor/admin roles, and automatic viewer profiles.

The second file imports the protected base railway network.

## 2. Create your account

Open the website after configuring it below and create your account.

Then go to:

**Supabase → Authentication → Users**

Find your account and copy your **User UID / UUID**.

In Supabase **SQL Editor**, run:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_AUTH_USER_UUID';
```

Refresh the website. You should now have the admin role.

## 3. Approve trusted contributors

Find the trusted player's account in:

**Supabase → Authentication → Users**

Copy their UUID.

Then run:

```sql
insert into public.profiles (id, display_name, role)
values ('THEIR_AUTH_USER_UUID', 'Their CivMC name', 'contributor')
on conflict (id) do update
set display_name = excluded.display_name,
    role = 'contributor';
```

To remove their editing permission:

```sql
update public.profiles
set role = 'viewer'
where id = 'THEIR_AUTH_USER_UUID';
```

The database itself enforces these permissions. A normal visitor cannot bypass the website's hidden buttons and edit the map.

## 4. Configure the website

Open `config.js`.

Put your Supabase project URL and browser-safe publishable/anon key there:

```js
window.SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
window.SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

**Never put a Supabase `service_role` or secret key in this file.**

## 5. Put the website online with GitHub Pages

Create a GitHub repository and upload the project files.

Then open:

**Repository → Settings → Pages**

Choose:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/ (root)`

Save it.

GitHub will give you a public Pages address. Open that address and test:
- map viewing
- route planning
- your admin account
- a normal viewer account
- a contributor account

## 6. How the route planner works

Enter:
- your current CivMC **X/Z**
- your destination **X/Z**

The planner looks for nearby stations, then searches the connected rail network.

It considers:
- walking distance to/from stations
- rail distance
- transfers
- the selected walking preference
- the selected transfer preference

The planner intentionally prefers a sensible amount of walking over a huge railway detour.

For example:

**Good practical route**
> Walk 500 blocks → train 2,000 blocks → walk 100 blocks

can beat:

> Walk 100 blocks → train 8,000 blocks → walk 100 blocks

even though the second option has less walking.

The route result also shows alternatives when the network provides them.

### Route preferences

**Walking preference**
- Balanced — normal practical routing
- Minimise walking — favours less walking
- Minimise rail distance — favours shorter rail journeys

**Transfer preference**
- Balanced — strong transfer penalty
- Fewest transfers — very strong transfer penalty
- Don't mind transfers — lower transfer penalty

## 7. Base layer vs community data

The imported VilyanZ railway network is kept separate from community additions.

**Base layer**
- protected
- only admins can modify it

**Community data**
- contributors can add stations and rail lines
- contributors can edit/delete their own contributions
- admins can manage everything

## 8. VilyanZ credit

The original railway base layer is based on the **Rails (VilyanZ)** dataset supplied for this project.

**Credit: VilyanZ.**

This project does not claim ownership of the original railway dataset.

## 9. Important security note

The public Supabase key is intended to be used in browser code. Database security comes from **Row Level Security (RLS)**.

Do not publish:
- Supabase `service_role` keys
- secret keys
- database passwords

If a secret key is accidentally uploaded to GitHub, rotate it immediately in Supabase.

## 10. Updating the railway network

When you have new or corrected base railway data, update the protected base tables through an admin-controlled database import rather than allowing ordinary contributors to overwrite them.

Community additions should remain separate so the original dataset can always be preserved.

## Added features

### Station information
Station markers and search results now show station name, CivMC X/Z, available description, associated railways, route-from-station, and issue reporting. Only information actually present in the map data is displayed.

### Search
Search covers both station names and railway names.

### Reports
Signed-in users can report incorrect station or railway information. Reports are private to admins in Supabase. Run the updated `schema.sql` to create the reports table and policies.
