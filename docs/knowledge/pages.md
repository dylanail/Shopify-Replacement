# Pages

What a page has to do, in what order, for each kind of page the platform
builds. Drawn from the course's winning page walk-through and from the
anatomy of the funnel builders and Shopify page builders the owner pointed
at (offer pages, advertorials, product pages, checkouts).

## The offer page (funnel landing page)

The page that turned 1.18x into 3.59x. Section order:

1. **Above the fold**: the saving stated ("Save $50 — ending soon") with a timer; hero image or video; primary CTA.
2. **Trust bar**: customer count, money-back guarantee, delivery speed, a credential, free shipping.
3. **Combined social proof**: rating and count across the brand, only when true.
4. **Problem headline** that shows the alternatives failing.
5. **Authority positioning**: "what professionals use, for a fraction of the cost."
6. **Story of the failed alternatives** and what each cost.
7. **Product reveal** with proof-of-work and the cost comparison.
8. **How it works**: video beside three or four bullets.
9. **More proof**: reviews, comments, emails.
10. **Buy box**: the same photo, offer badge, was/now, bundle tiers, guarantee, specs, shipping and returns.
11. **Deeper education** for the sceptic.
12. **FAQ**, then **reviews**, then the sticky CTA.

Blocks: `countdown`, `hero`, `trust-badges`, `headline`, `rich-text`,
`image-with-text`, `video`, `multicolumn`, `review-wall`, `buy-box` or
`bundle-offer`, `guarantee`, `faq`, `sticky-cta`, `footer`.

## The advertorial

Publication bar → headline (listicle, story, problem-agitate-solve, expert,
roundup, mistakes) → byline → image → lead paragraph → numbered reasons or
story beats with an image each → pull-quote → comparison → review wall → the
offer → FAQ → guarantee → comments → sticky CTA → disclaimer.

Rules: it reads as editorial, with the offer arriving after the reader has
been taught something; the disclaimer states it is an advertisement.

## The quiz funnel

One question per screen, three to six screens, each answer a label the
buyer would use for themselves ("night shift", "light sleeper"). A progress
bar. The result screen names the sub-avatar back to them and presents the
offer built for that sub-avatar. Every step is an event, so the drop-off per
question is visible.

## The Shopify-style product page

Gallery with a hero and thumbnails → breadcrumbs → rating → subtitle → title
→ price with compare-at → live signals → options → bundle tiers → add to
cart and buy now → micro-copy on shipping and returns → benefits → trust
row → guarantee → payment icons → below-the-fold: benefits with images,
comparison, specs, FAQ, shipping and guarantee, the detail, reviews,
questions → sticky bar. Home: announcement, hero, featured, story,
collection grid, reviews, newsletter, footer.

Blocks: `rating-strip`, `buy-box` or `bundle-offer`, `trust-badges`,
`delivery-estimate`, `guarantee`, `multicolumn`, `image-with-text`,
`how-it-works`, `specs`, `comparison`, `expert-quote`, `review-wall` with
the star breakdown, `ugc-gallery`, `faq`, `product-qa`, `sticky-cta`.

## The long-form sales page and the science page

The Checkout Champ sales page ("sp") is a product page that keeps going: the
gallery and one customer's words above the headline, the headline as the
question the reader is already asking, four check bullets, the ship-by
date, the first button, the guarantee, the product accordions; then the
problem in the reader's words, the numbers customers reported with where
they came from, "instead of" each alternative and what it costs, the
promise row, the timeline of what to expect, the comparison, the steps, the
value stack with the total and today's price, the professional who
reviewed it, the payment marks, the reviews with the star breakdown, the
offer, the questions, the sticky button.

The science page sells the mechanism: the claim with the rating under it,
the numbers, what is different, how it works in plain words, the studies
with journal, year, the finding and the link, what to expect and when, the
comparison, customers on camera, a note from the designer, the value stack,
the offer. Nothing on either page is invented: a number has a source, a
study has a link, a quote has a person.

Blocks: `gallery`, `pull-quote`, `stats`, `cost-comparison`, `timeline`,
`how-it-works`, `value-stack`, `expert-quote`, `studies`, `video-wall`,
`letter`, plus the offer-page set.

## The checkout

Order summary with the bump, express pay first, one form, shipping options,
trust, guarantee; then the one-click upsell, the downsell, the thank-you.

The funnel checkouts (Checkout Champ, Funnelish, the hosted ones on their own
subdomain) wrap the same form in more: the logo with a "secure checkout"
line and a support contact, the steps, a "your cart is reserved for 10:00"
timer, the product's rating right above the form, the expected arrival
date, the bundle tiers inside the checkout, the bump pre-checked before
payment (shipping protection or expedited shipping), the pay button with
the guarantee under it, then the reasons to finish — the guarantee, three
reviews, "why choose us", the questions people ask before paying, the
payment marks. The summary sits beside the form on desktop and collapses to
one line on a phone.

Blocks: `header`, `checkout-steps`, `countdown`, `rating-strip`,
`delivery-estimate`, `checkout-form` (with `order-summary` and `order-bump`
when the summary or the bump is placed on its own), `guarantee`,
`trust-badges`, `review-wall`, `multicolumn`, `faq`, `payment-icons`,
`footer`. A published page with the checkout role is the store's
`/checkout`.

## Popups

One popup per store, triggered on exit intent, a delay, or scroll depth,
dismissed for a set number of days. It offers one thing (a code, a gift, a
quiz) and never blocks the buy box on mobile.

## Speed

Server-rendered HTML, one inline stylesheet, one runtime script, fonts with
`display=swap`, images lazy below the fold, the hero preloaded, responses
compressed, uploads cached for a year. The health report measures each page
and says what is slow.

## Accessibility

Skip link, landmarks, one h1, headings in order, alt text on every image,
labels on every input, names on every button, visible focus, contrast of at
least 4.5:1 for text, reduced-motion respected, timers and live regions
announced politely. The health report checks each of these on each page.

## What to measure

Per page and per funnel step: sessions, scroll depth (25/50/75/100),
sections seen, CTA clicks, cart adds, purchases, revenue per session (AOV ×
conversion), and for a quiz the drop-off per question. Split tests decide on
revenue per session, not on conversion rate alone.
