# Pages

What a page has to do, in what order, for each kind of page the platform
builds. Drawn from the course's winning page walk-through and from reading
the fifteen reference pages the owner pointed at, page by page
(`reference-pages.md` is the evidence; this is the rule book).

## Two shapes, two front doors

A site is a **store** (home, collections, product pages with a bundle buy
box, cart drawer, checkout) or a **funnel** (one long sales page or a short
offer page, a checkout with a bump, a one-click upsell, a downsell, a
thank-you page; no navigation, one product). Either can have a **front
door** the ad lands on: an **advertorial** that teaches and then links to
the product page or the sales page, or a **quiz** whose result presents the
offer. The build flow asks for the shape and the doors first, and the page
plan follows.

The reference stores are, almost without exception, single-product funnels
dressed as stores: the product page is a long sales page with the buy box
reached by ten identical anchored CTAs. Only a real catalogue (SlideBelts)
needs breadcrumbs, facets and a per-variant gallery.

## The buy box

The same skeleton on funnel and store pages alike, top to bottom:

1. A credential or proof eyebrow ("PT, Chiropractor & CMT recommended", "Rated 4.7 | 100,000+ reviews"). The rating is computed from real reviews or omitted.
2. Title, then a one-sentence mechanism subtitle.
3. Three to eight bold-lead check bullets; outcome-negations for cold traffic ("No more…").
4. The offer label ("Limited time offer", "Deal ends at 11:59 PM").
5. Selector guides inside the box when there are options ("Not sure? Go 7L"), the badge on the dearer choice.
6. What's included: each free item with its crossed-out value, "N free gifts included".
7. The quantity tiers: per-unit price, total, regular price and the saving all at once; the bigger of dollars or percent in the badge; one tier pre-selected and badged ("Most Popular" on the middle, "Best Value" on the top); free shipping and a gift on the higher tiers; BOGO framing for low-AOV consumables.
8. Pre-checked add-ons.
9. The stock and ship-date line ("In stock · arrives Sep 8–12", "Ships by Fri"), from the supplier lead time.
10. The button with the live price in it.
11. Two or three trust chips directly under the button; the same chips under every CTA on the page.
12. The compliance line after the button, in soft words (renewal terms, "results vary").
13. Payment icons; HSA/FSA where it applies.
14. A named, numbered guarantee with a shield ("The Empty Bottle Promise", "60-night risk-free trial", "60-day 'sit without pain' guarantee").
15. Accordions: description, what to expect (a week-by-week timeline), the guarantee, shipping and returns, specs.
16. One emotional testimonial right there.

Blocks: `rating-line`, `buy-box` (eyebrow, bullets, offer label, ship line, chips, note, guarantee), `bundle-offer`, `included`, `faq`.

## The sales page (funnel, long form)

The buy box at the top; everything below is optional persuasion for the
scroller, closed by a sticky button. Order:

1. Top bar with the offer; logo; no navigation.
2. A hero review, then the headline stack: pre-head ("Tired of fixes that come with side effects, need a prescription, or do nothing?"), headline (outcome + "and you'll actually enjoy it"), sub, four check bullets.
3. **The buy box**, with six accordions inside it carrying the long copy.
4. The problem as four image scenes with a caption each, then the bridge: the root-cause reframe that absolves the buyer ("It was never your chair. It's the gap between your tailbone and a flat seat.").
5. The mechanism, named, in three verbs (OFFLOAD / ALIGN / HOLD), used as the diagnosis of why everything else failed.
6. "Instead of X:" the failed alternatives, each dismissed in two sentences that end on a feeling.
7. The product introduced, with the one number that proves it (1,300 mg; 26°; 2.3 million particles).
8. How it works in three cards, the same three verbs.
9. The timeline, running past the guarantee window, with "results vary" under it.
10. The expert or the founder, named, with a credential and a photo.
11. The dream outcomes as a check list ("Take the long trip to see the grandkids").
12. "Goes everywhere": four lifestyle tiles.
13. Who it is for: five personas with a tailored sentence each.
14. Proof: photo review cards with city and "Verified Buyer"; survey stats only with a source line.
15. The three steps to use it.
16. The offer stack: "Act now and you get:" every item with its value, the total value, today's price, the button, "Not available on Amazon".
17. The comparison against the category, never a brand, with three states (✓ / ✗ / ⚠).
18. The cost stack ("Total: $5,930+. And many people STILL hurt." → "20x cheaper").
19. FAQ of six to twelve, then the review wall with the rating distribution, then the guarantee, then the disclaimer, then the sticky button.

Every CTA is followed by the guarantee line. Blocks: the buy box above,
`image-grid`, `headline`, `alternatives`, `image-with-text`, `multicolumn`,
`timeline`, `expert-quote`, `benefit-bullets`, `audience`, `review-wall`,
`steps`, `offer-stack`, `comparison`, `cost-stack`, `faq`, `guarantee`,
`sticky-cta`, `disclaimer`. Template: **Sales page**.

## The offer page (funnel, short form)

The page that turned 1.18x into 3.59x, and the shape of the Funnelish
"offer" page, which is the checkout: the saving above the fold with a timer
and the CTA; the trust bar; combined proof only when true; the problem
headline; the mechanism; the buy box with the tiers and the subscription
toggle; the objections; reviews; the sticky button. Template: **Offer page**.

## The advertorial

Two shapes are both current. The classic: publication bar → editorial
headline → byline → image → lead → numbered reasons or story beats with an
image each → pull-quote → comparison → review wall → the offer → FAQ →
guarantee → comments → sticky CTA → disclaimer. The brand-owned listicle
(Celinva, Primals): no masthead or byline, "Rated 4.7 • 12,000+ customers"
eyebrow → "N Reasons People Are Ditching [expensive alternative] & Choosing
This [category] for [outcome]" → an intro naming the mechanism → the
reasons in this order: 1 social proof, 2 the named material or mechanism, 3
the core benefit "without changing your X", 4 versatility, 5 the secondary
symptom, 6 the cost math, 7 authority plus the guarantee; a CTA after
reasons 3 and 5 with the guarantee line under it; each reason a bold key
phrase, an image or a video, and (Primals) an identical three-card "With
[product]:" block → a review wall → an embedded, transactable buy box with
tiers → the review feed → a second FAQ for the objections a reader has
after a listicle → trust strip. No price on the advertorial when it sends
to a PDP; one scary number repeated five times; one reason spent attacking
the cheap alternative.

Rules: it reads as editorial and teaches before it sells; a masthead
version says it is an advertisement.

## The quiz funnel

One question per screen, three to six screens, each answer a label the
buyer would use for themselves ("night shift", "light sleeper"). A progress
bar. The result names the sub-avatar back to them and presents the offer
built for them. Every step is an event, so the drop-off per question is
visible.

## The Shopify-style product page

Gallery (for cold traffic, infographic slides that sell before any scroll;
for a catalogue, a slide per variant and a detail macro) → breadcrumbs (a
catalogue) → the buy box above → sticky add-to-cart bar with the price →
below the fold, the argument in the order it recurs: problem or agitation →
the named mechanism with numbers → stages or timeline → expert or
peer-reviewed proof (study cards with a plain-English takeaway above the
quote, the journal and year, the reference, a class-of-device disclaimer)
→ comparison against categories → video or photo reviews → origin and
manufacturing with a captioned photo → guarantee restated → FAQ of six to
eight → the offer again. Ingredients or materials listed in full, every one
with what it does. The cart drawer sells: a reservation timer, the
free-shipping gap, one or two add-ons (a wrap, a warranty extension,
shipping protection), the guarantee line.

## Home and collections (store)

Home for one product is the Flovir shape: announcement with the offer and
its value, hero with three bullets, press, three sections with one idea and
one number each, the offer restated, a footer with the business address,
registration and hours. Home for a catalogue: announcement, hero, featured
collection with prices, proof, the guarantee and shipping strip,
testimonials, newsletter. Template: **Home page**.

A collection page: a header image, H1 and one-sentence differentiator per
collection; facet filters specific to the category with the measurement in
the label; sort; the card as badge → image → title → price with the
compare-at struck beside it → the after-code price on a third line → up to
three swatches and "+N" → the review count (shared across a product family
so a new colourway never says 0) → one CTA to the page; sold-out items stay
in the grid, marked; an empty state with words; adjacent collections
stacked below for cross-sell.

## The checkout

One page in Shopify's order, and it re-sells. Above the form: the timer,
the logo alone with no way out, an authority line and the guarantee, the
free-shipping promise with the arrival date. The bumps above or beside the
form, pre-checked, "Yes, I want X for only $Y" or "Add" with a dollar
saving, the larger tier first; a pre-checked shipping protection line
between the shipping method and payment; free shipping shown as a discount
from a price, never as plain "free"; the discount field inside the summary,
not by the button. Express pay first, then contact, delivery in Shopify's
exact field order, shipping method, payment with the wallet tabs and the
CVV helper. The summary within one scroll of the button on every viewport.
Under the button: the guarantee, the consent line with the renewal terms,
the trust strip, the guarantee card. Below everything, for the person who
scrolled past the form: reviews from credentialed sceptics and comment
screenshots. Then the one-click upsell, the downsell, the thank-you.

## Popups

One popup per store, triggered on exit intent, a delay, or scroll depth,
dismissed for a set number of days. It offers one thing (a code for an
email, a gift, the quiz), says how long the offer is valid ("Valid for 7
days after sign-up"), never blocks the buy box on mobile, and never shows on
the checkout or the funnel's offer page.

## Named things, numbers, compliance

Name the mechanism (from the research) and the material and the guarantee,
and use the names everywhere. Give every section one number. Repeat the
one scary or proud number five times. Reframe the root cause so the buyer
is absolved. Stack the offer (discount plus gifts with values) rather than
discounting alone. Layer proof: eyebrow, three mini quotes, named experts
with credentials, press, static cards with city, a real feed, video.
Compliance sits after the CTA: renewal terms under the button, "results
vary" under the timeline, the regulator disclaimer and the testimonial
line in the footer, the class-of-device note under the science.

## Speed

Server-rendered HTML, one inline stylesheet, one runtime script, fonts with
`display=swap`, images lazy below the fold, the hero preloaded, responses
compressed, uploads cached for a year. Every widget renders its value
server-side or renders nothing: never "0 bought", "$-/day", "00 Day 00 Hr".

## Accessibility and hygiene

Skip link, landmarks, one h1, headings in order, alt text on every image
(not the same SEO string on all of them), labels on every input, names on
every button, visible focus, contrast of at least 4.5:1, reduced motion
respected, timers and live regions announced politely. No template
residue: no "[confirm]" left in, no `#` dead links, no placeholder image,
no other store's icons or a sister brand's link, one number for the review
count everywhere. The health report checks each of these on each page.

## What to measure

Per page and per funnel step: sessions, scroll depth (25/50/75/100),
sections seen, CTA clicks, cart adds, purchases, revenue per session (AOV ×
conversion), and for a quiz the drop-off per question. Split tests decide on
revenue per session, not on conversion rate alone.
