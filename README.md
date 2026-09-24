# Rwanda Vibe Media 3.2.1 — AdSense-ready foundation

This version adds a clearer content/date system and the main site-quality foundations needed before applying for Google AdSense.

## Added
- Latest / Trending / Popular / Archive sections.
- Every media card shows its publication date; detail pages show date/time.
- Published/updated timestamps in the database.
- Public content is limited to published media.
- Admin moderation status: published / pending / rejected.
- User reporting endpoint for media.
- About Us, Contact, Privacy Policy, Terms, Copyright/DMCA and Community & Content Policy pages.
- `robots.txt` and dynamic `sitemap.xml`.
- `ads.txt` placeholder that deliberately does NOT invent a Google publisher ID.
- Better metadata/description/robots tags for search engines.
- Footer with policy/navigation links.
- Existing Films, Videos, Music, Photos, Shorts, Live, Social, Login and Admin features remain.
- Added Sports & Entertainment page (`/sports`) with sections for football, other sports, entertainment and interviews.

## Important for AdSense
No code can guarantee Google AdSense approval. Before applying, publish real original/use-authorized content, complete the policy pages, test navigation on mobile/desktop, remove broken/empty pages, and use the exact AdSense seller line Google gives you after approval in `ads.txt`.

## Run
1. Install Node.js 22+.
2. Open this folder in VS Code.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

Default admin account in the existing demo build:
- Email: `admin@mediarwanda.com`
- Password: `Admin123!`

Change/remove this demo credential before production.

## Production environment
Set:
- `JWT_SECRET` to a long random secret.
- `SITE_URL` to the real public HTTPS URL of MEDIA RWANDA.

Do not expose the demo admin password in production.

## Rwanda Vibe Media 3.2.1 additions
- Home page floating ▲/▼ controls for quickly moving through content.
- Admin can manage all users (role/delete), all media (edit/delete/status), and change the admin password from the dashboard.
- Google Translate language selector is loaded on the site so visitors can translate the interface/content into many supported languages. Availability depends on Google Translate in the visitor's browser/network.
- Default demo admin remains `admin@mediarwanda.com` / `Admin123!` only until you change it from Admin → Hindura Admin Password.


## AdSense readiness
- Original, useful content is required; scraped/copyright-infringing content should not be published.
- Clear navigation and public About, Contact, Privacy Policy, Terms, Copyright/DMCA and Community & Content Policy pages.
- robots.txt, sitemap.xml and ads.txt endpoints are included.
- User uploads are sent to pending review before publication.
- Upload form requires a rights confirmation.
- AdSense approval is not guaranteed by code; Google reviews the live site and its content/policies.


## Private Messages (3.2.2)
- Added a WhatsApp-style private 1-to-1 Messages page.
- Registered users can search other registered users and send private text messages.
- Conversations and messages are stored in SQLite.
- Messages refresh automatically every 2.5 seconds, so no WebSocket service is required.
- Messages require login and are only returned to the two users in that conversation.

## Render / GitHub structure
- A root-level `package.json` was added so Render can detect the Node app even when the repository contains the `mrw/` application folder.
- Render Build Command: `npm install`
- Render Start Command: `npm start`
- Node: 22+ (the package engine is `>=22.5.0`)
- Set `JWT_SECRET` to a long random secret in Render.
- For production persistence, use a persistent disk for `mrw/media-rwanda.db` and `mrw/uploads`, or move database/uploads to managed storage. A normal ephemeral filesystem can lose uploaded files/database data after a redeploy/restart.
