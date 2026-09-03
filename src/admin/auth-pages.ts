import { escapeHtml } from '../lib/http.ts'
import { MODES } from '../control/build.ts'

const EXAMPLES = [
  'A hand-stitched boxing gear store called Ironjaw & Co, 1920s heritage leather atelier in Mexico City',
  'A clinical skincare brand with three products and a very plain white storefront',
  'A single-origin coffee roaster in Lisbon selling subscriptions',
  'A ceramics studio in Kyoto selling mugs, bowls and stem vases',
]

function frame(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Amboras</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;500&display=swap">
<style>
:root{--paper:#faf7f3;--ink:#1c1a17;--muted:#7d746a;--line:#e6ded3;--accent:#7a4a2b}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 'Inter',ui-sans-serif,system-ui,sans-serif;
  min-height:100vh;display:grid;place-items:center;padding:2rem 1rem}
.sheet{width:min(560px,100%);background:#fff;border:1px solid var(--line);border-radius:16px;padding:2.2rem 2.2rem 2rem}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:2rem;margin:0 0 .3rem;line-height:1.1}
p.lead{color:var(--muted);margin:0 0 1.6rem}
.field{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.9rem}
.field label{font:500 11px/1 'Inter',ui-sans-serif,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
input,textarea,select{font:inherit;padding:.75rem .85rem;border:1px solid var(--line);border-radius:10px;background:#fff;width:100%;color:inherit}
textarea{resize:vertical;min-height:96px}
button{background:var(--ink);color:#fff;border:0;border-radius:10px;padding:.85rem 1.4rem;font:500 14px/1 'Inter',ui-sans-serif,system-ui,sans-serif;cursor:pointer;width:100%}
button:hover{background:var(--accent)}
.muted{color:var(--muted)}
.alt{margin-top:1.2rem;font-size:13px;color:var(--muted);text-align:center}
.alt a{color:var(--accent)}
.err{border:1px solid #e5c4c0;background:#fdf3f2;color:#8a2018;border-radius:10px;padding:.7rem .9rem;margin-bottom:1rem;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2rem 0 1.2rem}
.chips button{width:auto;background:#fff;color:var(--ink);border:1px solid var(--line);font-size:12px;padding:.45rem .7rem;text-align:left}
.chips button:hover{border-color:var(--ink);background:#fff}
.plans{display:grid;gap:.5rem;grid-template-columns:repeat(2,1fr);margin-bottom:1.2rem}
.plan{border:1px solid var(--line);border-radius:10px;padding:.7rem;font-size:12.5px;cursor:pointer;display:block}
.plan input{width:auto;margin-right:.4rem}
.plan strong{display:inline}
.steps{display:grid;gap:.4rem;margin:1.4rem 0 0;font-size:12.5px;color:var(--muted)}
.steps div{display:flex;gap:.5rem}
.steps i{width:6px;height:6px;border-radius:999px;background:var(--accent);margin-top:.55rem;flex:0 0 auto}
</style></head><body><div class="sheet">${inner}</div></body></html>`
}

export function authPage(mode: 'login' | 'register', error: string | null): string {
  const isLogin = mode === 'login'
  return frame(isLogin ? 'Sign in' : 'Get started', `
    <h1>${isLogin ? 'Sign in' : 'Type one sentence.<br>See your store.'}</h1>
    <p class="lead">${isLogin ? 'Welcome back.' : 'An account, then a sentence. The store exists about a second later.'}</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/${mode}">
      ${isLogin ? '' : '<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name"></div>'}
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required
        minlength="10" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></div>
      ${isLogin ? '' : '<p class="muted" style="font-size:12px;margin:-.3rem 0 1rem">At least ten characters.</p>'}
      <button type="submit">${isLogin ? 'Sign in' : 'Create account'}</button>
    </form>
    <p class="alt">${isLogin ? 'No account yet? <a href="/register">Get started</a>' : 'Already have one? <a href="/login">Sign in</a>'}</p>`)
}

export function onboardingPage(name: string, error: string | null, storeCount = 0): string {
  return frame('Build your store', `
    <p class="alt" style="text-align:left;margin:0 0 1rem"><a href="/admin/stores">${storeCount ? `← Your stores (${storeCount})` : '← Your account'}</a></p>
    <h1>What are you selling?</h1>
    <p class="lead">One sentence, ${escapeHtml(name.split(/[\s@]/)[0] ?? 'there')}. Research runs first; then naming, brand, three products with pages and imagery, and the promotions all run at once.</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/onboarding" enctype="multipart/form-data">
      <div class="field"><label for="prompt">Your store, in a sentence</label>
        <textarea id="prompt" name="prompt" required placeholder="${escapeHtml(EXAMPLES[0] ?? '')}"></textarea></div>
      <div class="chips">${EXAMPLES.map((example) => `<button type="button" onclick="document.getElementById('prompt').value=${escapeHtml(JSON.stringify(example))}">${escapeHtml(example.slice(0, 46))}…</button>`).join('')}</div>
      <div class="field"><label for="photo">A product photo (optional)</label>
        <input id="photo" name="photo" type="file" accept="image/*">
        <span class="muted" style="font-size:12px">Product imagery is derived from this photo — staged into six scenes, not replaced with a stranger.</span></div>
      <div class="field"><label for="siteUrl">Your existing site (optional)</label>
        <input id="siteUrl" name="siteUrl" type="url" placeholder="https://yourbrand.com">
        <span class="muted" style="font-size:12px">Read for positioning and copy during research.</span></div>
      <fieldset class="field" style="border:0;padding:0;margin:0 0 1rem"><legend style="font-size:13px;margin-bottom:.4rem">How will you build it?</legend>
        ${MODES.map((mode, index) => `<label style="display:flex;gap:.6rem;align-items:flex-start;font-size:13px;margin-bottom:.4rem"><input type="radio" name="mode" value="${mode.id}" ${index === 2 ? 'checked' : ''} style="margin-top:.2rem"><span><strong>${escapeHtml(mode.name)}</strong><br><span class="muted" style="font-size:12px">${escapeHtml(mode.description)}</span></span></label>`).join('')}</fieldset>
      <button type="submit">Build my store</button>
    </form>
    <div class="steps">
      <div><i></i><span>Researches who buys this, what stops them, and what they pay</span></div>
      <div><i></i><span>Names the brand and picks a palette, fonts and a mark</span></div>
      <div><i></i><span>Writes three products with full pages, variants, prices and imagery</span></div>
      <div><i></i><span>Sets a welcome code, a free-shipping threshold and a bundle</span></div>
      <div><i></i><span>Builds the storefront and hands you the address</span></div>
    </div>`)
}
