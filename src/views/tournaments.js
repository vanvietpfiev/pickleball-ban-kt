/* Danh sách giải đấu & Lịch sử */
import { I } from '../lib/icons.js';
import { esc, emptyBox } from '../lib/utils.js';
import { store, isApproved } from '../data/store.js';
import { CAT, teamIn, seriesLabel, isTeamEvent } from '../logic/tournament.js';
import { tourneyCard } from '../components/cards.js';
import { fmtDate } from '../lib/utils.js';

export const title = 'Giải đấu';
let filter = 'all';
let catF = 'all';

const hasCat = (t, c) => c === 'all' || (c === 'TM' ? isTeamEvent(t) : (t.series || []).some((s) => s.cat === c));

export function render() {
  const T = store.tournaments;
  const by = (s) => T.filter((t) => t.status === s && hasCat(t, catF)).sort((a, b) => (s === 'done' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const groups = [
    ['live', 'Đang diễn ra', 'live'],
    ['setup', 'Mở đăng ký / đang chuẩn bị', ''],
    ['up', 'Sắp diễn ra', 'sky'],
    ['done', 'Đã kết thúc', ''],
  ].filter(([k]) => filter === 'all' || filter === k);
  const mine = store.me ? T.filter((t) => t.created_by === store.me.id).length : 0;

  return `<div class="anim-in">
    <div class="page-head">
      <div><h1>Giải đấu</h1><p>${T.length} giải · ${mine ? `bạn đã tạo ${mine} giải` : 'mọi thành viên đã duyệt đều có thể tạo giải'}</p></div>
      <div class="actions">${isApproved() ? `<a class="btn btn-gold" href="#/create">${I.plus} Tạo giải mới</a>` : `<span class="chip live">⏳ Cần được duyệt để tạo giải</span>`}</div>
    </div>
    <div class="row wrap between" style="gap:12px">
      <div class="pills">${[['all', 'Tất cả'], ['live', '● Đang đấu'], ['setup', 'Mở đăng ký'], ['up', 'Sắp tới'], ['done', 'Đã kết thúc']].map(([k, l]) => `<button class="pill ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="pills">${[['all', 'Mọi nội dung'], ...Object.entries(CAT).map(([k, v]) => [k, v.l])].map(([k, l]) => `<button class="pill ${catF === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
    </div>
    ${groups.map(([k, l, cls]) => {
      const list = by(k);
      if (!list.length) return filter === k ? emptyBox('🗓️', 'Không có giải nào', 'Thử đổi bộ lọc hoặc tạo giải mới.') : '';
      return `<div class="sec ${cls}"><h2>${l}</h2><span class="chip">${list.length}</span></div><div class="tgrid">${list.map(tourneyCard).join('')}</div>`;
    }).join('')}
    ${!T.length ? emptyBox('🏓', 'Chưa có giải đấu', 'Bấm “Tạo giải mới” để bắt đầu mùa giải đầu tiên.') : ''}
  </div>`;
}

export function mount(root, _p, rerender) {
  root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; rerender(); }));
  root.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { catF = b.dataset.c; rerender(); }));
}

/* ---------- Lịch sử ---------- */
export const history = {
  title: 'Lịch sử giải đấu',
  render() {
    const done = store.tournaments.filter((t) => t.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
    if (!done.length) return `<div class="page-head"><div><h1>Lịch sử giải đấu</h1></div></div>` + emptyBox('📜', 'Chưa có giải nào kết thúc', 'Khi một giải hoàn tất, hồ sơ vô địch sẽ được lưu vĩnh viễn tại đây.');
    const years = [...new Set(done.map((t) => t.date.slice(0, 4)))];
    return `<div class="anim-in">
      <div class="page-head"><div><h1>Lịch sử giải đấu</h1><p>${done.length} giải đã lưu hồ sơ · dữ liệu được lưu vĩnh viễn</p></div></div>
      ${years.map((y) => `<div class="sec"><h2>Năm ${y}</h2></div>
        <div class="timeline">${done.filter((t) => t.date.startsWith(y)).map((t) => {
          const pods = (t.series || []).filter((s) => s.podium).map((s) => {
            const nm = (k) => (s.podium[k] || []).map((id) => teamIn(s, id)?.name).filter(Boolean).map(esc).join(' · ');
            const c = nm(1), r = nm(2), th = nm(3);
            return `<div class="podium-mini">${t.series.length > 1 ? `<span class="chip">${esc(seriesLabel(t, s))}</span>` : ''}
              ${c ? `<span>🥇 <b>${c}</b></span>` : ''}${r ? `<span>🥈 ${r}</span>` : ''}${th ? `<span>🥉 ${th}</span>` : ''}</div>`;
          }).join('');
          const cats = isTeamEvent(t) ? 'Đồng đội' : [...new Set((t.series || []).map((s) => CAT[s.cat]?.l))].join(' · ');
          return `<a class="tl-item card hoverable" href="#/t/${t.id}?tab=champ">
            <div class="tl-date"><b>${fmtDate(t.date, false)}</b><small>${y}</small></div>
            <div class="tl-body"><h3>${esc(t.name)}</h3><p class="muted">${esc(cats)} · ${esc(t.venue)}</p>
              ${pods}</div>
            <span class="tl-go">${I.right}</span></a>`;
        }).join('')}</div>`).join('')}
    </div>`;
  },
};
