/* @mention: gợi ý thành viên khi gõ “@” trong ô nhập + render nội dung có tag */
import { esc, avatar } from '../lib/utils.js';
import { store, profileByHandle } from '../data/store.js';
import { stripVN } from '../lib/utils.js';

/** Render nội dung người dùng: escape → highlight @tag → tự nhận link */
export function richText(text) {
  let h = esc(text);
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="ext">$1</a>');
  h = h.replace(/(^|[\s(])@([a-z0-9_.]+)/gi, (m, pre, handle) => {
    const p = profileByHandle(handle.toLowerCase());
    return p ? `${pre}<a class="mention" href="#/u/${p.id}" title="${esc(p.full_name)}">@${esc(p.full_name)}</a>` : m;
  });
  return h;
}

/** Gắn autocomplete @ vào textarea/input */
export function attachMention(el) {
  if (!el || el._mention) return;
  el._mention = true;
  let box = null;
  let items = [];
  let idx = 0;
  let start = -1;

  const close = () => { box?.remove(); box = null; start = -1; };
  const pick = (p) => {
    const v = el.value;
    const caret = el.selectionStart;
    el.value = v.slice(0, start) + '@' + p.handle + ' ' + v.slice(caret);
    const pos = start + p.handle.length + 2;
    el.setSelectionRange(pos, pos);
    close();
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const draw = () => {
    if (!items.length) return close();
    if (!box) {
      box = document.createElement('div');
      box.className = 'popover mention-box';
      document.body.appendChild(box);
    }
    box.innerHTML = `<div class="muted" style="font-size:11px;padding:4px 10px 6px;letter-spacing:.6px">NHẮC TÊN THÀNH VIÊN</div>` +
      items.map((p, i) => `<button class="menu-item ${i === idx ? 'on' : ''}" data-i="${i}" type="button">${avatar(p, 'xs')}<span style="flex:1">${esc(p.full_name)}</span><small class="muted">@${esc(p.handle)}</small></button>`).join('');
    box.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(items[+b.dataset.i]); }));
    const r = el.getBoundingClientRect();
    box.style.left = r.left + window.scrollX + 'px';
    box.style.width = Math.min(320, r.width) + 'px';
    const h = box.offsetHeight;
    box.style.top = (r.bottom + h + 8 < window.innerHeight ? r.bottom + 6 : r.top - h - 6) + window.scrollY + 'px';
  };

  el.addEventListener('input', () => {
    const caret = el.selectionStart;
    const before = el.value.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}0-9_.]{0,20})$/u);
    if (!m) return close();
    start = caret - m[2].length - 1;
    const q = stripVN(m[2]).toLowerCase();
    items = store.profiles
      .filter((p) => p.status === 'approved' && p.id !== store.me?.id)
      .filter((p) => !q || p.handle.includes(q) || stripVN(p.full_name).toLowerCase().includes(q))
      .slice(0, 6);
    idx = 0;
    draw();
  });
  el.addEventListener('keydown', (e) => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(items[idx]); }
    else if (e.key === 'Escape') close();
  });
  el.addEventListener('blur', () => setTimeout(close, 120));
}
