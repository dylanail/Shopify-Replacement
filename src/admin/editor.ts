import { escapeHtml } from '../lib/http.ts'
import { blockGroups, BLOCKS, type BlockDefinition } from '../pages/blocks.ts'
import type { Page } from '../pages/store.ts'

/**
 * The page builder.
 *
 * Three panes, like every builder the merchant has used: blocks on the left,
 * the page in the middle as a sortable list of cards, settings on the right;
 * a live preview of the real storefront render underneath, reloaded on every
 * save. Drag from the palette to add, drag cards to reorder, click to edit.
 * Cmd/Ctrl-Z undoes. Nothing here is a framework: it is one script, the block
 * schemas serialized from the registry, and a JSON POST.
 *
 * HTML mode is the same page with a code editor instead of the block list —
 * for cloned pages and for people who would rather type.
 */
export function editorPage(input: { page: Page; storeSlug: string; products: Array<{ id: string; title: string }>; custom?: BlockDefinition[] }): string {
  const { page } = input
  const custom = input.custom ?? []
  const definitions = [...BLOCKS, ...custom].map((block) => ({ type: block.type, name: block.name, group: block.group, icon: block.icon, description: block.description, schema: block.schema }))
  const groups = blockGroups(custom).map((group) => ({ group: group.group, types: group.blocks.map((block) => block.type) }))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit: ${escapeHtml(page.title)} — Amboras</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${css()}</style></head><body>
<div class="ed" id="ed">
  <div class="ed-top">
    <a class="back" href="/admin/pages">← Pages</a>
    <input class="title" id="title" value="${escapeHtml(page.title)}" aria-label="Page title">
    <span class="mode"><button type="button" data-mode="blocks" class="${page.mode === 'blocks' ? 'on' : ''}">Blocks</button><button type="button" data-mode="html" class="${page.mode === 'html' ? 'on' : ''}">HTML</button></span>
    <span class="spacer"></span>
    <span class="status" id="status">Saved</span>
    <label class="pub"><input type="checkbox" id="published" ${page.status === 'published' ? 'checked' : ''}> Published</label>
    <label class="pub"><input type="checkbox" id="ishome" ${page.isHome ? 'checked' : ''}> Home page</label>
    <a class="btn" href="/preview/${escapeHtml(input.storeSlug)}/pages/${escapeHtml(page.handle)}" target="_blank" rel="noopener">Open preview ↗</a>
    <button class="btn primary" type="button" id="save">Save</button>
  </div>
  <div class="ed-body" id="blocks-mode" ${page.mode === 'html' ? 'hidden' : ''}>
    <aside class="palette"><div class="pane-title">Add a block</div><input class="search" id="search" placeholder="Search blocks"><div id="palette"></div></aside>
    <main class="canvas"><div class="pane-title">Page <span class="muted" id="count"></span></div><ol class="list" id="list"></ol><div class="drop-hint">Drop a block here</div></main>
    <aside class="props"><div class="pane-title" id="props-title">Settings</div><div id="props"><p class="muted">Select a block to edit it.</p></div></aside>
  </div>
  <div class="ed-body html" id="html-mode" ${page.mode === 'html' ? '' : 'hidden'}>
    <div class="code"><div class="pane-title">HTML <span class="muted">— the whole document, served as-is</span></div><textarea id="html" spellcheck="false">${escapeHtml(page.rawHtml)}</textarea></div>
    <div class="code"><div class="pane-title">Extra &lt;head&gt; (both modes)</div><textarea id="head" spellcheck="false" style="min-height:120px">${escapeHtml(page.headHtml)}</textarea>
      <div class="pane-title" style="margin-top:1rem">SEO</div>
      <input id="seo-title" placeholder="Title tag" value="${escapeHtml(page.seo.title ?? '')}"><input id="seo-desc" placeholder="Meta description" value="${escapeHtml(page.seo.description ?? '')}"><input id="seo-image" placeholder="Share image URL" value="${escapeHtml(page.seo.image ?? '')}">
      ${page.mode === 'html' ? `<p class="muted" style="font-size:12px;margin-top:1rem">Cloned from ${escapeHtml(page.sourceUrl || 'nowhere')}. <button type="button" class="link" id="to-blocks">Read this into blocks as a template</button></p>` : ''}</div>
  </div>
  <div class="preview"><div class="pane-title">Preview <span class="muted">— reloads on save</span> <span class="devices"><button type="button" data-w="100%" class="on">Desktop</button><button type="button" data-w="390px">Phone</button></span></div>
    <iframe id="preview" src="/preview/${escapeHtml(input.storeSlug)}/pages/${escapeHtml(page.handle)}" title="Preview"></iframe></div>
</div>
<script>
window.__PAGE = ${JSON.stringify({ id: page.id, mode: page.mode, blocks: page.blocks, handle: page.handle })};
window.__DEFS = ${JSON.stringify(definitions)};
window.__GROUPS = ${JSON.stringify(groups)};
window.__PRODUCTS = ${JSON.stringify(input.products)};
</script>
<script>${script()}</script>
</body></html>`
}

function css(): string {
  return `
:root{--paper:#faf7f3;--ink:#1c1a17;--muted:#7d746a;--line:#e6ded3;--accent:#7a4a2b;--ok:#2f7a4f;--bad:#b3261e}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font:13px/1.5 'Inter',ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--paper)}
.ed{display:grid;grid-template-rows:48px minmax(0,1fr) 44vh;height:100vh}
.ed-top{display:flex;align-items:center;gap:.6rem;padding:0 .8rem;background:#fff;border-bottom:1px solid var(--line)}
.back{text-decoration:none;color:var(--muted);font-size:12px}.spacer{flex:1}
.title{font:500 14px 'Inter',ui-sans-serif,system-ui,sans-serif;border:1px solid transparent;border-radius:6px;padding:.35rem .5rem;width:300px;background:transparent}.title:hover,.title:focus{border-color:var(--line);background:#fff}
.mode button,.devices button{border:1px solid var(--line);background:#fff;padding:.3rem .7rem;font:inherit;font-size:12px;cursor:pointer}
.mode button:first-child,.devices button:first-child{border-radius:6px 0 0 6px}.mode button:last-child,.devices button:last-child{border-radius:0 6px 6px 0;margin-left:-1px}
.mode button.on,.devices button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.status{font-size:12px;color:var(--muted)}.status.dirty{color:var(--accent)}.status.error{color:var(--bad)}
.pub{font-size:12px;display:flex;gap:.3rem;align-items:center;color:var(--muted)}
.btn{border:1px solid var(--line);background:#fff;border-radius:6px;padding:.45rem .8rem;font:500 12.5px 'Inter',ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-decoration:none;color:inherit}
.btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}.btn.small{padding:.25rem .5rem;font-size:11px}.btn.danger{color:var(--bad)}
.link{border:0;background:none;color:var(--accent);cursor:pointer;font:inherit;padding:0;text-decoration:underline}
.ed-body{display:grid;grid-template-columns:240px minmax(0,1fr) 320px;min-height:0;border-bottom:1px solid var(--line)}
.ed-body.html{grid-template-columns:1fr 360px}
.palette,.props,.canvas,.code{overflow:auto;min-height:0}
.palette{background:#fff;border-right:1px solid var(--line);padding:.7rem}.props{background:#fff;border-left:1px solid var(--line);padding:.7rem}
.canvas{padding:.7rem 1rem}.code{padding:.7rem 1rem}
.pane-title{font:600 11px 'Inter',ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:.6rem;display:flex;gap:.5rem;align-items:center}
.pane-title .muted{text-transform:none;letter-spacing:0;font-weight:400}
.muted{color:var(--muted)}
.search{width:100%;border:1px solid var(--line);border-radius:6px;padding:.4rem .5rem;font:inherit;margin-bottom:.6rem}
.grp{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:.7rem 0 .3rem}
.pal{display:flex;gap:.5rem;align-items:center;padding:.4rem .5rem;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:grab;margin-bottom:.3rem;font-size:12.5px}
.pal:hover{border-color:var(--ink)}.pal .ico{width:22px;text-align:center;color:var(--accent)}.pal:active{cursor:grabbing}
.list{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.card{display:grid;grid-template-columns:20px 1fr auto;gap:.6rem;align-items:center;border:1px solid var(--line);border-radius:10px;background:#fff;padding:.55rem .7rem;cursor:pointer}
.card.sel{border-color:var(--ink);box-shadow:0 0 0 2px rgba(0,0,0,.06)}.card.drag{opacity:.4}
.card.over-before{box-shadow:0 -3px 0 0 var(--accent)}.card.over-after{box-shadow:0 3px 0 0 var(--accent)}
.card .grip{color:var(--line);cursor:grab;font-size:16px;text-align:center}
.card .t{font-weight:500}.card .s{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px}
.card .acts{display:flex;gap:.25rem;opacity:0}.card:hover .acts,.card.sel .acts{opacity:1}
.card .acts button{border:1px solid var(--line);background:#fff;border-radius:5px;width:24px;height:24px;cursor:pointer;font-size:11px}
.drop-hint{border:1px dashed var(--line);border-radius:10px;padding:1rem;text-align:center;color:var(--muted);margin-top:.5rem;font-size:12px}
.drop-hint.over{border-color:var(--accent);color:var(--accent)}
.f{display:flex;flex-direction:column;gap:.2rem;margin-bottom:.6rem}.f label{font-size:11px;color:var(--muted)}
.f input,.f select,.f textarea,.code textarea,.code input{width:100%;border:1px solid var(--line);border-radius:6px;padding:.4rem .5rem;font:inherit;font-size:12.5px;background:#fff}
.f textarea{min-height:76px;resize:vertical}.f .help{font-size:10.5px;color:var(--muted)}
.f.check{flex-direction:row;align-items:center;gap:.4rem}.f.check input{width:auto}
.code textarea{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;min-height:calc(100% - 2rem);resize:none}
.code input{margin-bottom:.4rem}
.preview{background:#fff;padding:.5rem .8rem;display:grid;grid-template-rows:auto 1fr;min-height:0}
.preview .devices{margin-left:auto}
.preview iframe{width:100%;height:100%;border:1px solid var(--line);border-radius:8px;background:#fff;justify-self:center;transition:width .2s}
.props .row{display:flex;gap:.4rem;margin-top:.8rem}
`
}

function script(): string {
  return `
(function(){
  var state = { blocks: (window.__PAGE.blocks || []).slice(), selected: null, dirty: false, history: [], mode: window.__PAGE.mode };
  var defs = {}; window.__DEFS.forEach(function(d){ defs[d.type] = d });
  var $ = function(id){ return document.getElementById(id) };
  var list = $('list'), props = $('props'), status = $('status');
  function uid(){ return 'blk_' + Math.random().toString(36).slice(2, 10) }
  function defaults(def){ var o = {}; Object.keys(def.schema).forEach(function(k){ if (def.schema[k].default !== undefined) o[k] = def.schema[k].default }); return o }
  function push(){ state.history.push(JSON.stringify(state.blocks)); if (state.history.length > 60) state.history.shift(); setDirty(true) }
  function setDirty(d){ state.dirty = d; status.textContent = d ? 'Unsaved changes' : 'Saved'; status.className = 'status' + (d ? ' dirty' : '') }
  function summary(b){ var d = defs[b.type]; if (!d) return b.type; var s = b.settings || {}; return String(s.headline || s.text || s.title || s.label || s.quote || s.name || s.html || d.description).replace(/\\s+/g,' ').slice(0, 90) }

  /* ---- palette */
  function palette(filter){
    var out = '';
    window.__GROUPS.forEach(function(g){
      var items = g.types.map(function(t){ return defs[t] }).filter(function(d){ return !filter || (d.name + ' ' + d.description).toLowerCase().indexOf(filter) !== -1 });
      if (!items.length) return;
      out += '<div class="grp">' + g.group + '</div>' + items.map(function(d){ return '<div class="pal" draggable="true" data-type="' + d.type + '" title="' + esc(d.description) + '"><span class="ico">' + esc(d.icon) + '</span>' + esc(d.name) + '</div>' }).join('');
    });
    $('palette').innerHTML = out;
    $('palette').querySelectorAll('.pal').forEach(function(el){
      el.addEventListener('dragstart', function(ev){ ev.dataTransfer.setData('text/x-block-type', el.dataset.type); ev.dataTransfer.effectAllowed = 'copy' });
      el.addEventListener('click', function(){ add(el.dataset.type, state.selected !== null ? state.selected + 1 : state.blocks.length) });
    });
  }
  $('search').addEventListener('input', function(){ palette($('search').value.trim().toLowerCase()) });

  /* ---- canvas */
  function render(){
    list.innerHTML = state.blocks.map(function(b, i){ var d = defs[b.type] || { name: b.type, icon: '?' };
      return '<li class="card' + (state.selected === i ? ' sel' : '') + '" draggable="true" data-i="' + i + '"><span class="grip">⋮⋮</span><span><div class="t">' + esc(d.icon) + ' ' + esc(d.name) + '</div><div class="s">' + esc(summary(b)) + '</div></span><span class="acts"><button type="button" title="Move up" data-act="up">↑</button><button type="button" title="Move down" data-act="down">↓</button><button type="button" title="Duplicate" data-act="dup">⧉</button><button type="button" title="Delete" data-act="del">✕</button></span></li>' }).join('');
    $('count').textContent = state.blocks.length + ' blocks';
    list.querySelectorAll('.card').forEach(function(card){
      var i = Number(card.dataset.i);
      card.addEventListener('click', function(ev){ if (ev.target.closest('[data-act]')) return; select(i) });
      card.querySelectorAll('[data-act]').forEach(function(btn){ btn.addEventListener('click', function(){ act(btn.dataset.act, i) }) });
      card.addEventListener('dragstart', function(ev){ ev.dataTransfer.setData('text/x-block-index', String(i)); ev.dataTransfer.effectAllowed = 'move'; card.classList.add('drag') });
      card.addEventListener('dragend', function(){ card.classList.remove('drag'); clearOver() });
      card.addEventListener('dragover', function(ev){ ev.preventDefault(); clearOver(); var r = card.getBoundingClientRect(); card.classList.add(ev.clientY < r.top + r.height / 2 ? 'over-before' : 'over-after') });
      card.addEventListener('drop', function(ev){ ev.preventDefault(); var r = card.getBoundingClientRect(); var at = ev.clientY < r.top + r.height / 2 ? i : i + 1; drop(ev, at) });
    });
  }
  function clearOver(){ list.querySelectorAll('.over-before,.over-after').forEach(function(el){ el.classList.remove('over-before','over-after') }); $('ed').querySelector('.drop-hint').classList.remove('over') }
  var hint = document.querySelector('.drop-hint');
  hint.addEventListener('dragover', function(ev){ ev.preventDefault(); hint.classList.add('over') });
  hint.addEventListener('dragleave', function(){ hint.classList.remove('over') });
  hint.addEventListener('drop', function(ev){ ev.preventDefault(); drop(ev, state.blocks.length) });
  function drop(ev, at){
    var type = ev.dataTransfer.getData('text/x-block-type'), from = ev.dataTransfer.getData('text/x-block-index');
    clearOver();
    if (type) return add(type, at);
    if (from !== '') { var i = Number(from); if (i === at || i + 1 === at) return; push(); var b = state.blocks.splice(i, 1)[0]; state.blocks.splice(at > i ? at - 1 : at, 0, b); state.selected = at > i ? at - 1 : at; render(); edit() }
  }
  function add(type, at){ var d = defs[type]; if (!d) return; push(); state.blocks.splice(at, 0, { id: uid(), type: type, settings: defaults(d) }); state.selected = at; render(); edit(); list.children[at] && list.children[at].scrollIntoView({ block: 'nearest' }) }
  function act(what, i){
    push();
    if (what === 'del') { state.blocks.splice(i, 1); state.selected = null }
    if (what === 'dup') { var c = JSON.parse(JSON.stringify(state.blocks[i])); c.id = uid(); state.blocks.splice(i + 1, 0, c); state.selected = i + 1 }
    if (what === 'up' && i > 0) { var a = state.blocks[i]; state.blocks[i] = state.blocks[i - 1]; state.blocks[i - 1] = a; state.selected = i - 1 }
    if (what === 'down' && i < state.blocks.length - 1) { var b = state.blocks[i]; state.blocks[i] = state.blocks[i + 1]; state.blocks[i + 1] = b; state.selected = i + 1 }
    render(); edit();
  }
  function select(i){ state.selected = i; render(); edit() }

  /* ---- settings */
  function edit(){
    if (state.selected === null || !state.blocks[state.selected]) { props.innerHTML = '<p class="muted">Select a block to edit it.</p>'; $('props-title').textContent = 'Settings'; return }
    var b = state.blocks[state.selected], d = defs[b.type]; $('props-title').textContent = d ? d.name : b.type;
    var html = '';
    Object.keys(d.schema).forEach(function(key){
      var f = d.schema[key], v = b.settings[key] !== undefined ? b.settings[key] : (f.default !== undefined ? f.default : '');
      var label = esc(f.label || key);
      if (f.type === 'boolean') { html += '<div class="f check"><input type="checkbox" data-k="' + key + '" ' + (v ? 'checked' : '') + '><label>' + label + '</label></div>'; return }
      if (f.enum) { html += '<div class="f"><label>' + label + '</label><select data-k="' + key + '">' + f.enum.map(function(o){ return '<option ' + (String(o) === String(v) ? 'selected' : '') + '>' + esc(o) + '</option>' }).join('') + '</select></div>'; return }
      if (key === 'productId') { html += '<div class="f"><label>' + label + '</label><select data-k="' + key + '"><option value="">— choose —</option>' + window.__PRODUCTS.map(function(p){ return '<option value="' + p.id + '" ' + (p.id === v ? 'selected' : '') + '>' + esc(p.title) + '</option>' }).join('') + '</select></div>'; return }
      if (f.multiline || String(v).length > 80) { html += '<div class="f"><label>' + label + '</label><textarea data-k="' + key + '">' + esc(v) + '</textarea>' + (f.help ? '<span class="help">' + esc(f.help) + '</span>' : '') + '</div>'; return }
      html += '<div class="f"><label>' + label + '</label><input data-k="' + key + '" type="' + (f.type === 'number' ? 'number' : 'text') + '" value="' + esc(v) + '">' + (f.help ? '<span class="help">' + esc(f.help) + '</span>' : '') + '</div>';
    });
    html += '<div class="row"><button type="button" class="btn small" data-act="dup">Duplicate</button><button type="button" class="btn small danger" data-act="del">Delete block</button></div>';
    props.innerHTML = html;
    props.querySelectorAll('[data-k]').forEach(function(el){
      var apply = function(){ var f = d.schema[el.dataset.k]; var val = el.type === 'checkbox' ? el.checked : (f.type === 'number' ? Number(el.value) : el.value); if (!state.history.length || state.history[state.history.length - 1] !== JSON.stringify(state.blocks)) push(); b.settings[el.dataset.k] = val; setDirty(true); var card = list.children[state.selected]; if (card) card.querySelector('.s').textContent = summary(b) };
      el.addEventListener('input', apply); el.addEventListener('change', apply);
    });
    props.querySelectorAll('[data-act]').forEach(function(btn){ btn.addEventListener('click', function(){ act(btn.dataset.act, state.selected) }) });
  }

  /* ---- modes, save, preview */
  document.querySelectorAll('.mode button').forEach(function(btn){ btn.addEventListener('click', function(){
    state.mode = btn.dataset.mode; document.querySelectorAll('.mode button').forEach(function(b){ b.classList.toggle('on', b === btn) });
    $('blocks-mode').hidden = state.mode !== 'blocks'; $('html-mode').hidden = state.mode !== 'html'; setDirty(true);
  })});
  document.querySelectorAll('.devices button').forEach(function(btn){ btn.addEventListener('click', function(){ document.querySelectorAll('.devices button').forEach(function(b){ b.classList.toggle('on', b === btn) }); $('preview').style.width = btn.dataset.w }) });
  function payload(){ return { title: $('title').value, mode: state.mode, blocks: state.blocks, rawHtml: $('html').value, headHtml: $('head').value, status: $('published').checked ? 'published' : 'draft', isHome: $('ishome').checked, seo: { title: $('seo-title').value, description: $('seo-desc').value, image: $('seo-image').value } } }
  function save(){
    status.textContent = 'Saving…'; status.className = 'status';
    fetch('/admin/pages/' + window.__PAGE.id + '/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) })
      .then(function(r){ return r.json() }).then(function(out){
        if (out.error) { status.textContent = out.error; status.className = 'status error'; return }
        setDirty(false); if (out.handle) { window.__PAGE.handle = out.handle } var f = $('preview'); f.src = f.src.split('?')[0].replace(/\\/pages\\/[^/?]+/, '/pages/' + window.__PAGE.handle) + '?t=' + Date.now();
      }).catch(function(){ status.textContent = 'Could not save'; status.className = 'status error' });
  }
  $('save').addEventListener('click', save);
  [$('title'), $('published'), $('ishome'), $('html'), $('head'), $('seo-title'), $('seo-desc'), $('seo-image')].forEach(function(el){ el.addEventListener('input', function(){ setDirty(true) }); el.addEventListener('change', function(){ setDirty(true) }) });
  var toBlocks = $('to-blocks'); toBlocks && toBlocks.addEventListener('click', function(){
    fetch('/admin/pages/' + window.__PAGE.id + '/extract', { method: 'POST' }).then(function(r){ return r.json() }).then(function(out){
      if (!out.blocks) return; push(); state.blocks = out.blocks; state.mode = 'blocks'; document.querySelector('.mode [data-mode=blocks]').click(); render(); status.textContent = out.blocks.length + ' blocks read from the HTML — a starting point, not a copy'; status.className = 'status dirty';
    });
  });
  document.addEventListener('keydown', function(ev){
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') { ev.preventDefault(); save() }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z' && !ev.target.matches('input,textarea,select')) { ev.preventDefault(); var prev = state.history.pop(); if (prev) { state.blocks = JSON.parse(prev); render(); edit(); setDirty(true) } }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.selected !== null && !ev.target.matches('input,textarea,select')) { ev.preventDefault(); act('del', state.selected) }
  });
  window.addEventListener('beforeunload', function(ev){ if (state.dirty) { ev.preventDefault(); ev.returnValue = '' } });
  function esc(s){ return String(s === undefined || s === null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
  palette(''); render(); edit();
})();
`
}
