# CivMC Rail Atlas

## Important: fixed version
The map now loads the 201 imported VilyanZ railway features directly from `base_rail_data.json`. This means the map, search, base layer toggle, and route planner work even when Supabase is not configured.

The previous version tried to initialize Supabase immediately and load the base layer from the database. With placeholder Supabase credentials, that could stop the JavaScript before any buttons or map logic ran.

## GitHub
Upload the **contents** of this folder to the repository root. Keep `index.html`, `app.js`, `style.css`, `config.js`, and `base_rail_data.json` beside each other.

## Supabase
Supabase is optional for public map viewing, search, the protected base layer, and route planning. It is required for accounts, reports, contributor edits, edit history, and admin backups.

1. Create a Supabase project.
2. Run `schema.sql` in SQL Editor.
3. Create your account through the site.
4. Find your Auth user UUID in Authentication → Users.
5. Run `update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';`
6. Put the project URL and public publishable/anon key in `config.js`.
7. Do not put a service-role/secret key in `config.js`.

## Base data
`base_rail_data.json` contains the 201 imported VilyanZ rail features and is treated by the website as the protected read-only base network. Dynamic contributor data is stored in Supabase.

## Route planner
The route planner uses the rail network as a graph. Walking has a higher cost weight and transfers have a fixed penalty so it will prefer a reasonable walk over a huge railway detour.

## GitHub Pages
After uploading the files, use GitHub → Settings → Pages → Deploy from branch → `main` → `/ (root)`.

If the page is blank after publishing, open the browser developer console (F12) and check for a red error. Also verify that `base_rail_data.json` is in the repository root and that its filename matches exactly.


### Important when replacing the old GitHub version
Replace the old project files with all files from this ZIP, including `base_rail_data.json`, `app.js`, `index.html`, `style.css`, `config.js`, and `schema.sql`. Do not keep the old `app.js` or `config.js`.

The map itself does not require Supabase. If `config.js` still contains placeholders, the site will show the public map and route planner but sign-in/edit/report/admin features will remain unavailable until Supabase is configured.
