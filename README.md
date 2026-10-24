# Beyond the Balance

The Money Trauma series lead magnet for the Somatic Abundance podcast. Each series gets its own PWA; this is the money one. The PWA from Brand Blueprint v2.3, sections 9 and 10. Plain static files with no build step: upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages) and it runs.

## What's in it

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app. Dark mode by default, linen and indigo palette, light mode toggle. |
| `config.js` | Sign-in provider, workshop prominence, preview switches. |
| `data/tracks.json` | Tracks and sessions. One track (money) at launch. |
| `data/workshop.json` | Workshop panel content and its state: `"open"` or `"hibernating"`. |
| `sw.js` | Offline cache and cache versioning. |
| `audio/` | Session recordings go here. |

## Everyday changes

**Add a recording.** Put the file in `audio/` (MP3 or M4A), then set that session's `"audio"` in `data/tracks.json`, for example `"audio": "audio/when-the-number-lands.mp3"`, and set `"minutes"`. Until a session has audio it shows "Recording soon" with the play button disabled.

**Switch the workshop.** In `data/workshop.json`, set `"state"` to `"open"` or `"hibernating"` and fill in that block. `reserveUrl` and `bonusOnlyUrl` take payment links (for example Stripe Payment Links); `reserved` is the count shown against the threshold. Data files are fetched fresh each time the app opens, so this change reaches returning users without a version bump.

**Change the app itself** (HTML, CSS, JS, `config.js`, icons). Bump `CACHE_VERSION` in `sw.js` and `appVersion` in `config.js`. Returning users see "A new version is ready. Refresh", and the old cache is deleted when they tap it. It never reloads on its own, so nobody is cut off mid-session.

## Unlock schedule

Sessions unlock by calendar day from sign-up: day 0, 3, 7 and 10. The day 10 to 12 edge session opens on day 10; spread the email nudge across days 10 to 12 if you want. With Supabase, the sign-up date comes from the account, so it holds across devices. In preview mode it is stored in the browser.

`?day=N` in the address previews the schedule (for example `/?day=10`). Set `allowDayOverride: false` in `config.js` before launch.

`workshopProminence` in `config.js`:
- `"quiet"` (default): a small text link until the edge session opens, then the full panel.
- `"equal"`: the full panel with the ochre button is always on the home screen.

## Sign-in

`config.js` ships with `provider: "preview"`: any email signs in on that device and nothing is sent. A banner says so. **Do not launch in preview mode**; it captures no emails.

For real magic links, use Supabase Auth (free tier is enough):

1. Create a Supabase project. Copy the project URL and the anon key into `config.js` and set `provider: "supabase"`.
2. Authentication → URL Configuration: set Site URL to the app's address and add it to Redirect URLs.
3. Authentication → Email Templates → Magic Link: include `{{ .Token }}` as well as the link. People who added the app to their iPhone home screen can't use the link (it opens Safari, not the app), so they type the 6-digit code instead.
4. Set up custom SMTP (Resend, Postmark) under Authentication → SMTP. Supabase's built-in sender is rate-limited and not meant for production.
5. Run `supabase/migrations/001_init.sql` in the SQL editor. It creates a `signups` table, filled automatically when someone first signs in, and the `workshop_notify` table for "Notify me".

Emails captured this way show up in Authentication → Users and in the `signups` table.

## Emails through MailerLite

Supabase only sends the sign-in email. Everything else goes through MailerLite, which you already use for Abundance Within.

1. In MailerLite, create two groups: **SA sign-ups** and **SA workshop notify**.
2. Deploy the function in `supabase/functions/mailerlite-sync`, then set its secrets:
   `supabase secrets set MAILERLITE_API_KEY=... MAILERLITE_SIGNUP_GROUP_ID=... MAILERLITE_NOTIFY_GROUP_ID=... WEBHOOK_SECRET=<any long random string>`
3. In Supabase, go to Database → Webhooks and add two webhooks: INSERT on `public.signups` and INSERT on `public.workshop_notify`. Point both at the function's URL, with header `x-webhook-secret: <same string>`.
4. In MailerLite, add an automation that triggers when a subscriber joins **SA sign-ups**. Wait 3 days, send "Your next session is open". Wait 4 days and send it again. Wait 3 more days and send the day 10 email. The group join date matches the sign-up date, so the emails line up with the in-app unlocks.

**Consent:** the sign-in screen says "We only email to tell you when your next session is open." That covers the nudges. It doesn't cover a workshop sales email or a newsletter. Either keep the day 10 email to "your session is open" (the invitation lives in the audio and on screen), or add a separate opt-in before marketing to these people.

## Not built yet

- The optional sign-up question about what brought them.
- Play and repeat-use tracking.
- Reply boxes (deliberately deferred per the blueprint).
