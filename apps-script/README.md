# SSV Gym: Apps Script backend

`Code.gs` turns the **SSV Gym CMS** Google Sheet into a small JSON API for the website and admin panel.

## Deploy

1. Create a Google Sheet named **SSV Gym CMS**. Keep it private; don't use "Publish to web".
2. In the sheet: **Extensions > Apps Script**. Delete the sample code and paste `Code.gs`.
3. **Project Settings**: set the time zone to *(GMT+05:30) India Standard Time*. Optionally tick "Show appsscript.json" and paste `appsscript.json`.
4. Save, then reload the sheet. An **SSV Admin** menu appears.
5. **SSV Admin > Set up / repair sheets.** Approve the permission prompt. All nine tabs are created with sample rows.
6. **SSV Admin > Set admin password** (at least 10 characters). Only a salted hash is stored.
7. **Deploy > New deployment > Select type: Web app.** Execute as **Me**, Who has access **Anyone**. Deploy and copy the URL ending in `/exec`.
8. Paste that URL into `js/config.js` as `API_URL`.

**After changing `Code.gs`:** Deploy > Manage deployments > edit (pencil) > Version: **New version** > Deploy. The URL stays the same. Saving alone does not update the live API.

"Anyone" access is required so visitors can load content. Admin actions are still protected: each one needs a session token that is only issued after the password check.

## Script Properties (Project Settings > Script Properties)

| Property | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT` | Yes | Set by the sheet menu. Don't edit by hand. |
| `SESSION_EPOCH` | Auto | Changing it signs everyone out (the menu does this). |
| `CLOUDINARY_API_KEY` | For signed uploads | From the Cloudinary dashboard. |
| `CLOUDINARY_API_SECRET` | For signed uploads | From the Cloudinary dashboard. Never put this anywhere else. |
| `NOTIFY_EMAIL` | Optional | Receive an email for every new enquiry. |
| `SHEET_ID` | Optional | Only if the script is a standalone project, not bound to the sheet. |

## API reference

All responses are JSON: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "message", "code": "CODE" }`.

**GET** `API_URL?action=...`

| action | Returns |
|---|---|
| `content` (default) | `{ general, facilities, plans, trainers, gallery, testimonials, announcements, updated }`. Only active rows, sorted; expired announcements removed. Cached 5 minutes, cleared on every write or sheet edit. |
| `general`, `facilities`, `plans`, `trainers`, `gallery`, `testimonials`, `announcements` | That part only |
| `health` | `{ status, version }` |

**POST** `API_URL` with body `{"action": "...", ...}` sent as `Content-Type: text/plain` (avoids a CORS preflight, which Apps Script can't answer).

| action | Auth | Body | Returns |
|---|---|---|---|
| `submitEnquiry` | Public | `enquiry: {name, phone, message, website}` | `{received}` |
| `login` | Public | `password` | `{token, expiresIn}` |
| `verify`, `logout` | Token | `token` | |
| `adminGetAll` | Token | | All rows including hidden ones, `leads`, non-secret `config`, `meta` |
| `getEnquiries` | Token | | Leads |
| `saveGeneral` | Token | `general: {key: value}` | Updated General map |
| `saveRecord` | Token | `collection`, `record` (no `id` = create) | Saved row |
| `deleteRecord` | Token | `collection`, `id` | |
| `reorder` | Token | `collection`, `ids: [...]` | Sets `display_order` 1..n |
| `updateLeadStatus` | Token | `id`, `status` (New, Contacted, Closed) | |
| `getUploadSignature` | Token | | `{cloudName, apiKey, timestamp, folder, signature}` |

`collection` is one of `facilities`, `plans`, `trainers`, `gallery`, `testimonials`, `announcements`.

## Protections built in

- Salted SHA-256 password hash; 5 wrong attempts lock sign-in for 15 minutes.
- Random 64-character session tokens in CacheService, 6-hour sliding expiry, revocable.
- Writes run under a script lock; only known columns are written.
- Values starting with `=`, `+`, `-` or `@` are stored as text, so nobody can inject spreadsheet formulas.
- Enquiries: hidden honeypot field, one enquiry per phone number per 10 minutes, max 30 per hour.
- Unexpected errors return a generic message; details go to the Apps Script executions log.
