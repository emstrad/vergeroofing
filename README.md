# Verge Roofing

One public website that turns a visitor into a quote request, and a staff area
behind a login that runs the business from that point on: leads, quotes, which
quotes converted, jobs, what each person earned, client records, staged
payments, and monthly bank reconciliation.

This file explains why things are the way they are. In six months the reasoning
is the only thing stopping someone undoing it.

```
public/          the site, served exactly as it sits on disk
  index.html     home page, hand written
  staff/         login, dashboard, jobs, clients, bank
  assets/        css, js and one font, content-hash stamped
  services/ guides/ roofing-in/   generated pages, committed
api/             serverless functions (10 of them)
lib/             db, http, validation, throttle, session, attribution,
                 metrics, money, bank, route handlers
content/         the words: site facts, services, guides, areas, hubs, reviews
scripts/         page generators, the build, the dev server
db/              schema.sql, migrate.js, create-user.js
test/            unit and integration tests, run against real Postgres
```

## Running it

```
npm install
npm run dev          # localhost:3000, real handlers against a local Postgres
npm run migrate      # applies db/schema.sql, idempotent
npm run build:pages  # regenerates the content pages and stamps assets
npm test             # 71 tests, needs a local Postgres
```

`npm run dev` needs `DATABASE_URL` pointing at a local Postgres plus `IP_SALT`,
`SESSION_SECRET` and `STAFF_ACCESS_CODE`. `lib/db.js` uses `pg` when the URL is
localhost and the Neon HTTP driver otherwise; the local branch never runs in
production.

## Decisions worth keeping

**No framework, no bundler, no build step at deploy time.** Vercel serves
`public/` as it sits and the generated HTML is committed. `npm run build:pages`
is an authoring tool, not a deploy step.

**Every page's words are in the markup.** Google renders JavaScript; most AI
crawlers do not. The service tab strip shows one pre-rendered panel at a time
rather than writing `innerHTML`, and nothing on any page is assembled from a
JavaScript array at runtime.

**One implementation of the quote form** in `scripts/book-form.js`, written into
every page between markers. The offered job and property types come from the
same lists the server validates against, and a test asserts they match, because
two hand-maintained copies drift and you find out when a field is missing from
one of them.

**The held partial** is where a large share of the value sits. Passing step 1
arms a partial, which is then held back, not sent. It goes only on genuine
abandonment: the page hidden for 45 seconds, or 3 minutes idle with the form
open. Submitting cancels it, so somebody who finishes the form produces one
enquiry and not two, and both rows share a `session_id` so they reconcile.

**The email relay is posted from the browser**, after the lead is stored.
FormSubmit and most relays sit behind Cloudflare, which answers a
server-to-server request with a bot challenge and a 403 rather than sending
anything. A blocked or ad-blocked browser therefore costs the email and never
the enquiry, and `/api/notified` records which of the two happened.

**Throttles live in Postgres**, not process memory: serverless instances do not
share memory, so an in-process counter is bypassed by spreading requests across
cold starts. Leads and events fail open, because a database blip must not stop
the phone ringing. Logins fail closed, per address and globally, because a
per-address limit alone still lets a pool of addresses walk a short keyspace.

**Never a raw IP.** `sha256(ip + IP_SALT)`, and an unset salt is a hard failure
rather than a default, because a sha256 of an IPv4 with no salt is brute-forced
in seconds.

**Channel and device are derived on the server** and never accepted from the
client. Referrer hosts match on label boundaries, and webmail is tested before
search, so `mail.google.com` reads as email rather than as Google.

**Assets are immutable for a year**, which is only safe because every reference
carries a content hash of the file it points at. A test re-stamps and fails when
one is stale, so editing an asset without rebuilding fails in CI rather than in
a returning visitor's browser.

**One self-hosted variable font.** Google Fonts puts a DNS lookup, a TLS
handshake and two round trips to somebody else's server in front of first paint.
A test fails if anything on the site loads from a third party.

## The money

The waterfall on a job, in integer pence throughout:

1. the agreed price
2. less tax set aside, 20%
3. less the lead fee, 15%, taken on the post-tax figure, to Scott
4. less materials and subcontract costs actually incurred
5. the remainder split equally between Tom, Steve, Ben and Scott

On a £1,000 job with no materials: £200 tax, £120 lead fee (15% of £800, not of
£1,000), £680 remainder, £170 each, and Scott £290 including the fee.

Materials come out of the shared remainder rather than off the top, so the lead
fee stays the percentage that was agreed. A split that ignored materials would
pay people out of money that has already gone to a merchant, which on quoted
work is the easiest way to distribute more than the business earned. Where the
cost is not known yet the card says so rather than treating it as zero.

Pence everywhere, because floating point cannot hold 0.15 exactly and a chain of
percentage steps in floats drifts away from what anyone was actually paid.
Rounding is to the nearest penny, halves away from zero, and the odd penny goes
to the first partner so payouts always add back to exactly what the job
distributes. Jobs that lost money split negative and are shown that way.

**A job stores the rates it was agreed at.** Raising a percentage next month
must not silently rewrite what everyone earned last month; editing a job keeps
its original rates and only a new job takes today's.

**Payments are a list, not two tick boxes.** Deposit, stages, balance,
retention, each for whatever was agreed. Paid in full is computed from the
payments rather than being a flag somebody remembers to set, and nothing derives
a deposit from the price, because that is a fixed-price convention.

## The pipeline

A job moves through statuses rather than being created already won:

```
quoted  ->  booked  ->  completed
   |           |
declined    cancelled
```

One table, not a separate quotes table, so the client record, the photographs
and the address stay attached all the way through and nothing moves when a quote
is won. A declined quote must record why, from a short list. It is the most
valuable field in the database and the one most often left out: without it there
is no way to tell a price problem from a timing problem.

## Bank reconciliation

The CSV is read **by column name**, never by position, trying each field's known
aliases, because banks rename and reorder columns. Fees are folded into the
amount so a line is the money that actually moved. Pending, declined and
foreign-currency lines are skipped: a pending line can still change and would
import again, differently, next month. Every line is fingerprinted, by the
bank's own id where there is one, so overlapping months never double up.

A line becomes one of two things, never both: matched to a job, or split between
people. Money in scores against the outstanding amounts as well as the price, so
a deposit on a large job is findable, and it matches automatically only when one
job clearly wins and beats the runner-up outright. Anything closer is a
suggestion for a person to confirm, because a wrong match marks the wrong
customer as paid, which is worse than an unmatched line. Money out assigned to a
job becomes a materials cost on it.

Categories and splits chosen by hand are learned against the description with
its numbers stripped, so `TRAVIS PERKINS 1234` and `... 5678` share a rule, and
`category_kind` and `split_kind` keep a hand-made choice from being overwritten
by one learned elsewhere. A job assignment is deliberately **not** learned: a
merchant line belongs to the job that was on site that week, not to every future
line from that merchant.

The page shows one identity:

```
bank in, less bank out  =  each person's figure
                         + the tax pot
                         + payments received on jobs not yet completed
                         + money in not yet matched or split
                         + spend not yet split or assigned
                         + difference
```

Materials are deliberately not a separate line, although the temptation is
strong. A job's earnings already have materials taken out of the shared
remainder, so the partners' figures are net of that spend and the bank line that
paid the merchant has already reduced the left side. A materials term would
count the same money twice and push the difference off by exactly the merchant
bill. Once everything is allocated, the only line that can be nonzero is the
difference, which is where a cash-paid job or an overpayment shows up rather
than vanishing. The route tests assert both sides agree after every operation
they perform.

## The staff area

`/staff` is one shared access code in an environment variable, then four tabs.
The code has a small keyspace, so the route leans on the throttles rather than
on the code's strength, and unknown and wrong do the same work and return the
same message. The session cookie is `httpOnly`, `Secure`, `SameSite=Lax`, eight
hours, HMAC signed and verified in constant time; signed rather than encrypted,
because it holds nothing secret and the signature is what stops it being edited.

Know the trade-off: one code means no per-person audit trail, and every log line
says "someone who knew the code". `staff_users` and `db/create-user.js` exist
anyway so moving to per-person accounts later is a route change rather than a
migration.

Every count is aggregated in SQL. Every cell is built with `textContent`,
because lead notes, referrers and campaign names are visitor-supplied and
rendering them as markup would make the dashboard a stored XSS sink. The CSV
export prefixes any cell starting with `=`, `+`, `-` or `@` so a note cannot
become a spreadsheet formula.

## Content rules

The directory is the list: each content folder reads itself, so there is no
register to update and no way to write a page and leave it unpublished. The
build refuses to write anything while any page carries under 250 distinctive
words, because a thin page drags the whole site down rather than only itself.

There is no `/pricing` page. Every job is quoted, so instead the guides publish
the basis: what moves the figure, what is always included, what is never added
afterwards, and how to compare quotes. Two of them argue against buying work.

Area pages exist only where the building stock genuinely changes what goes
wrong. Anything that would differ only by the town name is the doorway page
pattern and was not written.

No `aggregateRating`, ever, and no star average or review count in visible copy:
Google's review snippet guidelines exclude ratings aggregated from another site.
Reviews live in `content/reviews.js`, copied by hand and written into the HTML
by the build, because a review that only exists after a fetch is one AI crawlers
never see. Below five reviews the whole section ships empty and hidden. A test
traces every card on every shipped page back to a real entry.

`robots.txt` has one group only. Adding a named group for a crawler makes that
crawler ignore the wildcard group entirely, so the disallows would stop applying
to exactly the crawler somebody added the group for.

## Environment

```
DATABASE_URL          Neon pooled connection string (host contains -pooler)
STAFF_ACCESS_CODE     the code typed at /staff
SESSION_SECRET        signs the staff cookie; rotating it signs everyone out
IP_SALT               without it the no-raw-IPs promise does not hold
ADDRESS_API_KEY       optional, postcode lookup
BLOB_READ_WRITE_TOKEN optional, attachments
CRON_SECRET           optional, the monthly orphaned-blob sweep
GOOGLE_MAPS_API_KEY   optional, live reviews
GOOGLE_PLACE_ID       optional, this business's listing
```

**Apply a schema change before merging the code that needs it.** Vercel deploys
on the push and CI migrates a minute or two later; in that gap new code runs
against the old table, and on the lead endpoint that means enquiries answered
with a 500.

## Traps that cost real time

1. **Twelve serverless functions on Hobby.** Going over fails at the deploy
   step, not the build, and the log ends cleanly at `Deploying outputs...`.
   There are 10 here; `api/admin/[action].js` groups the whole staff API.
2. **`vercel.json` rewrites are evaluated after the filesystem.** With
   `cleanUrls` none are needed, but know it before reaching for one.
3. **Email relays behind Cloudflare refuse server-to-server calls.**
4. **Immutable asset caching is only safe with content-hash stamping**, checked
   by a test.
5. **A split that ignores materials** pays people out of money already spent.
6. **A deposit is not half the price.** Derive nothing the business does not do.
7. **`actions/checkout` leaves credentials in the clone**; CI sets
   `persist-credentials: false`.
8. **A thin page drags the whole site down**, so the build refuses to write one.
9. **The Google Business Profile outranks the website** for local intent. If
   time is short, spend it there: verified, complete, categories right, service
   areas listed, and a review request after every job.

## Still to do

- `content/site.js` has `phone`, `googleBusinessProfile` and `companiesHouse`
  set to null. While `phone` is null every call to action ships without a
  number, on purpose: a placeholder number sends real customers to a stranger.
  Fill it in and run `npm run build:pages`.
- The business schema will carry `sameAs` pointing at the Business Profile once
  that URL exists. That link is the signal tying the site to the map listing.
- Reviews: paste five or more real ones into `content/reviews.js`.
- Deposit and staged payment practice is not configured. `job_settings`
  has `deposit_percent` null, which means nothing is prefilled.
