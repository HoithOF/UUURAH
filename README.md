# UUURAH

One login where a business owner sees their whole company, live. Owners keep using the apps they already have (Stripe, QuickBooks, Google Ads, Gmail...) and connect each one by signing in. The dashboard pulls the data together and flags where the business is struggling.

Plan and integration map: https://claude.ai/artifact/JXc4ywg8P81MYzE7KhFyKo

## What works today (platform core)

- Email and password accounts, one company workspace per signup, owner/admin/member roles
- Notion-style sidebar: Overview, Money, Marketing, Communication, Sales, People, Connections, Settings
- Connector engine: OAuth sign-in flow with CSRF state, encrypted token storage (AES-256-GCM), sync runs with history, webhooks, and a scheduled sync endpoint
- **Stripe** (Stripe Connect, read-only): sales, refunds, fees and payouts; live updates through webhooks
- **Square** (OAuth): completed payments by location, refunds, processing fees; tokens auto-refresh
- **QuickBooks Online** (Intuit OAuth): payments received, sales receipts, refunds, purchases, bill payments, plus every invoice and bill with what's still unpaid
- **Xero** (OAuth): bank transactions, invoice payments, invoices and bills
- **Bank accounts via Plaid** (Link widget): transactions with incremental cursor sync, account balances, cash on hand and runway
- **Google Ads** and **Meta Ads** (OAuth): daily spend, clicks, conversions and conversion value per campaign; the last 7 days are re-read on every sync because platforms revise them
- **Outlook / Microsoft 365** (Graph): the last 14 days of inbox headers and previews, "needs a reply" detection, the next 14 days of calendar; reply, send, and accept/maybe/decline from the dashboard
- **Google Calendar + Gmail send**: calendar with accept/decline, and sending email from Gmail (send-only, so no paid Google security assessment is needed yet)
- **HubSpot** (OAuth): every deal with stage labels, value, expected close date and last activity
- **Payroll via Merge** (Gusto, ADP, Rippling, Paychex and more through one Merge Link connection): staff list, and payroll runs summed from each employee's gross and net pay
- **Spreadsheet upload (CSV)**: detects date/amount/description/category columns, handles `$1,234.50`, `(45.00)`, debit/credit bank exports; re-uploading the same file does not double count
- Money page (30-day totals, daily chart, transactions) and the first "where you need to look" signals on Overview
- Sales page: open pipeline, won in 30 days, win rate, open deals with cold and overdue ones marked; signals for deals with no follow-up in 14 days, deals past close date, and a low win rate
- People page: active staff, 30-day payroll, payroll as a share of sales, recent runs (totals only, and the staff list is hidden from regular members); signals for labor share of 35% or more and payroll outgrowing sales
- Marketing page: spend, conversions, the platforms' claimed return next to the real one (all sales per ad dollar), campaign table, and signals for wasted campaigns, losing returns, spend outrunning sales and rising cost per conversion
- Marketing, Communication, Sales and People pages list the apps coming in waves 2 to 4

## Run it locally

```bash
npm install
cp .env.example .env
# put a key in ENCRYPTION_KEY:  openssl rand -base64 32
npx prisma db push
npm run dev
```

Open http://localhost:3000, create an account, then go to Connections and upload `samples/sample-money.csv` to see the dashboard with data.

## Connecting Stripe

1. In the Stripe dashboard, turn on Connect and copy the **client ID** (Settings > Connect > Onboarding options > OAuth).
2. Add `http://localhost:3000/api/connect/stripe/callback` (and your production URL) as a redirect URI.
3. Set `STRIPE_CLIENT_ID` and `STRIPE_SECRET_KEY` in `.env`.
4. For live updates, add a Connect webhook pointing to `/api/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET`.

## Connecting Square, QuickBooks, Xero and Plaid

Each needs a developer app on its platform; put the keys in `.env` (see `.env.example`) and register
`<APP_URL>/api/connect/<square|quickbooks|xero>/callback` as the redirect URI. Plaid uses its in-page
Link widget, so it needs no redirect URI. All four have sandboxes (`SQUARE_ENV`, `QUICKBOOKS_ENV`, `PLAID_ENV`).

Bank transfers (including Stripe and Square payouts landing in the bank) are treated as neutral, so
connecting both a payment app and a bank doesn't count the same sale twice. Connecting both QuickBooks
and Stripe can still double count when Stripe sales are also recorded in QuickBooks; de-duplication is
on the list.

## Connecting Google Ads and Meta Ads

Google: create an OAuth client in Google Cloud, add `<APP_URL>/api/connect/google-ads/callback` as a redirect URI,
and apply for a Google Ads API developer token (it starts with test-account access only). Meta: create a Meta app
with Facebook Login, add `<APP_URL>/api/connect/meta-ads/callback`, and request `ads_read` through app review.
Meta tokens last 60 days with no refresh, so owners are asked to reconnect when one expires.

## Connecting Outlook and Google Calendar

Microsoft: register an app in Azure (any account type), add `<APP_URL>/api/connect/outlook/callback`, and set
`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. Google: the same OAuth client as Google Ads, with
`<APP_URL>/api/connect/google-calendar/callback` added; enable the Calendar and Gmail APIs.

## Connecting HubSpot and payroll

HubSpot: create a public app, add `<APP_URL>/api/connect/hubspot/callback`, and set `HUBSPOT_CLIENT_ID` /
`HUBSPOT_CLIENT_SECRET`. Payroll: create a Merge account, enable the HRIS category and the providers you want,
and set `MERGE_API_KEY`. Merge is paid per connected company.

## Accounts and security

- Sign up, log in, password reset by email (1-hour single-use link; signs out every device), email confirmation, change password.
- Team invites by email (7-day single-use link), roles (owner / admin / member), change role, remove member, switch between companies.
- Two-step login with any authenticator app (RFC 6238, tested against the RFC vectors) and 8 single-use recovery codes.
- Login, signup, reset and invite limits per email and per IP (`RateHit` table).
- All one-time links store only a sha256 of the token (`AuthToken` table).
- Email goes through Resend (`RESEND_API_KEY`, `EMAIL_FROM`). In development, or with `EMAIL_TRANSPORT=log`, emails are printed to the server log.

## Getting the numbers right

- **No double counting.** When apps overlap, each kind of money comes from one place: sales, refunds and fees from the payment app (Stripe, Square) if there is one, otherwise accounting, otherwise the bank; spending from accounting (QuickBooks, Xero) if there is one, otherwise the bank. Spreadsheet uploads always count. The Money page says which apps it used (`src/lib/money-sources.ts`).
- **One currency.** Totals use the currency most of the money is in; anything in other currencies is left out and the Money page says how many.
- **Time zones.** Each person picks theirs in Settings; every date and time, and alert timing, follows it.
- **Excel.** `.xlsx` files import directly (first sheet with data), as well as CSV.
- **Saved chats.** Ask keeps each person's conversations; history is read from the database, not the browser.

## Alerts, phone and billing

- **Alerts:** each person picks daily (only when something needs attention), weekly (Monday summary) or off, per company, in Settings. Emails go out around 7am in their time zone via the hourly job (`/api/cron/alerts`). Only confirmed emails get alerts.
- **Phone:** set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (the platform's Twilio account). Each company gets its own Twilio subaccount and picks a local number by area code. Calls are placed and answered in the browser (Twilio Voice SDK); incoming calls ring everyone on the team who has the Phone page open, then go to voicemail after 20 seconds. Two-way texting is threaded by customer. Every webhook is checked against the company's own subaccount signature, and voicemails stream through the app. Texting US numbers needs a one-time A2P 10DLC brand and campaign registration in Twilio.
- **Billing:** set `STRIPE_BILLING_PRICE_ID` (a recurring price in your Stripe account) and `STRIPE_BILLING_WEBHOOK_SECRET` (endpoint `APP_URL/api/webhooks/billing`, events `checkout.session.completed` and `customer.subscription.*`). New companies get a `TRIAL_DAYS` free trial with no card. After it, or 7 days after a failed renewal, the dashboard, assistant and MCP ask the owner to subscribe; Settings and Billing stay open and no data is deleted. Leave the price empty and everything stays free.

## The brain: health view, assistant and MCP

- **Overview** groups every warning by area (money, marketing, communication, sales, people), marks each area critical / needs attention / healthy / not connected, and lists the five things to fix first.
- **Ask** (`/dashboard/assistant`) is a chat that answers questions from the synced data. It runs Claude (`claude-opus-5-5`, adaptive thinking) with read-only tools from `src/lib/assistant-tools.ts`, each locked to the signed-in workspace. Set `ANTHROPIC_API_KEY` to turn it on. It uses server-side fallback (`fallbacks: "default"`), so if the main model declines a request the API retries on a fallback model in the same call.
- **MCP** (`POST /api/mcp`) exposes the same tools to an owner's own AI app. An owner or admin creates an access key under Settings > Connect your AI (stored as a sha256 hash, shown once). Example with Claude Code:

  ```
  claude mcp add --transport http uuurah https://YOUR-SITE/api/mcp --header "Authorization: Bearer uuk_..."
  ```

  Claude.ai custom connectors expect an OAuth sign-in rather than a key, so that path needs an OAuth layer on top of this endpoint (listed under gaps).

## Scheduled sync

Apps without webhooks are refreshed by calling `POST /api/cron/sync` with `Authorization: Bearer $CRON_SECRET` every 15 to 30 minutes (Netlify scheduled function or any cron service).

## Production

Deploys to Netlify with `netlify.toml`:

1. Create a Postgres database (Netlify DB, Neon or Supabase) and set `DATABASE_URL` to it. The build switches Prisma to Postgres automatically and creates the tables.
2. Set `APP_URL` (the public https address), `ENCRYPTION_KEY` (`openssl rand -base64 32`, never change it), `CRON_SECRET` (any long random string), and `RESEND_API_KEY` + `EMAIL_FROM`.
3. Fill in `SITE_NAME`, `COMPANY_LEGAL_NAME`, `CONTACT_EMAIL`, `COMPANY_ADDRESS` and `GOVERNING_LAW` for the legal pages, and set `LEGAL_REVIEWED=true` once a lawyer has checked them.
4. Add each app's keys from `.env.example` as you register them. Every app's redirect URL is `APP_URL/api/connect/<app>/callback`.
5. `netlify/functions/scheduled.mts` runs hourly: it refreshes apps and sends alerts.

The privacy policy (`/privacy`), terms (`/terms`) and data deletion page (`/data-deletion`) are the URLs Google, Meta and Intuit ask for during app review.

## Layout

```
src/connectors/catalog.ts     every planned app, by section and wave
src/connectors/types.ts       the interface each live connector implements
src/connectors/stripe*.ts     Stripe sign-in, sync, mapping, webhook checks
src/connectors/csv-parse.ts   spreadsheet import
src/lib/sync.ts               sync runner and scheduled refresh
src/lib/metrics-core.ts       money math and struggle signals
src/app/dashboard/...         the pages
```

Adding a new app = one file implementing `LiveConnector`, registered in `src/connectors/registry.ts`, flipped to `available: true` in the catalog.

## Tests

`npm test` covers CSV parsing, Stripe mapping and webhook signatures, encryption, and the money signals.

## Known gaps (next)

- Reading the Gmail inbox is not built (it needs Google's paid CASA assessment)
- The MCP endpoint takes access keys, not OAuth, so Claude.ai custom connectors can't use it yet (Claude Code and other header-capable MCP apps can)
