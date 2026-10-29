/* Tiện ích dùng chung */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Escape HTML – BẮT BUỘC cho mọi nội dung do người dùng nhập */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _c = 0;
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + (_c++).toString(36);

export function stripVN(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
export function slugHandle(name) {
  return stripVN(name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'user';
}
export function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[w.length - 2][0] + w[w.length - 1][0]).toUpperCase();
}

export const PALETTE = ['#F3C43C', '#4AA3DB', '#F0A65A', '#7CC3EF', '#FFD76A', '#5FD3A6', '#C9A3FF', '#FF8F7A', '#9BD1FF', '#E8C26E'];
export function colorFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function avatar(p, cls = '') {
  if (!p) return `<span class="av ${cls}" style="background:#2a4766;color:#9bb">?</span>`;
  const bg = p.color || colorFor(p.id);
  const inner = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.full_name));
  return `<span class="av ${cls}" style="background:${bg}" title="${esc(p.full_name)}">${inner}</span>`;
}

/* ---------- thời gian ---------- */
export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'vừa xong';
  if (s < 3600) return Math.floor(s / 60) + ' phút trước';
  if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' ngày trước';
  return fmtDate(iso);
}
export function fmtDate(iso, withYear = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}${withYear ? '/' + d.getFullYear() : ''}`;
}
export function fmtDateTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${fmtDate(iso)}`;
}

/* ---------- toast ---------- */
let toastBox;
export function toast(msg, type = '') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    document.body.appendChild(toastBox);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = (type === 'ok' ? '✅ ' : type === 'err' ? '⚠️ ' : '') + esc(msg);
  toastBox.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- modal ---------- */
export function openModal({ title, sub = '', body, foot = '', wide = false, onMount, onClose }) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
      <button class="modal-close" data-close aria-label="Đóng">✕</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  const close = () => {
    mask.remove();
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  mask.addEventListener('mousedown', (e) => {
    if (e.target === mask) close();
  });
  mask.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(mask);
  const first = mask.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 60);
  onMount && onMount(mask, close);
  return close;
}

export function confirmBox(title, text, okLabel = 'Đồng ý', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title,
      body: `<p style="color:var(--text-2);font-size:14px">${text}</p>`,
      foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-ok>${esc(okLabel)}</button>`,
      onMount(m, close) {
        m.querySelector('[data-ok]').onclick = () => {
          done = true;
          close();
          resolve(true);
        };
      },
      onClose() {
        if (!done) resolve(false);
      },
    });
  });
}

/* ---------- popover gắn với nút ---------- */
let openPop = null;
export function popover(anchor, html, onMount) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  let left = r.right - pw;
  if (left < 8) left = Math.min(r.left, window.innerWidth - pw - 8);
  pop.style.left = left + window.scrollX + 'px';
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.top = (below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + window.scrollY + 'px';
  openPop = pop;
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
  }
  pop._off = () => document.removeEventListener('mousedown', outside);
  onMount && onMount(pop);
  return pop;
}
export function closePopover() {
  if (openPop) {
    openPop._off && openPop._off();
    openPop.remove();
    openPop = null;
  }
}

export function emptyBox(ic, h, p, extra = '') {
  return `<div class="empty"><div class="ic">${ic}</div><h4>${esc(h)}</h4><p>${p}</p>${extra}</div>`;
}
