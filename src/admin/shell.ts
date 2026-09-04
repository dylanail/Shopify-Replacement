import { escapeHtml } from '../lib/http.ts'
import type { Store } from '../control/stores.ts'
import type { Todo } from '../control/todos.ts'
import type { ChatMessage } from '../agent/chat.ts'
import { SUGGESTIONS } from '../agent/chat.ts'
import type { Artifact } from '../agent/registry.ts'

export type NavItem = { key: string; href: string; label: string; glyph: string; area?: string }

/** The rail, in the order the screenshot shows it. */
export const NAV: NavItem[] = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard', glyph: '▦' },
  { key: 'ai', href: '/admin/ai', label: 'Assistant', glyph: '◮' },
  { key: 'orders', href: '/admin/orders', label: 'Orders', glyph: '▤', area: 'orders' },
  { key: 'products', href: '/admin/products', label: 'Products', glyph: '◫', area: 'products' },
  { key: 'build', href: '/admin/build', label: 'Build', glyph: '⚒', area: 'store' },
  { key: 'research', href: '/admin/research', label: 'Research & avatars', glyph: '◎', area: 'products' },
  { key: 'market', href: '/admin/market', label: 'Market', glyph: '◐', area: 'products' },
  { key: 'creative', href: '/admin/creative', label: 'Creative', glyph: '◧', area: 'products' },
  { key: 'ads', href: '/admin/ads', label: 'Ads', glyph: '◭', area: 'ads' },
  { key: 'collections', href: '/admin/collections', label: 'Collections', glyph: '◇', area: 'organization' },
  { key: 'customers', href: '/admin/customers', label: 'Customers', glyph: '▣', area: 'customers' },
  { key: 'promotions', href: '/admin/promotions', label: 'Promotions', glyph: '◈', area: 'promotions' },
  { key: 'analytics', href: '/admin/analytics', label: 'Analytics', glyph: '▥', area: 'analytics' },
  { key: 'cro', href: '/admin/cro', label: 'Experiments', glyph: '◒', area: 'analytics' },
  { key: 'pages', href: '/admin/pages', label: 'Pages & funnels', glyph: '▤', area: 'store' },
  { key: 'funnels', href: '/admin/funnels', label: 'Funnels', glyph: '⏷', area: 'store' },
  { key: 'bundles', href: '/admin/bundles', label: 'Bundles', glyph: '⧉', area: 'promotions' },
  { key: 'profit', href: '/admin/profit', label: 'Profit', glyph: '$', area: 'analytics' },
  { key: 'store', href: '/admin/store', label: 'Store designer', glyph: '◔', area: 'store' },
  { key: 'marketing', href: '/admin/marketing', label: 'Email & SEO', glyph: '⚌', area: 'emails' },
  { key: 'settings', href: '/admin/settings', label: 'Settings', glyph: '⚏', area: 'setup' },
]

export type ShellInput = {
  store: Store
  stores: Store[]
  active: string
  title: string
  body: string
  todos: Todo[]
  messages: ChatMessage[]
  publish: { label: string; ready: boolean; reason: string }
  userName: string
  storeUrl: string
  /** Which model answers the panel, for the header line. */
  modelLabel?: string
}

/**
 * The admin shell.
 *
 * Three columns, exactly as the product is drawn: a 44px icon rail, the page,
 * and a 300px assistant panel that persists across every page. The panel is
 * part of the frame rather than a page component because the conversation has
 * to survive navigation — one thread across the whole admin, with the current
 * page passed along as context on every message.
 */
export function shell(input: ShellInput): string {
  const brand = input.store.brand
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)} — ${escapeHtml(input.store.name)} on Amboras</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;500&display=swap">
<style>${css(brand.primary ?? '#7a4a2b')}</style>
</head><body>
<div class="top">
  <div class="logo">◮ <strong>Amboras</strong></div>
  <form method="get" action="/admin/switch" class="switcher">
    <select name="storeId" onchange="this.form.submit()" aria-label="Store">
      ${input.stores.map((store) => `<option value="${escapeHtml(store.id)}" ${store.id === input.store.id ? 'selected' : ''}>${escapeHtml(store.name)}</option>`).join('')}
    </select>
  </form>
  <a class="chip" href="/admin/stores">Stores (${input.stores.length})</a>
  <a class="chip" href="/onboarding">+ New store</a>
  <div class="spacer"></div>
  <a class="chip" href="${escapeHtml(input.storeUrl)}" target="_blank" rel="noopener">View store ↗</a>
  <form method="post" action="/admin/publish">
    <button class="publish" type="submit" ${input.publish.ready ? '' : 'disabled'} title="${escapeHtml(input.publish.reason)}">${escapeHtml(input.publish.label)}</button>
  </form>
</div>
<div class="frame">
  <nav class="rail" aria-label="Sections">
    ${NAV.map(
      (item) => `<a href="${item.href}" class="${item.key === input.active ? 'on' : ''}" title="${escapeHtml(item.label)}"
        data-area="${item.area ?? ''}"><span>${item.glyph}</span><b>${escapeHtml(item.label)}</b><i class="dot"></i></a>`,
    ).join('')}
    <div class="rail-foot"><span class="avatar">${escapeHtml(input.userName.slice(0, 1).toUpperCase())}</span></div>
  </nav>
  <main class="page">${input.body}</main>
  <aside class="panel">
    <header>
      <div class="panel-title">◮ Amboras Business Assistant <span class="beta">Beta</span></div>
      <p class="muted">It runs the tools. It does not tell you where to click.${input.modelLabel ? ` ${escapeHtml(input.modelLabel)}.` : ''}</p>
    </header>
    <div class="thread" id="thread">
      ${input.messages.length
        ? input.messages.map(bubble).join('')
        : `<div class="empty"><p class="muted">Ask for something. It will do it and tell you what changed.</p></div>`}
    </div>
    ${input.messages.length ? '' : `<div class="suggestions">${SUGGESTIONS.map((suggestion) => `<button type="button" onclick="askThis(${escapeHtml(JSON.stringify(suggestion.prompt))})"><span>◔</span> ${escapeHtml(suggestion.label)}</button>`).join('')}</div>`}
    <form class="composer" method="post" action="/admin/ask" id="composer">
      <input type="hidden" name="page" value="${escapeHtml(input.active)}">
      <textarea name="text" id="ask" rows="2" placeholder="Ask a question, or tell it what to change…" required></textarea>
      <div class="composer-row">
        <span class="confirm">Edits land on the draft; publish when it looks right.</span>
        <button class="send" type="submit" aria-label="Send">▶</button>
      </div>
    </form>
    <div class="next">
      <div class="eyebrow">Next steps</div>
      ${input.todos.map((todo) => `<a class="todo ${todo.status}" href="/admin${todo.href}"><i></i><span>${escapeHtml(todo.label)}</span></a>`).join('')}
    </div>
  </aside>
</div>
<script>
function askThis(prompt){ var box = document.getElementById('ask'); box.value = prompt; box.focus(); }
(function(){
  var thread = document.getElementById('thread'); if (thread) thread.scrollTop = thread.scrollHeight;
  var form = document.getElementById('composer');
  form && form.addEventListener('submit', function(){
    var button = form.querySelector('.send'); button.disabled = true; button.textContent = '…';
  });
  document.getElementById('ask') && document.getElementById('ask').addEventListener('keydown', function(event){
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') form.requestSubmit();
  });
  // Activity dots: the rail lights up the area a tool is touching, live.
  try {
    var stream = new EventSource('/admin/activity');
    stream.addEventListener('activity', function(event){
      var data = JSON.parse(event.data);
      if (!data.area) return;
      var link = document.querySelector('.rail a[data-area="' + data.area + '"]');
      if (!link) return;
      link.classList.remove('running','done','failed');
      link.classList.add(data.status || 'running');
      if (data.status !== 'running') setTimeout(function(){ link.classList.remove('done','failed') }, 6000);
    });
  } catch (error) { /* activity dots are decoration; never break the admin */ }
})();
</script>
</body></html>`
}

function bubble(message: ChatMessage): string {
  return `<div class="msg ${message.role}">
    <div class="who">${message.role === 'user' ? 'You' : 'Assistant'}${message.page ? ` · ${escapeHtml(message.page)}` : ''}</div>
    <div class="text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    ${message.artifacts.map(renderArtifact).join('')}
  </div>`
}

export function renderArtifact(artifact: Artifact): string {
  switch (artifact.type) {
    case 'product':
      return `<a class="art product" href="/admin/products/${escapeHtml(artifact.id)}">
        ${artifact.image ? `<img src="${escapeHtml(artifact.image)}" alt="">` : ''}<span>${escapeHtml(artifact.title)}</span></a>`
    case 'image':
      return `<div class="art sheet">${artifact.urls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(artifact.caption)}">`).join('')}</div>`
    case 'link':
      return `<a class="art link" href="${escapeHtml(artifact.href)}">${escapeHtml(artifact.label)} →</a>`
    case 'table':
      return `<div class="art tablewrap"><table><thead><tr>${artifact.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>${artifact.rows.slice(0, 12).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${artifact.caption ? `<div class="cap">${escapeHtml(artifact.caption)}</div>` : ''}</div>`
    case 'note':
      return `<pre class="art note">${escapeHtml(artifact.text)}</pre>`
    default:
      return ''
  }
}

function css(accent: string): string {
  return `
:root{--paper:#f6f6f4;--card:#fff;--ink:#1f2520;--muted:#6d746e;--line:#e0e3df;--accent:${accent};--ok:#24805a;--warn:#a76b12;--bad:#b3261e;--rail:188px;--panel:320px}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 'Inter',ui-sans-serif,system-ui,sans-serif}
a{color:inherit}
h1,h2,h3{margin:0;font-weight:500}
.serif{font-family:'Playfair Display',Georgia,serif;font-weight:400}
.muted{color:var(--muted)}
.eyebrow{font:500 10px/1 'Inter';letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.top{position:sticky;top:0;z-index:50;height:52px;display:flex;align-items:center;gap:.65rem;padding:0 .85rem;
  background:#18211b;color:#fff;border-bottom:1px solid #2d382f;box-shadow:0 2px 12px #1720191a}
.top .logo{font-size:14px;letter-spacing:.02em}
.top .spacer{flex:1}
.switcher select{border:1px solid #455048;border-radius:8px;padding:.35rem .55rem;background:#222d25;color:#fff;font:inherit;font-size:12px;max-width:180px}
.chip{border:1px solid #455048;background:#222d25;color:#fff;border-radius:8px;padding:.4rem .75rem;font:500 12px/1 'Inter';
  cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:.35rem}
.chip:hover{border-color:#7d8b80;background:#2b382e}
.publish{background:#fff;color:#18211b;border:0;border-radius:8px;padding:.55rem 1rem;font:600 12px/1 'Inter',ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.publish:disabled{background:var(--line);color:var(--muted);cursor:not-allowed}
.frame{display:grid;grid-template-columns:var(--rail) minmax(0,1fr) var(--panel);min-height:calc(100vh - 52px)}
.rail{background:#eef0ed;border-right:1px solid var(--line);display:flex;flex-direction:column;padding:.65rem .55rem;gap:.12rem;position:sticky;top:52px;height:calc(100vh - 52px);overflow-y:auto}
.rail a{position:relative;width:100%;min-height:32px;display:flex;align-items:center;gap:.65rem;border-radius:8px;padding:.3rem .55rem;text-decoration:none;color:#555e56;font-size:14px}
.rail a span{width:20px;text-align:center;font-size:15px;flex:0 0 auto}.rail a b{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail a:hover{background:#e2e6e1;color:var(--ink)}
.rail a.on{background:#d8e2da;color:#173d29;box-shadow:inset 3px 0 #24805a}
.rail .dot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:999px;background:transparent}
.rail a.running .dot{background:var(--warn);animation:pulse 1s infinite}
.rail a.done .dot{background:var(--ok)}
.rail a.failed .dot{background:var(--bad)}
@keyframes pulse{50%{opacity:.35}}
.rail-foot{margin-top:auto;padding:.4rem .45rem}
.avatar{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;font-weight:600}
.page{padding:1.65rem 1.8rem 4rem;min-width:0;max-width:1480px;width:100%;margin:0 auto}
.panel{border-left:1px solid var(--line);background:#fff;display:flex;flex-direction:column;position:sticky;top:52px;height:calc(100vh - 52px)}
.panel header{padding:1rem 1rem .6rem;border-bottom:1px solid var(--line)}
.panel-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:.4rem}
.beta{font:500 9px/1 'Inter';letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:.2rem .4rem;color:var(--muted)}
.panel header p{margin:.35rem 0 0;font-size:11.5px}
.thread{flex:1;overflow-y:auto;padding:.9rem;display:flex;flex-direction:column;gap:.9rem}
.msg .who{font:500 10px/1 'Inter';letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.3rem}
.msg .text{font-size:13px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem;white-space:normal}
.msg.user .text{background:var(--ink);color:#fff;border-color:var(--ink)}
.empty{margin:auto;text-align:center;padding:1rem;font-size:12.5px}
.suggestions{display:grid;gap:.3rem;padding:0 .9rem .6rem}
.suggestions button{text-align:left;border:1px solid var(--line);background:#fff;border-radius:8px;padding:.5rem .6rem;font:inherit;font-size:12.5px;cursor:pointer;display:flex;gap:.5rem}
.suggestions button:hover{border-color:var(--ink)}
.composer{border-top:1px solid var(--line);padding:.7rem}
.composer textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:.6rem;font:inherit;font-size:13px;resize:vertical}
.composer-row{display:flex;align-items:center;gap:.5rem;margin-top:.45rem}
.confirm{font-size:11px;color:var(--muted);display:flex;gap:.3rem;align-items:center;flex:1}
.send{margin-left:auto;border:0;background:var(--ink);color:#fff;border-radius:8px;width:34px;height:30px;cursor:pointer}
.next{border-top:1px solid var(--line);padding:.7rem .9rem 1rem;max-height:32vh;overflow:auto}
.todo{display:flex;gap:.5rem;align-items:flex-start;text-decoration:none;font-size:12px;padding:.3rem 0;color:var(--muted)}
.todo i{width:7px;height:7px;border-radius:999px;background:var(--line);margin-top:.42rem;flex:0 0 auto}
.todo.done{color:var(--muted);text-decoration:line-through}
.todo.done i{background:var(--ok)}
.todo.in_progress i{background:var(--warn)}
.todo:hover{color:var(--ink)}
.art{display:block;margin-top:.5rem;font-size:12px}
.art.product{display:flex;gap:.5rem;align-items:center;border:1px solid var(--line);border-radius:10px;padding:.4rem;text-decoration:none}
.art.product img{width:38px;height:38px;object-fit:cover;border-radius:6px}
.art.sheet{display:grid;grid-template-columns:repeat(4,1fr);gap:.25rem}
.art.sheet img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
.art.link{color:var(--accent);text-decoration:none}
.art.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
.art table{border-collapse:collapse;width:100%;font-size:11.5px}
.art th{text-align:left;font-weight:500;color:var(--muted);padding:.4rem .5rem;border-bottom:1px solid var(--line)}
.art td{padding:.35rem .5rem;border-bottom:1px solid var(--line)}
.art .cap{padding:.35rem .5rem;color:var(--muted);font-size:11px}
.art.note{white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:.6rem;font:12px/1.5 ui-monospace,monospace;overflow-x:auto}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.2rem}
.head h1{font-family:'Playfair Display',Georgia,serif;font-size:1.7rem}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden;margin-bottom:1.2rem}
.kpi{padding:.9rem 1rem;border-right:1px solid var(--line)}
.kpi:last-child{border-right:0}
.kpi .label{font-size:11px;color:var(--muted)}
.kpi .value{font-size:1.35rem;font-variant-numeric:tabular-nums;margin-top:.15rem}
.kpi .delta{font-size:11px;color:var(--ok)}
.kpi .delta.neg{color:var(--bad)}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:1rem 1.1rem;margin-bottom:1rem;box-shadow:0 1px 2px #14201808}
.card > h2{font-size:1rem;margin-bottom:.15rem}
.grid2{display:grid;gap:1rem;grid-template-columns:1.6fr 1fr;align-items:start}
.grid3{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
table.data{width:100%;border-collapse:collapse;font-size:13px}
table.data th{text-align:left;font-weight:500;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:.5rem .6rem;border-bottom:1px solid var(--line)}
table.data td{padding:.6rem;border-bottom:1px solid var(--line);vertical-align:middle}
table.data tr:last-child td{border-bottom:0}
table.data img{width:36px;height:36px;object-fit:cover;border-radius:6px}
.tag{display:inline-flex;align-items:center;gap:.3rem;font-size:11px;border:1px solid var(--line);border-radius:999px;padding:.15rem .5rem;color:var(--muted)}
.tag.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--line))}
.tag.warn{color:var(--warn)}
.tag.bad{color:var(--bad)}
.tabs{display:flex;gap:.4rem;margin-bottom:.9rem;flex-wrap:wrap}
.tabs a{font-size:12px;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:.3rem .75rem;background:#fff}
.tabs a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.btn{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--line);background:#fff;border-radius:8px;
  padding:.5rem .85rem;font:500 12.5px/1 'Inter',ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--ink)}
.btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.field{display:flex;flex-direction:column;gap:.25rem;margin-bottom:.7rem}
.field label{font-size:11px;color:var(--muted)}
input,select,textarea{font:inherit;font-size:13px;padding:.5rem .6rem;border:1px solid var(--line);border-radius:8px;background:#fff;color:inherit;width:100%}
input[type=checkbox],input[type=radio]{width:auto;padding:0}
.row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
.preview{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.preview .chrome{display:flex;gap:.35rem;align-items:center;padding:.5rem .7rem;border-bottom:1px solid var(--line);background:var(--paper)}
.preview .chrome i{width:9px;height:9px;border-radius:999px;background:var(--line);display:inline-block}
.preview .url{font-size:11px;color:var(--muted);margin-left:.5rem}
.preview iframe{width:100%;height:620px;border:0;display:block;background:#fff}
.bars{display:grid;gap:.4rem}
.barrow{display:grid;grid-template-columns:9rem 1fr 5rem;gap:.6rem;align-items:center;font-size:12px}
.barrow .track{height:8px;background:var(--line);border-radius:999px;overflow:hidden}
.barrow .fill{height:100%;background:var(--accent)}
.spark{display:flex;align-items:flex-end;gap:2px;height:44px}
.spark i{flex:1;background:var(--accent);opacity:.75;border-radius:1px;min-height:2px}
.notice{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:.7rem .9rem;background:#fff;font-size:12.5px}
.flash{border-left-color:var(--ok)}
.flash.bad{border-left-color:var(--bad)}
.dash-head{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.15rem}.dash-head h1{font:600 1.35rem/1.25 'Inter';letter-spacing:-.02em}.dash-head p{margin:.25rem 0 0}.dash-actions{display:flex;align-items:center;gap:.5rem}.store-state{display:inline-flex;align-items:center;gap:.4rem;font-size:11px;color:var(--muted)}.store-state i{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 12%,transparent)}
.commerce-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem;margin-bottom:.85rem}.metric-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:.85rem 1rem;box-shadow:0 1px 2px #14201808}.metric-card .label{font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:.4rem}.metric-card .value{font-size:1.42rem;font-weight:600;letter-spacing:-.035em;margin-top:.2rem;font-variant-numeric:tabular-nums}.metric-card .delta{font-size:11px;color:var(--ok);margin-top:.15rem}.metric-card .delta.neg{color:var(--bad)}
.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(250px,.75fr);gap:.85rem;align-items:start}.dash-card{margin:0}.dash-card-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.dash-card-head h2{font-size:.95rem;font-weight:600}.dash-total{font-size:1.7rem;font-weight:600;letter-spacing:-.04em;margin-top:.45rem}.sales-chart{width:100%;height:190px;display:block;margin-top:.6rem;overflow:visible}.sales-chart .gridline{stroke:#e8ebe7;stroke-width:1}.sales-chart .area{fill:url(#sales-fill)}.sales-chart .line{fill:none;stroke:var(--ok);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.chart-labels{display:flex;justify-content:space-between;color:var(--muted);font-size:10.5px;margin-top:-.15rem}
.pulse-card{background:linear-gradient(145deg,#173d2a,#285c42);color:#fff;border:0;box-shadow:0 10px 28px #173d2a26}.pulse-card .muted{color:#c8d9cc}.pulse-number{font-size:2.35rem;font-weight:600;letter-spacing:-.06em;line-height:1}.pulse-list{display:grid;gap:.55rem;margin-top:1rem}.pulse-list a{display:flex;justify-content:space-between;gap:.5rem;text-decoration:none;background:#ffffff12;border:1px solid #ffffff1f;border-radius:9px;padding:.65rem .7rem;font-size:12px}.pulse-list a:hover{background:#ffffff1e}.dash-row{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:.85rem;margin-top:.85rem}.funnel-compact{display:grid;gap:.65rem;margin-top:.9rem}.funnel-line{display:grid;grid-template-columns:90px 1fr 55px;align-items:center;gap:.7rem;font-size:11.5px}.funnel-line .track{height:8px;border-radius:999px;background:#edf0ec;overflow:hidden}.funnel-line .track i{display:block;height:100%;background:linear-gradient(90deg,#2a7b57,#58a67e);border-radius:inherit}.order-list{margin-top:.55rem}.order-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:.65rem;align-items:center;padding:.6rem 0;border-top:1px solid var(--line);text-decoration:none}.order-badge{width:38px;height:38px;border-radius:9px;background:#eef5f0;color:#25714f;display:grid;place-items:center;font-size:11px;font-weight:600}.order-item strong{font-size:12.5px}.order-item small{display:block;color:var(--muted);font-size:10.5px}.dash-empty{color:var(--muted);font-size:12px;padding:.7rem 0}.preview-mini iframe{height:330px}.quick-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.55rem;margin-top:.75rem}.quick-grid a{display:flex;gap:.55rem;align-items:center;text-decoration:none;border:1px solid var(--line);border-radius:9px;padding:.7rem;font-size:12px}.quick-grid a:hover{border-color:#9caaa0;background:#fafcf9}
.cro-empty{text-align:center;padding:2.5rem 1.5rem}.cro-orb{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;margin:0 auto .8rem;background:#e4f2e9;color:var(--ok);font-size:1.7rem}.cro-launch{border-top:3px solid var(--ok)}.cro-check{align-items:flex-start!important;border:1px solid var(--line);padding:.7rem;border-radius:9px;margin-bottom:.8rem}.cro-check small,.cro-rule small{display:block;color:var(--muted);font-size:10.5px;margin-top:.1rem}.cro-rule{display:flex;gap:.7rem;border-top:1px solid var(--line);padding:.7rem 0}.cro-rule b:first-child{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#e4f2e9;color:var(--ok);font-size:11px;flex:0 0 auto}.cro-card{padding:1.1rem}.cro-actions{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:flex-end}.cro-variants{display:grid;gap:.55rem;margin-top:1rem}.cro-variant{border:1px solid var(--line);border-radius:10px;padding:.7rem;font-size:11.5px}.cro-variant.leader{border-color:#79aa8b;background:#fbfefc}.cro-variant a{display:inline-block;margin-top:.45rem;color:var(--ok);text-decoration:none}.prob{height:5px;background:#edf0ec;border-radius:99px;overflow:hidden;margin:.45rem 0}.prob i{display:block;height:100%;background:var(--ok);border-radius:inherit}.cro-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;color:var(--muted)}.cro-metrics b{color:var(--ink)}.cro-metrics .up b{color:var(--ok)}.cro-metrics .down b{color:var(--bad)}.cro-foot{display:flex;justify-content:space-between;gap:.7rem;border-top:1px solid var(--line);padding-top:.7rem;margin-top:.8rem;font-size:11px;color:var(--muted)}.tag.live{color:var(--ok);border-color:#a6c7b2;background:#f2faf5}
@media (max-width:1380px){:root{--rail:164px;--panel:300px}.page{padding:1.4rem}.commerce-kpis{grid-template-columns:repeat(3,1fr)}}
@media (max-width:1120px){.frame{grid-template-columns:var(--rail) minmax(0,1fr)}.panel{display:none}.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
@media (max-width:820px){:root{--rail:48px}.rail{padding:.55rem .35rem}.rail a{justify-content:center;padding:.3rem}.rail a b{display:none}.rail a.on{box-shadow:none}.page{padding:1rem}.top .chip:not(:last-of-type){display:none}.commerce-kpis{grid-template-columns:repeat(2,1fr)}.dashboard-grid,.dash-row{grid-template-columns:1fr}.cro-metrics{grid-template-columns:repeat(2,1fr)}}
@media (max-width:600px){.top{gap:.4rem;padding:0 .55rem}.top .logo strong{display:none}.dash-head{align-items:flex-start;flex-direction:column}.dash-actions{display:grid;grid-template-columns:1fr 1fr auto;width:100%}.dash-actions .btn{justify-content:center}.commerce-kpis{gap:.65rem}.metric-card{padding:.75rem .8rem}.metric-card .value{font-size:1.3rem}}
`
}
