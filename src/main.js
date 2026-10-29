/* Điểm khởi động ứng dụng + router dạng hash */
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/views.css';
import './styles/formats.css';

import { store, initStore, onStore } from './data/store.js';
import { closePopover } from './lib/utils.js';
import { renderAuth } from './views/auth.js';
import { shellHTML, bindShell, updateShell, setTitle } from './views/shell.js';
import * as home from './views/home.js';
import * as tournaments from './views/tournaments.js';
import * as tdetail from './views/tdetail.js';
import * as create from './views/create.js';
import { forum, topic } from './views/forum.js';
import { members, profile, admin, search } from './views/people.js';
import { rules } from './views/rules.js';

if (localStorage.getItem('pbkt_theme') === 'light') document.documentElement.dataset.theme = 'light';

/* bảng định tuyến: [pattern, view, navKey] */
const ROUTES = [
  [/^\/live$/, home, 'live'],
  [/^\/tournaments$/, tournaments, 'tournaments'],
  [/^\/history$/, tournaments.history, 'history'],
  [/^\/t\/([\w-]+)$/, tdetail, 'tournaments'],
  [/^\/create$/, create, 'tournaments'],
  [/^\/forum$/, forum, 'forum'],
  [/^\/topic\/([\w-]+)$/, topic, 'forum'],
  [/^\/members$/, members, 'members'],
  [/^\/u\/([\w-]+)$/, profile, 'members'],
  [/^\/admin$/, admin, 'admin'],
  [/^\/rules$/, rules, 'rules'],
  [/^\/search$/, search, ''],
];

function parse() {
  const raw = location.hash.slice(1) || '/live';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [re, view, nav] of ROUTES) {
    const m = path.match(re);
    if (m) return { view, nav, params: { id: m[1], query }, path };
  }
  return { view: home, nav: 'live', params: { query }, path: '/live' };
}

const app = document.getElementById('app');
let shellFor = null; // khoá phiên của khung đang hiển thị
let current = null;

function renderView(keepScroll = false) {
  const viewEl = document.getElementById('view');
  if (!viewEl || !current) return;
  const { view, params, nav } = current;

  // giữ lại nội dung đang gõ & con trỏ khi re-render (realtime)
  const snap = {};
  viewEl.querySelectorAll('input[id],textarea[id],select[id]').forEach((el) => {
    if (el.type !== 'checkbox') snap[el.id] = el.value;
  });
  const act = document.activeElement;
  const focusId = act && viewEl.contains(act) ? act.id : null;
  const sel = focusId && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
  const y = window.scrollY;

  const inner = document.createElement('div');
  inner.className = 'view-inner';
  inner.innerHTML = view.render(params);
  viewEl.replaceChildren(inner);

  for (const [id, v] of Object.entries(snap)) {
    const el = inner.querySelector('#' + CSS.escape(id));
    if (el && el.tagName !== 'SELECT' && el.value !== v) el.value = v;
  }
  view.mount?.(inner, params, () => renderView(true));
  if (focusId) {
    const el = inner.querySelector('#' + CSS.escape(focusId));
    if (el) { el.focus({ preventScroll: true }); sel && el.setSelectionRange?.(...sel); }
  }
  if (keepScroll) window.scrollTo(0, y);

  const t = typeof view.title === 'function' ? view.title(params) : view.title;
  setTitle(t || 'Pickleball Ban KT');
  updateShell(nav);
}

function route() {
  closePopover();
  if (!store.session || !store.me) {
    shellFor = null;
    app.innerHTML = '';
    renderAuth(app);
    document.title = 'Đăng nhập · Pickleball Ban KT';
    return;
  }
  const key = store.me.id + ':' + store.me.status + ':' + store.me.role + ':' + store.me.full_name + ':' + store.me.avatar_url;
  if (shellFor !== key) {
    app.innerHTML = shellHTML();
    bindShell();
    shellFor = key;
  }
  current = parse();
  renderView(false);
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);

(async () => {
  try {
    await initStore();
  } catch (e) {
    console.error(e);
    const noSchema = /does not exist|schema cache|PGRST20/i.test(e.message || '');
    app.innerHTML = `<div class="empty" style="min-height:100vh;display:grid;place-content:center;text-align:center;padding:24px">
      <div class="ic">⚠️</div><h4>${noSchema ? 'Cơ sở dữ liệu chưa được khởi tạo' : 'Không kết nối được máy chủ'}</h4>
      <p style="max-width:460px;margin:8px auto 16px">${noSchema ? 'Hãy chạy file <code>supabase/schema.sql</code> trong Supabase → SQL Editor rồi tải lại trang.' : 'Kiểm tra kết nối mạng rồi tải lại trang.'}</p>
      <div class="row" style="justify-content:center;gap:8px"><button class="btn btn-gold" id="bootReload">Tải lại</button><a class="btn btn-ghost" href="?demo=1">Dùng chế độ demo</a></div></div>`;
    document.getElementById('bootReload').addEventListener('click', () => location.reload());
    return;
  }
  route();
  onStore((what) => {
    if (what === 'auth') return route();
    if (!store.session || !store.me) return route();
    const key = store.me.id + ':' + store.me.status + ':' + store.me.role + ':' + store.me.full_name + ':' + store.me.avatar_url;
    if (shellFor !== key) return route();
    // không vẽ lại khi đang mở modal để tránh mất thao tác
    if (document.querySelector('.modal-mask')) { updateShell(current?.nav); pendingRefresh = true; return; }
    renderView(true);
  });
})();

/* vẽ lại sau khi đóng modal nếu có dữ liệu mới */
let pendingRefresh = false;
new MutationObserver(() => {
  if (pendingRefresh && !document.querySelector('.modal-mask')) { pendingRefresh = false; renderView(true); }
}).observe(document.body, { childList: true });
