import type { Brand, Theme } from '../domain/types.ts'

/**
 * The generated theme is CSS custom properties plus one stylesheet.
 *
 * Every brand decision the assistant makes — palette, fonts, radius, density —
 * lands in this token block, and the rest of the stylesheet only ever reads
 * tokens. That is what lets "make it darker and roomier" be a two-field edit
 * instead of a rewrite, and it is why the same markup can render as a 1920s
 * leather atelier or a white-cube gallery.
 */
export function themeCss(brand: Brand, theme: Theme): string {
  const primary = brand.primary ?? '#7a4a2b'
  const secondary = brand.secondary ?? '#5d1f28'
  const paper = brand.paper ?? '#f4ece1'
  const ink = brand.ink ?? '#241a14'
  const display = brand.displayFont ?? "'Playfair Display', Georgia, serif"
  const body = brand.bodyFont ?? "'Inter', ui-sans-serif, system-ui, sans-serif"
  const gap = theme.density === 'compact' ? '2.5rem' : '5rem'
  const gallery = theme.template === 'gallery'

  return `
:root{
  --primary:${primary}; --secondary:${secondary};
  --paper:${gallery ? '#ffffff' : paper}; --ink:${ink};
  --muted:color-mix(in srgb, var(--ink) 55%, var(--paper));
  --line:color-mix(in srgb, var(--ink) 14%, var(--paper));
  --raise:color-mix(in srgb, var(--paper) 92%, #ffffff);
  --radius:${theme.radius}; --section:${gap};
  --display:${display}; --body:${body};
  --measure:68ch;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--body);overflow-x:hidden}
img,svg{max-width:100%;height:auto;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--display);font-weight:400;line-height:1.06;letter-spacing:-.012em;margin:0}
h1{font-size:clamp(2.4rem,6vw,4.4rem)}
h2{font-size:clamp(1.7rem,3.4vw,2.6rem)}
h3{font-size:1.15rem}
p{margin:0 0 1rem;max-width:var(--measure)}
.wrap{width:min(1180px,92vw);margin-inline:auto}
.eyebrow{font:500 11px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:var(--ink);color:var(--paper);
  border:1px solid var(--ink);border-radius:var(--radius);padding:.95rem 1.6rem;font:500 14px/1 var(--body);
  letter-spacing:.06em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:background .18s,color .18s}
.btn:hover{background:var(--primary);border-color:var(--primary)}
.btn--ghost{background:transparent;color:var(--ink)}
.btn--ghost:hover{background:var(--ink);color:var(--paper)}
.btn--wide{width:100%;padding:1.15rem}
.announce{background:var(--secondary);color:#fff;font:500 11px/1 var(--body);letter-spacing:.18em;
  text-transform:uppercase;text-align:center;padding:.72rem 1rem}
header.site{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--paper) 88%,transparent);
  backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.site .row{display:flex;align-items:center;gap:2rem;padding:1rem 0}
.brandmark{display:flex;align-items:center;gap:.7rem;text-decoration:none;flex:0 0 auto}
.brandmark img{width:36px;height:36px;border-radius:var(--radius)}
.brandmark .name{font-family:var(--display);font-size:1.25rem;letter-spacing:.06em;text-transform:uppercase}
.brandmark .sub{font:500 9px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
nav.main{display:flex;gap:1.6rem;margin-left:auto;font:500 12px/1 var(--body);letter-spacing:.14em;text-transform:uppercase}
nav.main a{text-decoration:none;padding-block:.4rem;border-bottom:1px solid transparent}
nav.main a:hover{border-color:var(--ink)}
.tools{display:flex;gap:1rem;align-items:center;font:500 12px/1 var(--body);letter-spacing:.1em;text-transform:uppercase}
.hero{position:relative;display:grid;place-items:center;min-height:${gallery ? '58vh' : '72vh'};overflow:hidden;text-align:center}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
/* Generated hero art can come back light or dark, and the headline has to stay
   readable over either. A scrim is the only version of this that always works. */
.hero::after{content:'';position:absolute;inset:0;background:${
  gallery
    ? 'linear-gradient(to bottom, rgba(255,255,255,.42), rgba(255,255,255,.72))'
    : 'radial-gradient(46% 42% at 50% 44%, rgba(0,0,0,.58), rgba(0,0,0,.16) 68%, rgba(0,0,0,.30))'
};z-index:1}
.hero .inner{position:relative;z-index:2;padding:5rem 1rem;max-width:44rem}
.hero h1{color:${gallery ? 'var(--ink)' : '#fff'};text-shadow:${gallery ? 'none' : '0 2px 30px rgba(0,0,0,.35)'}}
.hero p{color:${gallery ? 'var(--muted)' : 'rgba(255,255,255,.9)'};margin-inline:auto;font-size:1.05rem}
section{padding-block:var(--section)}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:2rem;margin-bottom:2.4rem;flex-wrap:wrap}
.grid{display:grid;gap:1.6rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.card{display:block;text-decoration:none;background:var(--raise);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.card figure{margin:0;aspect-ratio:1;background:var(--line);overflow:hidden}
.card img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.card:hover img{transform:scale(1.035)}
.card .body{padding:1rem 1.1rem 1.3rem}
.card .title{font-family:var(--display);font-size:1.15rem}
.card .sub{color:var(--muted);font-size:.86rem;margin:.25rem 0 .6rem}
.card .price{font-variant-numeric:tabular-nums}
.pdp{display:grid;gap:3.5rem;grid-template-columns:1.05fr .95fr;align-items:start;padding-block:3rem}
.gallery .main{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--raise);aspect-ratio:1}
.gallery .main img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:.6rem;margin-top:.7rem}
.thumbs button{padding:0;border:1px solid var(--line);background:none;border-radius:var(--radius);
  width:78px;aspect-ratio:1;overflow:hidden;cursor:pointer}
.thumbs button[aria-current=true]{border-color:var(--ink)}
.buybox{position:sticky;top:6rem;display:flex;flex-direction:column;gap:1.1rem}
.crumbs{font-size:.8rem;color:var(--muted)}
.crumbs a{text-decoration:none}
.rating{display:flex;align-items:center;gap:.55rem;font-size:.86rem;color:var(--muted)}
.stars{color:var(--primary);letter-spacing:.12em}
.price-lg{font-size:1.5rem;font-variant-numeric:tabular-nums}
.opt{display:flex;flex-direction:column;gap:.55rem}
.opt .label{font:500 11px/1 var(--body);letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.pills{display:flex;flex-wrap:wrap;gap:.5rem}
.pill{border:1px solid var(--line);border-radius:var(--radius);background:var(--raise);
  padding:.6rem 1rem;font:500 13px/1 var(--body);cursor:pointer}
.pill[aria-pressed=true]{border-color:var(--ink);background:var(--ink);color:var(--paper)}
.swatches{display:flex;gap:.6rem}
.swatch{width:32px;height:32px;border-radius:999px;border:2px solid var(--line);cursor:pointer;padding:0}
.swatch[aria-pressed=true]{border-color:var(--ink);outline:2px solid var(--paper);outline-offset:-5px}
.buildopts{display:flex;flex-direction:column;gap:.6rem}
.buildopt{display:flex;gap:.75rem;align-items:center;border:1px solid var(--line);border-radius:var(--radius);
  padding:.9rem 1rem;cursor:pointer;background:var(--raise)}
.buildopt[data-selected=true]{border-color:var(--ink)}
.buildopt strong{font-weight:600}
.buildopt small{color:var(--muted);display:block}
.trust{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;font-size:.8rem;color:var(--muted);
  border-top:1px solid var(--line);padding-top:1rem}
.benefits{list-style:none;margin:0;padding:0;display:grid;gap:.35rem;font-size:.9rem}
.benefits li::before{content:'—';color:var(--primary);margin-right:.5rem}
.guarantee{display:flex;gap:.8rem;align-items:flex-start;border:1px solid var(--line);border-radius:var(--radius);padding:.9rem 1rem;background:var(--raise)}
.guarantee .badge{flex:0 0 auto;width:40px;height:40px;border-radius:999px;display:grid;place-items:center;background:var(--primary);color:#fff;font:600 13px/1 var(--body)}
.conv{padding-block:calc(var(--section) * .6);border-top:1px solid var(--line)}
.benefit-grid{display:grid;gap:1.4rem;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.benefit .n{font:500 11px/1 var(--body);letter-spacing:.2em;color:var(--primary)}
.benefit h3{margin:.5rem 0 .4rem;font-size:1.25rem}
.benefit p{font-size:.92rem;color:var(--muted);margin:0}
.tablewrap{overflow-x:auto}
table.compare{width:100%;border-collapse:collapse;font-size:.92rem}
table.compare th,table.compare td{text-align:left;padding:.85rem .9rem;border-bottom:1px solid var(--line);vertical-align:top}
table.compare thead th{font:500 11px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
table.compare tbody th{font-weight:500;color:var(--muted);width:9rem}
table.compare .us{background:color-mix(in srgb,var(--primary) 8%,var(--paper));font-weight:500}
table.compare thead th.us{color:var(--primary)}
.two-col{display:grid;gap:3rem;grid-template-columns:1fr 1.2fr;align-items:start}
.specs{margin:.8rem 0 0;display:grid;gap:0}
.specs div{display:grid;grid-template-columns:8rem 1fr;gap:1rem;padding:.6rem 0;border-bottom:1px solid var(--line);font-size:.92rem}
.specs dt{color:var(--muted)}.specs dd{margin:0}
details.faq{border-bottom:1px solid var(--line);padding:.7rem 0}
details.faq summary{cursor:pointer;font-weight:500;list-style:none;display:flex;justify-content:space-between;gap:1rem}
details.faq summary::after{content:'+';color:var(--muted)}
details.faq[open] summary::after{content:'–'}
details.faq p{margin:.6rem 0 0;color:var(--muted);font-size:.92rem}
.promise{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));border:1px solid var(--line);border-radius:var(--radius);padding:1.6rem;background:var(--raise)}
.promise p{font-size:.92rem;margin:.4rem 0 0}
.stickybar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:1rem;
  padding:.7rem 1rem;background:var(--paper);border-top:1px solid var(--line);transform:translateY(110%);transition:transform .25s ease}
.stickybar.show{transform:none}
.stickybar .t{font-family:var(--display);font-size:1rem}.stickybar .p{font-size:.85rem;color:var(--muted)}
.stickybar .btn{padding:.8rem 1.2rem}
.micro{font-size:.84rem;color:var(--muted)}
.prose{max-width:var(--measure)}
.reviews{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.review{border:1px solid var(--line);border-radius:var(--radius);padding:1.2rem;background:var(--raise)}
.review .who{font-size:.8rem;color:var(--muted);margin-top:.7rem}
.reply{border-left:2px solid var(--primary);margin-top:.8rem;padding-left:.8rem;font-size:.88rem;color:var(--muted)}
.bars{display:grid;gap:.35rem;max-width:22rem}
.bar{display:grid;grid-template-columns:2.4rem 1fr 2.4rem;gap:.6rem;align-items:center;font-size:.8rem;color:var(--muted)}
.bar .track{height:6px;background:var(--line);border-radius:999px;overflow:hidden}
.bar .fill{height:100%;background:var(--primary)}
table.lines{width:100%;border-collapse:collapse}
table.lines td{padding:.85rem 0;border-bottom:1px solid var(--line);vertical-align:middle}
table.lines img{width:64px;height:64px;object-fit:cover;border-radius:var(--radius)}
.totals{margin-left:auto;max-width:22rem;width:100%}
.totals div{display:flex;justify-content:space-between;padding:.35rem 0}
.totals .grand{border-top:1px solid var(--line);margin-top:.5rem;padding-top:.8rem;font-size:1.15rem}
.field{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.9rem}
.field label{font:500 11px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
input,select,textarea{font:inherit;padding:.8rem .9rem;border:1px solid var(--line);border-radius:var(--radius);
  background:var(--raise);color:inherit;width:100%}
input[type=checkbox],input[type=radio]{width:auto;padding:0;flex:0 0 auto;accent-color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--primary);outline-offset:-1px}
.two{display:grid;gap:.9rem;grid-template-columns:1fr 1fr}
.notice{border:1px solid var(--line);border-left:3px solid var(--primary);padding:.9rem 1.1rem;border-radius:var(--radius);background:var(--raise)}
.gap{display:flex;gap:.6rem;align-items:center;font-size:.86rem;color:var(--muted)}
.gap .track{flex:1;height:5px;background:var(--line);border-radius:999px;overflow:hidden}
.gap .fill{height:100%;background:var(--primary)}
footer.site{background:color-mix(in srgb,var(--ink) 92%,#000);color:color-mix(in srgb,var(--paper) 80%,#fff);margin-top:var(--section)}
footer.site .wrap{display:grid;gap:2.4rem;grid-template-columns:2fr 1fr 1fr;padding-block:3.4rem}
footer.site a{color:inherit;text-decoration:none;opacity:.78;display:block;padding:.22rem 0;font-size:.9rem}
footer.site a:hover{opacity:1}
footer .word{font-family:var(--display);font-size:1.8rem;letter-spacing:.1em;text-transform:uppercase}
.exit-intent{border:1px solid var(--line);border-radius:var(--radius);padding:2rem;max-width:26rem;background:var(--paper);color:var(--ink)}
.exit-intent::backdrop{background:rgba(0,0,0,.5)}
.exit-intent .code{font-family:var(--display);font-size:1.6rem;letter-spacing:.14em}
.upsell{border:1px solid var(--line);border-radius:var(--radius);padding:1rem;display:grid;gap:.8rem;background:var(--raise)}
.upsell .row{display:flex;gap:.8rem;align-items:center}
.upsell img{width:52px;height:52px;object-fit:cover;border-radius:var(--radius)}
.upsell .row form{margin-left:auto}
@media (max-width:900px){
  .pdp{grid-template-columns:1fr;gap:2rem}
  .two-col{grid-template-columns:1fr;gap:2rem}
  .buybox{position:static}
  footer.site .wrap{grid-template-columns:1fr 1fr}
  nav.main{display:none}
}
`
}

/** Google Fonts are the only external request the storefront makes. */
export function fontLink(brand: Brand): string {
  const families = new Set<string>()
  for (const stack of [brand.displayFont, brand.bodyFont]) {
    const first = /'([^']+)'/.exec(stack ?? '')?.[1]
    if (first) families.add(first.replace(/ /g, '+'))
  }
  if (!families.size) return ''
  const query = [...families].map((family) => `family=${family}:wght@300;400;500;600`).join('&')
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`
}
