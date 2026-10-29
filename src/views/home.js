/* Trang chủ – Trực tiếp: CHỈ giải đang đấu / sắp đấu (không lẫn giải cũ) */
import { I } from '../lib/icons.js';
import { esc, fmtDate, avatar, timeAgo, emptyBox } from '../lib/utils.js';
import { store, profileById, isApproved } from '../data/store.js';
import { FORMATS, allMatches, groupStandings, seriesLabel, headlineChampion, isTeamEvent, teamIn } from '../logic/tournament.js';
import { matchCard, tourneyCard, teamBadge, formatSummary } from '../components/cards.js';

export const title = 'Trực tiếp';

let selT = null; // giải đang xem (khi có nhiều giải cùng diễn ra)
let court = ''; // lọc theo sân
let timer = null;

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

export function render() {
  const T = store.tournaments;
  const live = T.filter((t) => t.status === 'live').sort((a, b) => a.date.localeCompare(b.date));
  const up = T.filter((t) => t.status === 'up').sort((a, b) => a.date.localeCompare(b.date));
  const reg = T.filter((t) => t.status === 'setup').sort((a, b) => a.date.localeCompare(b.date));
  const lastDone = T.filter((t) => t.status === 'done').sort((a, b) => b.date.localeCompare(a.date)).find((t) => headlineChampion(t));

  if (!live.length) return calm(up, reg, lastDone);

  if (!live.some((t) => t.id === selT)) selT = live[0].id;
  const t = live.find((x) => x.id === selT);
  const ms = allMatches(t);
  const courts = [...new Set(ms.map((m) => m.court).filter(Boolean))].sort();
  if (court && !courts.includes(court)) court = '';
  const byCourt = (m) => !court || m.court === court;
  const liveM = ms.filter((m) => m.status === 'live' && byCourt(m));
  const nextM = ms.filter((m) => m.status === 'up' && m.t1 && m.t2 && m.t1 !== 'BYE' && m.t2 !== 'BYE' && byCourt(m))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99')).slice(0, 6);
  const todayM = ms.filter((m) => m.status === 'done' && isToday(m.updated_at) && byCourt(m))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  const topics = [...store.topics].filter((x) => !x.deleted_at && (x.tournament_id === t.id || !x.tournament_id))
    .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))).slice(0, 4);

  return `<div class="anim-in">
    ${live.length > 1 ? `<div class="live-switch" role="tablist" aria-label="Giải đang diễn ra">${live.map((x) => `<button class="ls-chip ${x.id === t.id ? 'on' : ''}" data-selt="${x.id}"><span class="dot"></span>${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${liveHero(t, ms)}

    <div class="home-grid">
      <div class="home-main">
        ${courts.length > 1 ? `<div class="court-filter"><span class="cf-l">${I.pin} Lọc theo sân</span><div class="pills">
          <button class="pill ${!court ? 'on' : ''}" data-court="">Tất cả</button>
          ${courts.map((c) => `<button class="pill ${court === c ? 'on' : ''}" data-court="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}

        <div class="sec live"><h2>Đang thi đấu</h2>${liveM.length ? `<span class="chip live"><span class="dot"></span>${liveM.length} trận</span>` : ''}</div>
        ${liveM.length ? `<div class="mgrid">${liveM.map((m) => matchCard(t, m._s, m, { link: true })).join('')}</div>`
          : `<div class="card card-pad quiet">Không có trận nào đang diễn ra${court ? ' ở ' + esc(court) : ''} – các sân đang nghỉ giữa lượt.</div>`}

        ${nextM.length ? `<div class="sec sky"><h2>Trận kế tiếp</h2></div><div class="mgrid">${nextM.map((m) => matchCard(t, m._s, m, { link: true })).join('')}</div>` : ''}
        ${todayM.length ? `<div class="sec"><h2>Kết quả hôm nay</h2><a class="link-btn" href="#/t/${t.id}">Toàn bộ lịch →</a></div><div class="mgrid">${todayM.map((m) => matchCard(t, m._s, m, { link: true })).join('')}</div>` : ''}

        ${up.length || reg.length ? `<div class="sec"><h2>Sắp tới</h2><a class="link-btn" href="#/tournaments">Tất cả giải →</a></div><div class="tgrid">${[...up, ...reg].slice(0, 2).map(tourneyCard).join('')}</div>` : ''}
      </div>

      <aside class="home-side">
        ${miniStandings(t)}
        <div class="card card-pad" style="margin-top:14px">
          <div class="row between" style="margin-bottom:10px"><b class="side-h">💬 Thảo luận</b><a class="link-btn" href="#/forum">Diễn đàn</a></div>
          ${topics.map((tp) => {
            const n = store.comments.filter((c) => c.topic_id === tp.id && !c.deleted_at).length;
            return `<a class="side-topic" href="#/topic/${tp.id}">${avatar(profileById(tp.author_id), 'sm')}<div><b>${esc(tp.title)}</b><small>${n} bình luận · ${timeAgo(lastActivity(tp))}</small></div></a>`;
          }).join('') || '<p class="muted">Chưa có chủ đề nào.</p>'}
        </div>
      </aside>
    </div>
  </div>`;
}

export function mount(root, p, rerender) {
  root.querySelectorAll('[data-selt]').forEach((b) => (b.onclick = () => { selT = b.dataset.selt; court = ''; rerender(); }));
  root.querySelectorAll('[data-court]').forEach((b) => (b.onclick = () => { court = b.dataset.court; rerender(); }));
  clearInterval(timer);
  const cd = root.querySelector('[data-countdown]');
  if (cd) {
    const target = new Date(cd.dataset.countdown + 'T07:30:00').getTime();
    const tick = () => {
      if (!cd.isConnected) return clearInterval(timer);
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const mi = Math.floor(s / 60); s %= 60;
      cd.innerHTML = [[d, 'ngày'], [h, 'giờ'], [mi, 'phút'], [s, 'giây']].map(([v, l]) => `<div class="cd-cell"><b class="mono">${String(v).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
    };
    tick();
    timer = setInterval(tick, 1000);
  }
}

function lastActivity(tp) {
  const cs = store.comments.filter((c) => c.topic_id === tp.id);
  return cs.reduce((mx, c) => (c.created_at > mx ? c.created_at : mx), tp.created_at);
}

/* ---------- hero khi có giải đang diễn ra ---------- */
function liveHero(t, ms) {
  const real = ms.filter((m) => m.status !== 'bye');
  const doneN = real.filter((m) => m.status === 'done').length;
  const prog = real.length ? Math.round((doneN / real.length) * 100) : 0;
  return `<section class="hero" style="--hero-bg:${t.grad}">
    <span class="hero-keys" aria-hidden="true"></span>
    <span class="hero-num" aria-hidden="true">11<small>CHẠM</small></span>
    <div class="hero-body">
      <span class="chip live"><span class="dot"></span>GIẢI ĐANG DIỄN RA</span>
      <h1>${esc(t.name)}</h1>
      <div class="hero-meta">
        <span>${I.cal}${fmtDate(t.date)}</span><span>${I.pin}${esc(t.venue || '—')}</span><span>${I.ball}${esc(formatSummary(t))}</span>
      </div>
      ${t.series.length > 1 ? `<div class="hero-series">${t.series.map((s) => {
        const d = s.matches.filter((m) => m.status === 'done').length, n = s.matches.filter((m) => m.status !== 'bye').length;
        return `<a class="hs-item" href="#/t/${t.id}?s=${s.id}"><b>${esc(seriesLabel(t, s))}</b><small>${esc(FORMATS[s.format]?.l || '')} · ${d}/${n} trận</small></a>`;
      }).join('')}</div>` : ''}
      <div class="hero-prog"><div class="bar"><i style="width:${prog}%"></i></div><small>${doneN}/${real.length} trận đã hoàn tất</small></div>
    </div>
    <a class="btn btn-gold btn-lg hero-cta" href="#/t/${t.id}">Xem giải ${I.right}</a>
    <span class="hero-runway" aria-hidden="true"></span>
  </section>`;
}

/* ---------- BXH thu gọn của giải đang đấu ---------- */
function miniStandings(t) {
  const blocks = [];
  for (const s of t.series) {
    for (const g of s.groups) {
      const st = groupStandings(s, g.name, t.kind);
      if (!st.length) continue;
      const adv = s.format === 'groups_ko' ? s.config.advance || 2 : s.format === 'rr_ko' ? s.config.koTop || 4 : 0;
      const title = `${t.series.length > 1 ? seriesLabel(t, s) + ' · ' : ''}${s.groups.length > 1 ? 'Bảng ' + g.name : 'BXH'}`;
      blocks.push(`<div class="ms-block"><div class="ms-h">${esc(title)}</div>${st.map((r, i) => `<div class="ms-row ${i < adv ? 'q' : ''}"><span class="rank ${['r1', 'r2', 'r3'][i] || ''}">${i + 1}</span>${teamBadge(r.t, 'sm')}<span class="ms-n">${esc(r.t.name)}</span><span class="mono ms-w">${r.w}–${r.l}</span><span class="mono ms-d ${r.diff >= 0 ? 'pos' : 'neg'}">${r.diff > 0 ? '+' : ''}${r.diff}</span></div>`).join('')}</div>`);
    }
  }
  if (!blocks.length) return '';
  return `<div class="card card-pad"><div class="row between" style="margin-bottom:6px"><b class="side-h">📊 Bảng xếp hạng</b><a class="link-btn" href="#/t/${t.id}">Chi tiết</a></div>${blocks.join('')}<p class="muted ms-note">Dòng sáng màu: đang trong nhóm đi tiếp.</p></div>`;
}

/* ---------- khi KHÔNG có giải nào đang diễn ra ---------- */
function calm(up, reg, lastDone) {
  const next = up[0] || reg[0];
  const hc = lastDone && headlineChampion(lastDone);
  const champLine = hc ? `<a class="last-champ" href="#/t/${lastDone.id}"><span class="lc-ic">👑</span><span>Nhà vô địch gần nhất: <b>${esc(hc.team?.name || '')}</b> · ${esc(lastDone.name)}${lastDone.series.length > 1 ? ' (' + esc(seriesLabel(lastDone, hc.series)) + ')' : ''}</span>${I.right}</a>` : '';
  if (!next) {
    return `<div class="anim-in">
      <section class="hero calm" style="--hero-bg:linear-gradient(120deg,#06315a,#0b4f7f)">
        <span class="hero-keys" aria-hidden="true"></span>
        <div class="hero-body">
          <span class="chip">SÂN ĐANG NGHỈ</span>
          <h1>Chưa có giải nào sắp diễn ra</h1>
          <p class="hero-sub">Khi có giải đang đấu, tỉ số trực tiếp sẽ hiện tại đây.</p>
          ${isApproved() ? `<a class="btn btn-gold" href="#/create" style="margin-top:18px">${I.plus} Tạo giải mới</a>` : ''}
        </div>
        <span class="hero-runway" aria-hidden="true"></span>
      </section>
      ${champLine}
    </div>`;
  }
  const others = [...up, ...reg].filter((x) => x !== next);
  return `<div class="anim-in">
    <section class="hero" style="--hero-bg:${next.grad}">
      <span class="hero-keys" aria-hidden="true"></span>
      <div class="hero-body">
        <span class="chip ${next.status === 'setup' ? 'gold' : 'sky'}">${next.status === 'setup' ? (next.regOpen ? '📝 ĐANG MỞ ĐĂNG KÝ' : 'ĐANG CHUẨN BỊ') : 'SẮP KHỞI TRANH'}</span>
        <h1>${esc(next.name)}</h1>
        <div class="hero-meta"><span>${I.cal}${fmtDate(next.date)}</span><span>${I.pin}${esc(next.venue || '—')}</span><span>${I.ball}${esc(formatSummary(next))}</span></div>
        <div class="countdown" data-countdown="${esc(next.date)}" aria-label="Đếm ngược tới ngày thi đấu"></div>
      </div>
      <a class="btn btn-gold btn-lg hero-cta" href="#/t/${next.id}">${next.status === 'setup' && next.regOpen && isApproved() ? 'Đăng ký ngay' : 'Xem giải'} ${I.right}</a>
      <span class="hero-runway" aria-hidden="true"></span>
    </section>
    ${champLine}
    <div class="sec live"><h2>Đang thi đấu</h2></div>
    <div class="card card-pad quiet">Hiện không có giải nào đang diễn ra. Tỉ số trực tiếp sẽ tự hiện ở đây khi trận đầu tiên bắt đầu.</div>
    ${others.length ? `<div class="sec"><h2>Các giải sắp tới</h2><a class="link-btn" href="#/tournaments">Tất cả giải →</a></div><div class="tgrid">${others.slice(0, 4).map(tourneyCard).join('')}</div>` : ''}
  </div>`;
}
