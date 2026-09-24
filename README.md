# SSV Gym website — Shree Siddhi Vinayak Gym

Public website, admin panel and a small content system for SSV Gym.

- **Public site** (`index.html`): plain HTML, CSS and JavaScript. Runs on GitHub Pages.
- **Admin panel** (`admin.html`): edit content, upload photos, manage enquiries.
- **Content** lives in a Google Sheet, served by a Google Apps Script web app.
- **Photos** are uploaded to Cloudinary; the sheet stores their links.

No frameworks, no build step, no server to maintain.

```
Visitor ──> GitHub Pages (index.html) ──GET──> Apps Script ──> Google Sheet
Owner ───> admin.html ──POST + session token──> Apps Script ──> Google Sheet
                      └─ signed upload ─────────> Cloudinary (photo links saved to the sheet)
```

## Files

| Path | What it does |
|---|---|
| `index.html` | Public one-page site: hero, stats, announcements, about, facilities, membership, trainers, gallery, testimonials, contact |
| `admin.html` | Admin panel (not linked from the site, `noindex`) |
| `css/style.css`, `css/admin.css` | Styles. Colours are variables at the top of each file |
| `js/config.js` | **Public** settings: API URL, Cloudinary cloud name / preset |
| `js/data.js` | Sample fallback content, shown only when the sheet can't be reached |
| `js/utils.js` | Shared helpers (escaping, images, phone links) |
| `js/api.js` | The only file that talks to Apps Script and Cloudinary |
| `js/main.js`, `js/gallery.js` | Public site rendering, navigation, gallery filter and lightbox |
| `js/admin.js` | Admin panel |
| `apps-script/Code.gs` | Backend: reads and writes the sheet, checks the admin password, signs uploads |
| `apps-script/README.md` | Backend deployment steps and API reference |
| `assets/` | Logo, favicon, placeholder notes |

## 1. Preview locally

Open `index.html` in a browser. With `API_URL` still a placeholder, the site shows the sample content from `js/data.js`, marked with a small "Sample content" notice and dashed "Sample" tags.

Open `admin.html` and choose **Explore with sample data** to try the admin panel. Nothing is saved in demo mode.

## 2. Google Sheet + Apps Script

Follow `apps-script/README.md`. In short: create the sheet, paste `Code.gs` into Extensions > Apps Script, run **SSV Admin > Set up / repair sheets**, set the admin password from the same menu, deploy as a web app (Execute as: Me, Access: Anyone), copy the `/exec` URL.

## 3. Connect the website

Edit `js/config.js`:

```js
API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

Reload `index.html`. The sample notice disappears and content comes from the sheet (still the seeded placeholders until you edit them).

## 4. Cloudinary (photo uploads)

**Signed uploads (recommended, default).** The API secret stays inside Apps Script.

1. Create a free Cloudinary account. The dashboard shows *Cloud name*, *API Key* and *API Secret*.
2. Sheet **Config** tab: set `CLOUDINARY_CLOUD_NAME`. Optionally change `CLOUDINARY_FOLDER` (default `ssv-gym`).
3. Apps Script > Project Settings > Script Properties: add `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.
4. Keep `CLOUDINARY_UPLOAD_MODE: "signed"` in `js/config.js`.

Only signed-in admins can get an upload signature.

**Unsigned uploads (simpler, less safe).** In Cloudinary: Settings > Upload > Add upload preset > Signing mode *Unsigned*, folder `ssv-gym`, allowed formats `jpg, png, webp`, and a max file size. Then in `js/config.js` set `CLOUDINARY_UPLOAD_MODE: "unsigned"` plus `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET`. Anyone who reads `config.js` can upload to that preset, so keep its limits tight.

Uploaded images are served through Cloudinary with automatic format, quality and size (`f_auto,q_auto,w_…`), so visitors download small files.

## 5. Publish on GitHub Pages

1. Create a repository (for example `ssv-gym`) and upload the **contents** of this folder so `index.html` is at the root.
2. Settings > Pages > Build and deployment: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The site appears at `https://<username>.github.io/ssv-gym/`. The admin panel is at `…/admin.html`.
4. Replace `YOUR-DOMAIN` in the `<head>` of `index.html` (Open Graph tags, optional canonical link) with the live URL. A custom domain can be added under Settings > Pages.

## Google Sheet reference

Lists (tags, features, highlights, facility strip, address lines, opening hours, paragraphs) use **`|` between items**, or a new line inside the cell. `active` and `featured` are tick boxes. Lower `display_order` shows first. Dates use `YYYY-MM-DD`.

**General** (`key | value`)

| key | Shown as |
|---|---|
| `gym_name` | Short name (hero badge, contact heading), e.g. SSV Gym |
| `full_name` | Shree Siddhi Vinayak Gym |
| `tagline` | Footer line |
| `description` | Search summary (also used as the page description) |
| `hero_heading` | Big hero heading; `|` starts a new line |
| `hero_subtitle`, `hero_image` | Hero text and photo URL |
| `facility_strip` | Strip under the hero and in the footer |
| `about_heading`, `about_text`, `about_image`, `about_highlights` | About section |
| `facilities_intro` | Text under the Facilities heading |
| `stat_1_value` … `stat_6_value`, `stat_1_label` … | Quick stats. Empty value = hidden |
| `phone`, `whatsapp` | Include the country code; 10-digit numbers are treated as +91 |
| `address`, `opening_hours` | Contact section |
| `maps_url` | Get directions link |
| `maps_embed_url` | Optional embedded map (Share > Embed a map > the `src` link) |
| `instagram_url` | Instagram link |
| `featured_badge_text` | Label on the highlighted plan |
| `sample_content` | Tick box. While ticked, visitors see the "sample content" notice and tags. Untick when every detail is real |

**Collections**

| Tab | Columns |
|---|---|
| Facilities | `id, name, tags, description, image_url, category, active, display_order` — `category`: `major` = large card, `additional` = small list item |
| Plans | `id, name, duration, price, description, features, featured, active, display_order` — numeric `price` shows as ₹; "about ₹X a month" is worked out from durations in months |
| Trainers | `id, name, role, specialization, bio, image_url, active, display_order` |
| Gallery | `id, image_url, title, category, caption, active, display_order` — `category`: gym, crossfit, training, equipment, events |
| Testimonials | `id, name, review, rating, image_url, active, display_order` — rating 1–5 |
| Announcements | `id, title, description, date, expiry, active, priority` — higher priority first; hidden after `expiry` |
| Leads | `id, name, phone, message, date, status` — status: New, Contacted, Closed |
| Config | `key | value` — `GOOGLE_SHEET_ID`, `APPS_SCRIPT_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, `CLOUDINARY_FOLDER`, `WHATSAPP_NUMBER`, `GOOGLE_MAPS_URL`, `INSTAGRAM_URL` (the last three are used only when the matching General field is empty) |

Leave `id` empty when adding rows by hand; the admin panel creates IDs automatically. New columns you add yourself are kept untouched. Avoid formulas in the content tabs.

## Security

| Where | What's there | Public? |
|---|---|---|
| `js/config.js` | Apps Script URL, Cloudinary cloud name, (unsigned) preset name | Yes, by design |
| Google Sheet | All content and enquiries | No. Keep it private; the script reads it as you |
| Script Properties | Password hash, Cloudinary API key and secret, notify email | No |

- The admin page contains **no password and no secret**. The password is checked by Apps Script against a salted hash; the browser receives a random session token that lasts 6 hours from last use and disappears when the tab closes.
- Hiding the **Config** tab is only tidiness. Real secrets are never stored in the sheet.
- Five wrong passwords lock sign-in for 15 minutes (for everyone, since Apps Script can't see IP addresses).
- Change the password any time from **SSV Admin > Set admin password**; that signs everyone out.
- Limits worth knowing: one shared admin password, no two-factor sign-in. For more than one editor, a good next step is Google Sign-In: the admin page gets a Google ID token, Apps Script verifies it and checks the email against an allow-list in Script Properties. `login_()` and `requireSession_()` in `Code.gs` are the two places to change.

## Sample content and fallback

- If the API is unreachable, the site shows the **last real content saved in that browser**, and only if there is none, the sample content from `js/data.js`. Sample content is marked on the page and logged in the browser console.
- Fallback content is only displayed. It is never written back to the sheet.
- An empty collection in the sheet hides that section (and its menu link) instead of showing sample data.
- The sheet is seeded with the same dummy content: Unsplash stock photos (free licence, loaded from Unsplash's servers), made-up trainer names, dummy prices, statistics, reviews and contact details. The phone number is `+91 00000 00000` on purpose so no real person gets calls, and the Maps link is only a search for the gym name.
- `sample_content` in the General tab keeps the sample notice and tags visible, and stops dummy details being published to search engines, until you untick it. The admin dashboard's **Before going live** checklist tracks what still needs replacing.

## Editing the design

Colours, fonts and spacing are CSS variables at the top of `css/style.css`. The typeface is Archivo (one variable font) used at condensed width for headings and normal width for text. Photos should be real SSV photos: the green machines, black floor and bright lighting are what the design is built around.

## Going-live checklist

- [ ] `API_URL` set, admin password set, test enquiry received in the Leads tab
- [ ] Real phone, WhatsApp, address, opening hours, Maps and Instagram links
- [ ] Real prices, or hide the Plans rows until they are confirmed
- [ ] Statistics you can stand behind, or empty them
- [ ] Trainer profiles and photos, with each trainer's consent
- [ ] Sample testimonials replaced with genuine ones, or hidden
- [ ] Stock photos replaced with real SSV photos (hero, about, facilities, trainers, gallery)
- [ ] `sample_content` unticked in Admin > General information
- [ ] `YOUR-DOMAIN` replaced in `index.html`, `assets/og-image.jpg` added
- [ ] Structured data in `index.html` filled in with the real address and hours

## Troubleshooting

| Problem | Fix |
|---|---|
| Site still shows "Sample content" | Check `API_URL` ends in `/exec`, the deployment access is **Anyone**, and open `API_URL?action=health` in a browser. |
| "Could not reach the server" | Redeploy a **new version** after editing `Code.gs`; check the Apps Script executions log. |
| Changes don't show on the site | Browsers keep content for 5 minutes (`CACHE_MINUTES`). Hard refresh, or Admin > Settings > Clear saved content. |
| Upload fails | Admin > Settings shows whether uploads are set up. Check the Config tab cloud name and the Script Properties key and secret. |
| "Sign-in is locked" | Five wrong passwords were entered. Wait 15 minutes; the lock clears on its own. |
| Images don't appear | Image links must start with `https://` (or be a path like `assets/placeholders/hero.jpg`). |
