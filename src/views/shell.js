/* Khung ứng dụng: rail, thanh trên, bottom-nav, chuông thông báo, menu tài khoản */
import { I } from '../lib/icons.js';
import { esc, avatar, popover, closePopover, timeAgo, toast } from '../lib/utils.js';
import { store, profileById, isAdmin, isApproved } from '../data/store.js';
import { api } from '../data/api.js';

export const NAV = [
  { k: 'live', l: 'Trực tiếp', ic: I.live, href: '#/live' },
  { k: 'tournaments', l: 'Giải đấu', ic: I.trophy, href: '#/tournaments' },
  { k: 'forum', l: 'Thảo luận', ic: I.chat, href: '#/forum' },
  { k: 'members', l: 'Thành viên', ic: I.users, href: '#/members' },
  { k: 'history', l: 'Lịch sử', ic: I.history, href: '#/history' },
  { k: 'rules', l: 'Điều lệ', ic: I.rules, href: '#/rules' },
];

export function shellHTML() {
  const admin = isAdmin();
  const pendingN = store.profiles.filter((p) => p.status === 'pending').length;
  const nav = [...NAV, ...(admin ? [{ k: 'admin', l: 'Quản trị', ic: I.shield, href: '#/admin', badge: pendingN }] : [])];
  return `
  <div class="app">
    <nav class="rail" aria-label="Điều hướng chính">
      <a class="brand" href="#/live" aria-label="Trang chủ">KT</a>
      ${nav.map((n) => `<a class="rail-btn" data-nav="${n.k}" href="${n.href}">${n.ic}<span>${n.l}</span>${n.badge ? `<span class="badge" style="position:absolute;top:4px;right:10px;min-width:17px;height:17px;border-radius:9px;background:var(--bad);color:#fff;font-size:10px;display:grid;place-items:center;padding:0 4px">${n.badge}</span>` : ''}</a>`).join('')}
      <div class="spacer"></div>
      ${isApproved() ? `<a class="rail-create" href="#/create" id="railCreate" aria-label="Tạo giải">${I.plus}</a><span class="rail-create-lbl">Tạo giải</span>` : ''}
    </nav>

    <div class="main">
      <header class="topnav">
        <div class="title"><b id="pageTitle">Pickleball Ban KT</b><small>Ban Kỹ thuật · Vietnam Airlines</small></div>
        <div class="grow"></div>
        <label class="search" for="globalSearch">${I.search}<input id="globalSearch" placeholder="Tìm giải, thành viên, chủ đề…" autocomplete="off"></label>
        <button class="icon-btn" id="themeBtn" aria-label="Đổi giao diện sáng/tối">${document.documentElement.dataset.theme === 'light' ? I.moon : I.sun}</button>
        <button class="icon-btn" id="bellBtn" aria-label="Thông báo">${I.bell}<span id="bellBadge"></span></button>
        <button class="me-btn" id="meBtn" aria-label="Tài khoản">${avatar(store.me, 'sm')}<span class="nm">${esc(store.me?.full_name || '')}</span></button>
      </header>
      <div class="deck"><span><b>PICKLEBALL BAN KT</b> · BAN KỸ THUẬT · VIETNAM AIRLINES</span><span id="deckClock">--:--Z</span></div>
      <div id="pendingSlot"></div>
      <main id="view"></main>
    </div>
  </div>

  ${isApproved() ? `<a class="fab" href="#/create" aria-label="Tạo giải mới">${I.plus}</a>` : ''}
  <nav class="bottomnav" aria-label="Điều hướng">
    ${NAV.slice(0, 4).map((n) => `<a class="bn-btn" data-nav="${n.k}" href="${n.href}">${n.ic}<span>${n.l}</span></a>`).join('')}
    <button class="bn-btn" id="moreBtn" data-nav="more">${I.more}<span>Thêm</span></button>
  </nav>
  ${api.mode === 'demo' ? `<div class="demo-badge"><i></i>Chế độ demo · dữ liệu lưu trên trình duyệt <button id="resetDemo">Đặt lại</button></div>` : ''}`;
}

export function updateShell(navKey) {
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === navKey));
  // banner chờ duyệt
  const slot = document.getElementById('pendingSlot');
  if (slot) {
    const st = store.me?.status;
    slot.innerHTML =
      st === 'pending'
        ? `<div class="pending-banner"><span class="ic">⏳</span><div><b>Tài khoản đang chờ admin duyệt</b><span>Bạn vẫn xem được mọi nội dung. Sau khi được duyệt, bạn có thể tạo giải, nhập điểm và tham gia thảo luận.</span></div></div>`
        : st === 'locked'
        ? `<div class="pending-banner" style="border-color:rgba(255,107,94,.5);background:linear-gradient(90deg,rgba(255,107,94,.16),transparent)"><span class="ic">🔒</span><div><b>Tài khoản đã bị khoá</b><span>Liên hệ admin Ban KT để được hỗ trợ.</span></div></div>`
        : '';
  }
  // chuông
  const unread = store.notifications.filter((n) => !n.read).length;
  const bb = document.getElementById('bellBadge');
  if (bb) bb.outerHTML = `<span id="bellBadge">${unread ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</span>`;
}

export function setTitle(t) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = t;
  document.title = t + ' · Pickleball Ban KT';
}

/* ---------- thông báo ---------- */
function notifText(n) {
  const a = profileById(n.actor_id);
  const who = `<b>${esc(a?.full_name || 'Ai đó')}</b>`;
  const tp = store.topics.find((t) => t.id === n.topic_id);
  const tt = tp ? ` trong “${esc(tp.title)}”` : '';
  const tn = store.tournaments.find((t) => t.id === n.tournament_id);
  const tname = tn ? `“${esc(tn.name)}”` : 'giải đấu';
  switch (n.type) {
    case 'mention': return `${who} đã nhắc đến bạn${tt}`;
    case 'reply': return `${who} đã trả lời bạn${tt}`;
    case 'approved': return `🎉 Tài khoản của bạn đã được duyệt. Chào mừng vào sân!`;
    case 'pending': return `${who} vừa đăng ký và đang chờ duyệt`;
    case 'registration': return `📝 ${who} đăng ký tham gia ${tname}`;
    case 'reg_ok': return `✅ Đăng ký ${tname} của bạn đã được BTC duyệt`;
    case 'reg_no': return `BTC chưa duyệt đăng ký ${tname} của bạn`;
    case 'claimed': return `✅ ${who} đã kích hoạt tài khoản và nhận hồ sơ lãnh đạo bạn tạo`;
    default: return `${who} có hoạt động mới`;
  }
}
function notifHref(n) {
  if (n.type === 'pending') return '#/admin';
  if (n.type === 'claimed') return `#/u/${n.actor_id}`;
  if (n.tournament_id) return `#/t/${n.tournament_id}?tab=dk`;
  if (n.topic_id) return `#/topic/${n.topic_id}${n.comment_id ? '?c=' + n.comment_id : ''}`;
  return '#/live';
}

export function bindShell() {
  document.getElementById('bellBtn')?.addEventListener('click', (e) => {
    const list = [...store.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15);
    popover(
      e.currentTarget,
      `<div style="width:min(360px,86vw)">
        <div class="row between" style="padding:8px 10px 6px"><b style="font-size:15px">Thông báo</b>${list.some((n) => !n.read) ? `<button class="link-btn" id="markAll">Đánh dấu đã đọc</button>` : ''}</div>
        ${list.length ? list.map((n) => `<a class="menu-item notif ${n.read ? '' : 'on'}" href="${notifHref(n)}" data-nid="${n.id}" style="align-items:flex-start">
            ${avatar(profileById(n.actor_id), 'sm')}
            <span style="flex:1;min-width:0;line-height:1.4">${notifText(n)}<br><small class="muted">${timeAgo(n.created_at)}</small></span>
            ${n.read ? '' : '<i class="dot" style="background:var(--gold);animation:none;margin-top:6px"></i>'}</a>`).join('') : `<div class="empty" style="padding:26px 10px"><div class="ic">🔕</div><p>Chưa có thông báo nào.</p></div>`}
      </div>`,
      (pop) => {
        pop.querySelector('#markAll')?.addEventListener('click', () => { api.markRead(); closePopover(); });
        pop.querySelectorAll('[data-nid]').forEach((a) => a.addEventListener('click', () => { api.markRead([a.dataset.nid]); closePopover(); }));
      }
    );
  });

  document.getElementById('meBtn')?.addEventListener('click', (e) => openMeMenu(e.currentTarget));
  document.getElementById('moreBtn')?.addEventListener('click', (e) => {
    popover(
      e.currentTarget,
      `${NAV.slice(4).map((n) => `<a class="menu-item" href="${n.href}">${n.ic}${n.l}</a>`).join('')}
       ${isAdmin() ? `<a class="menu-item" href="#/admin">${I.shield}Quản trị</a>` : ''}
       <div class="menu-sep"></div>
       <a class="menu-item" href="#/u/${store.me?.id}">${I.user}Hồ sơ của tôi</a>
       <button class="menu-item danger" data-logout>${I.logout}Đăng xuất</button>`,
      (pop) => pop.addEventListener('click', (ev) => { if (ev.target.closest('[data-logout]')) api.signOut(); if (ev.target.closest('a,button')) closePopover(); })
    );
  });

  document.getElementById('themeBtn')?.addEventListener('click', (e) => {
    const light = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = light ? 'light' : '';
    localStorage.setItem('pbkt_theme', light ? 'light' : '');
    e.currentTarget.innerHTML = light ? I.moon : I.sun;
  });

  document.getElementById('resetDemo')?.addEventListener('click', () => {
    if (confirm('Đặt lại toàn bộ dữ liệu demo về ban đầu?')) api.resetDemo();
  });

  const gs = document.getElementById('globalSearch');
  gs?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && gs.value.trim()) {
      location.hash = '#/search?q=' + encodeURIComponent(gs.value.trim());
      gs.blur();
    }
  });

  const tick = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    const el = document.getElementById('deckClock');
    if (el) el.innerHTML = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z · HAN ${p(d.getHours())}:${p(d.getMinutes())} · <span class="ok">● SVC</span>`;
  };
  tick();
  clearInterval(window.__deckT);
  window.__deckT = setInterval(tick, 20000);
}

function openMeMenu(anchor) {
  const m = store.me;
  const st = { approved: '<span class="chip ok">Đã duyệt</span>', pending: '<span class="chip live">Chờ duyệt</span>', locked: '<span class="chip bad">Bị khoá</span>' }[m?.status] || '';
  popover(
    anchor,
    `<div class="menu-head row">${avatar(m, 'lg')}<div style="min-width:0"><b>${esc(m?.full_name)}</b><small>@${esc(m?.handle)} · ${esc(m?.email)}</small><div style="margin-top:6px" class="row">${st}${m?.role === 'admin' ? '<span class="chip gold">Admin</span>' : ''}</div></div></div>
     <div class="menu-sep"></div>
     <a class="menu-item" href="#/u/${m?.id}">${I.user}Hồ sơ của tôi</a>
     <a class="menu-item" href="#/u/${m?.id}?edit=1">${I.edit}Chỉnh sửa hồ sơ</a>
     ${isAdmin() ? `<a class="menu-item" href="#/admin">${I.shield}Quản trị thành viên</a>` : ''}
     <div class="menu-sep"></div>
     <button class="menu-item danger" data-logout>${I.logout}Đăng xuất</button>`,
    (pop) =>
      pop.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-logout]')) {
          await api.signOut();
          toast('Đã đăng xuất. Hẹn gặp lại trên sân!');
        }
        if (ev.target.closest('a,button')) closePopover();
      })
  );
}
