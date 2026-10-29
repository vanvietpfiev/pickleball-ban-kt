/* Chi tiết giải đấu: Series → Lịch · Vòng bảng · Nhánh đấu · Vô địch · Toàn đoàn · Đăng ký · Thảo luận · Quản lý */
import { I } from '../lib/icons.js';
import { esc, fmtDate, avatar, toast, emptyBox, timeAgo, confirmBox } from '../lib/utils.js';
import { store, profileById, isApproved } from '../data/store.js';
import { api } from '../data/api.js';
import {
  CAT, FORMATS, STATUS_LABEL, R_THIRD, canManage, teamIn, groupStandings, groupDone, seriesLabel,
  medalTable, isTeamEvent, matchWinner, allMatches,
} from '../logic/tournament.js';
import { matchCard, teamBadge, statusChip } from '../components/cards.js';
import { openScore } from '../components/scoreModals.js';
import * as M from './tmanage.js';

let tab = 'lich';
let lastId = null;
let selS = null;
let lastQS = null;
let lastQT = null;
let fil = { g: '', court: '' };

export function title(p) {
  return store.tournaments.find((x) => x.id === p.id)?.name || 'Giải đấu';
}

function pickTabs(t, s, mng) {
  const hasGroups = s && s.groups.length && s.matches.some((m) => m.stage === 'groups');
  const hasKO = s && s.matches.some((m) => m.stage === 'ko');
  const showReg = t.regOpen || (t.registrations || []).length || t.status === 'setup';
  return [
    ['lich', 'Lịch & Kết quả'],
    ...(hasGroups ? [['bang', s.groups.length > 1 ? 'Vòng bảng' : 'Bảng xếp hạng']] : []),
    ...(hasKO ? [['nhanh', 'Nhánh đấu']] : []),
    ['champ', 'Vô địch'],
    ...(t.series.length > 1 || isTeamEvent(t) ? [['toan', 'Toàn đoàn']] : []),
    ...(showReg ? [['dk', `Đăng ký${pendingN(t) && mng ? ` <span class="tab-badge">${pendingN(t)}</span>` : ''}`]] : []),
    ['talk', 'Thảo luận'],
    ...(mng ? [['manage', '⚙ Thiết lập']] : []),
  ];
}
const pendingN = (t) => (t.registrations || []).filter((r) => r.status === 'pending').length;

export function render(p) {
  const t = store.tournaments.find((x) => x.id === p.id);
  if (!t) return emptyBox('🔍', 'Không tìm thấy giải', 'Giải có thể đã bị xoá.', `<a class="btn btn-ghost" href="#/tournaments">${I.back} Danh sách giải</a>`);
  const mng = canManage(t, store.me);
  if (lastId !== t.id) {
    lastId = t.id;
    fil = { g: '', court: '' };
    selS = p.query.s || t.series[0]?.id || null;
    lastQS = p.query.s || null;
    lastQT = p.query.tab || null;
    tab = p.query.tab || (t.status === 'done' ? 'champ' : t.status === 'setup' ? (mng ? 'manage' : 'dk') : 'lich');
  } else {
    if ((p.query.s || null) !== lastQS) { lastQS = p.query.s || null; if (lastQS) selS = lastQS; }
    if ((p.query.tab || null) !== lastQT) { lastQT = p.query.tab || null; if (lastQT) tab = lastQT; }
  }
  if (!t.series.some((s) => s.id === selS)) selS = t.series[0]?.id || null;
  const s = t.series.find((x) => x.id === selS);
  const tabs = pickTabs(t, s, mng);
  if (!tabs.some(([k]) => k === tab)) tab = 'lich';
  const creator = profileById(t.created_by);
  const r = t.rules || {};
  const seriesScoped = ['lich', 'bang', 'nhanh', 'manage'].includes(tab);
  const body = { lich: schedule, bang: groupsTab, nhanh: bracketTab, champ: champTab, toan: medalTab, dk: regTab, talk, manage: M.render }[tab]?.(t, s, mng) || '';
  return `<div class="anim-in">
    <a class="back-link" href="#/tournaments">${I.back} Giải đấu</a>
    <section class="dhead" style="--hero-bg:${t.grad}">
      <span class="hero-keys" aria-hidden="true"></span>
      <div class="row wrap" style="gap:8px">${statusChip(t.status)}<span class="chip">${isTeamEvent(t) ? '🛡️ Giải đồng đội' : t.series.length > 1 ? `${t.series.length} nội dung` : `${CAT[s?.cat]?.ic || ''} ${esc(CAT[s?.cat]?.l || '')}`}</span>${t.regOpen ? '<span class="chip gold">📝 Đang nhận đăng ký</span>' : ''}${mng ? '<span class="chip gold">Bạn thuộc BTC giải</span>' : ''}</div>
      <h1>${esc(t.name)}</h1>
      <div class="hero-meta">
        <span>${I.cal}${fmtDate(t.date)}</span><span>${I.pin}${esc(t.venue || '—')}</span>
        <span>${I.ball}1 game · chạm ${r.ptw || 11} · cách ${r.diff || 2}${r.cap ? ' · trần ' + r.cap : ''}</span>
        <span>${avatar(creator, 'xs')} Tạo bởi ${esc(creator?.full_name || '—')}</span>
      </div>
    </section>
    ${t.series.length > 1 && seriesScoped ? `<div class="series-bar" role="tablist" aria-label="Chọn nội dung">${t.series.map((x) => `<button class="sb-item ${x.id === selS ? 'on' : ''}" data-series="${x.id}">
      <b>${esc(seriesLabel(t, x))}</b><small>${esc(FORMATS[x.format]?.l || '')} · ${x.teams.length} ${CAT[x.cat]?.size === 1 ? 'VĐV' : 'đội'}</small>${x.status === 'live' ? '<span class="dot"></span>' : x.status === 'done' ? '<span class="sb-ok">✓</span>' : ''}</button>`).join('')}</div>` : ''}
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="tabBody">${body}</div>
  </div>`;
}

export function mount(root, p, rerender) {
  const t = store.tournaments.find((x) => x.id === p.id);
  if (!t) return;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; rerender(); }));
  root.querySelectorAll('[data-series]').forEach((b) => (b.onclick = () => { selS = b.dataset.series; fil = { g: '', court: '' }; rerender(); }));
  root.querySelectorAll('[data-fg]').forEach((b) => (b.onclick = () => { fil.g = b.dataset.fg; rerender(); }));
  root.querySelectorAll('[data-fc]').forEach((b) => (b.onclick = () => { fil.court = b.dataset.fc; rerender(); }));
  root.querySelectorAll('[data-score]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); const [sid, mid] = b.dataset.score.split(':'); openScore(t, sid, mid); }));
  root.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { tab = b.dataset.goto; rerender(); }));
  mountReg(root, t);
  if (tab === 'manage') M.mount(root, t, t.series.find((x) => x.id === selS), rerender, (id) => { selS = id; });
}

/* ================= LỊCH & KẾT QUẢ ================= */
function schedule(t, s, mng) {
  if (!s) return emptyBox('🗂️', 'Giải chưa có nội dung', mng ? 'Vào tab Thiết lập để thêm nội dung thi đấu.' : 'BTC đang thiết lập giải.');
  if (!s.matches.length) return emptyBox('🗓️', 'Chưa có lịch thi đấu', mng ? 'Thêm VĐV/đội, chia bảng rồi bấm “Sinh lịch” trong tab Thiết lập.' : 'Lịch sẽ hiện khi BTC chốt danh sách và chia bảng.', mng ? `<button class="btn btn-gold" data-goto="manage">⚙ Mở Thiết lập</button>` : '');
  const courts = [...new Set(s.matches.map((m) => m.court).filter(Boolean))].sort();
  const gs = s.groups.length > 1 ? s.groups.map((g) => g.name) : [];
  const hasKO = s.matches.some((m) => m.stage === 'ko');
  const ok = (m) => (!fil.court || m.court === fil.court) && (!fil.g || (fil.g === 'ko' ? m.stage === 'ko' : m.group === fil.g && m.stage === 'groups'));
  const ms = s.matches.filter(ok);
  // nhóm theo vòng
  const sections = [];
  const grp = ms.filter((m) => m.stage === 'groups');
  const rounds = [...new Set(grp.map((m) => m.round))];
  rounds.forEach((r) => sections.push([s.groups.length > 1 ? `Vòng bảng · ${r}` : r, grp.filter((m) => m.round === r), 'sky']));
  const ko = ms.filter((m) => m.stage === 'ko');
  [...new Set(ko.map((m) => m.round))].forEach((r) => sections.push([r, ko.filter((m) => m.round === r), r === 'Chung kết' ? '' : 'live']));
  return `${s.needsRegen && mng ? `<div class="hint warn" style="margin-bottom:10px">⚠️ Có đội mới được thêm sau khi sinh lịch. Vào <b>Thiết lập</b> để sinh lại lịch cho nội dung này.</div>` : ''}
    ${mng ? `<p class="hint" style="margin-bottom:6px">Bấm <b>${isTeamEvent(t) ? 'Xếp đội & nhập điểm' : 'Nhập tỉ số'}</b> trên từng trận. Lưu ở trạng thái <b>Đang đấu</b> để mọi người xem trực tiếp – BXH & nhánh đấu tự cập nhật, đội thắng tự vào vòng sau.</p>` : ''}
    ${gs.length || hasKO || courts.length > 1 ? `<div class="filters">
      ${gs.length || hasKO ? `<div class="pills"><button class="pill ${!fil.g ? 'on' : ''}" data-fg="">Tất cả</button>${gs.map((g) => `<button class="pill ${fil.g === g ? 'on' : ''}" data-fg="${g}">Bảng ${g}</button>`).join('')}${hasKO && (gs.length || s.groups.length) ? `<button class="pill ${fil.g === 'ko' ? 'on' : ''}" data-fg="ko">Loại trực tiếp</button>` : ''}</div>` : ''}
      ${courts.length > 1 ? `<div class="pills"><button class="pill ${!fil.court ? 'on' : ''}" data-fc="">Mọi sân</button>${courts.map((c) => `<button class="pill ${fil.court === c ? 'on' : ''}" data-fc="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    </div>` : ''}
    ${sections.map(([l, list, cls]) => `<div class="sec ${cls}"><h3>${esc(l)}</h3><span class="chip">${list.filter((m) => m.status === 'done').length}/${list.filter((m) => m.status !== 'bye').length}</span></div>
      <div class="mgrid">${list.map((m) => matchCard(t, s, m, { editable: mng })).join('')}</div>`).join('') || emptyBox('🔎', 'Không có trận phù hợp', 'Thử bỏ bớt bộ lọc.')}`;
}

/* ================= VÒNG BẢNG ================= */
function advanceOf(s) {
  if (s.format === 'groups_ko') return s.config.advance || 2;
  if (s.format === 'rr_ko') { const n = s.teams.length; return Math.min(s.config.koTop || 4, n >= 8 ? 8 : n >= 4 ? 4 : 2); }
  return 0;
}
function groupsTab(t, s) {
  const adv = advanceOf(s);
  const team = isTeamEvent(t);
  const koFirst = s.matches.find((m) => m.stage === 'ko')?.round;
  const card = (g) => {
    const st = groupStandings(s, g.name, t.kind);
    const done = groupDone(s, g.name);
    const n = s.matches.filter((m) => m.stage === 'groups' && m.group === g.name);
    return `<div class="gcard card">
      <div class="gc-h"><b>${s.groups.length > 1 ? 'Bảng ' + esc(g.name) : 'Bảng xếp hạng'}</b><span class="chip ${done ? 'ok' : ''}">${done ? 'ĐÃ XONG' : `${n.filter((m) => m.status === 'done').length}/${n.length} trận`}</span></div>
      <table class="gtable"><thead><tr><th>#</th><th class="l">${CAT[s.cat]?.size === 1 ? 'VĐV' : 'Đội'}</th><th>Tr</th><th>T–B</th>${team ? '<th>Trận con</th>' : ''}<th>HS</th><th class="hide-sm">Phong độ</th></tr></thead>
      <tbody>${st.map((r, i) => `<tr class="${i < adv ? 'q' : ''}">
        <td><span class="rank ${['r1', 'r2', 'r3'][i] || ''}">${i + 1}</span></td>
        <td class="l"><div class="cell-team">${teamBadge(r.t, 'sm')}<div><div class="n">${esc(r.t.name)}</div>${r.t.unit ? `<div class="p">${esc(r.t.unit)}</div>` : ''}</div></div></td>
        <td>${r.pl}</td><td class="mono">${r.w}–${r.l}</td>${team ? `<td class="mono">${r.sw}–${r.sl}</td>` : ''}
        <td class="mono ${r.diff >= 0 ? 'pos' : 'neg'}">${r.diff > 0 ? '+' : ''}${r.diff}</td>
        <td class="hide-sm">${form(s, r.t.id)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  };
  return `<div class="ggrid ${s.groups.length === 1 ? 'one' : ''}">${s.groups.map(card).join('')}</div>
    <p class="muted" style="font-size:12px;margin-top:12px">Xếp hạng: Số trận thắng › Đối đầu trực tiếp (nhóm bằng điểm) › ${team ? 'Hiệu số trận con › ' : ''}Hiệu số điểm › Điểm ghi.${adv ? ` Dòng sáng: top ${adv}${s.groups.length > 1 ? ' mỗi bảng' : ''} vào ${esc(koFirst || 'vòng loại trực tiếp')}.` : ''}</p>`;
}
function form(s, id) {
  const ms = s.matches.filter((m) => m.status === 'done' && m.stage === 'groups' && (m.t1 === id || m.t2 === id)).slice(-5);
  if (!ms.length) return '<span class="muted">—</span>';
  return `<span class="form">${ms.map((m) => { const w = matchWinner(m) === id; return `<i class="${w ? 'w' : 'l'}">${w ? 'T' : 'B'}</i>`; }).join('')}</span>`;
}

/* ================= NHÁNH ĐẤU (cây) ================= */
function bracketTab(t, s, mng) {
  const ko = s.matches.filter((m) => m.stage === 'ko');
  const main = ko.filter((m) => !m.third);
  const third = ko.find((m) => m.third);
  const rounds = [...new Set(main.map((m) => m.round))];
  const bm = (m) => {
    const A = teamIn(s, m.t1), B = teamIn(s, m.t2);
    const d = m.status === 'done', bye = m.status === 'bye';
    const w = matchWinner(m);
    const r = (tm, id, src, sc) => `<div class="brow ${d || bye ? (w === id ? 'win' : 'lose') : ''}">${tm ? teamBadge(tm, 'sm') : '<span class="team-badge sm ghost">?</span>'}<span class="bn">${tm ? esc(tm.name) : id === 'BYE' ? '<i class="muted">Miễn đấu</i>' : `<i class="muted">${esc(M.srcText(s, src))}</i>`}</span><b class="mono">${bye ? '' : sc ?? ''}</b></div>`;
    const can = mng && A && B;
    return `<div class="bmatch ${m.round === 'Chung kết' ? 'final' : ''} ${m.status === 'live' ? 'live' : ''} ${bye ? 'bye' : ''} ${can ? 'clickable' : ''}" ${can ? `data-score="${s.id}:${m.id}" role="button" tabindex="0"` : ''}>
      ${r(A, m.t1, m.src1, m.s1)}${r(B, m.t2, m.src2, m.s2)}${m.court || m.time ? `<div class="bmeta">${esc([m.court, m.time].filter(Boolean).join(' · '))}</div>` : ''}</div>`;
  };
  return `<div class="btree-wrap"><div class="btree" style="--cols:${rounds.length}">
      ${rounds.map((r, ci) => `<div class="bcol ${ci === rounds.length - 1 ? 'last' : ''}"><h5>${esc(r)}${r === 'Chung kết' ? ' 🏆' : ''}</h5><div class="bcol-in">${main.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot).map((m) => `<div class="bslot">${bm(m)}</div>`).join('')}</div></div>`).join('')}
    </div></div>
    ${third ? `<div class="bthird"><h5>${R_THIRD} 🥉</h5>${bm(third)}</div>` : ''}
    <p class="muted" style="font-size:12px;margin-top:10px">Đội thắng tự động đi tiếp. Nếu sửa kết quả vòng trước làm thay đổi đội đi tiếp, các trận phía sau sẽ được làm mới.${mng ? ' Bấm vào trận để nhập tỉ số.' : ''}</p>`;
}

/* ================= VÔ ĐỊCH ================= */
function champTab(t) {
  const withPod = t.series.filter((s) => s.podium?.[1]?.length);
  if (!withPod.length) return emptyBox('⏳', 'Chưa có kết quả chung cuộc', 'Ngôi vô địch sẽ được xướng tên khi trận cuối cùng của mỗi nội dung kết thúc.');
  const pod = (s, ids, cls, medal) => {
    const tms = (ids || []).map((id) => teamIn(s, id)).filter(Boolean);
    if (!tms.length) return '<div></div>';
    return `<div class="pod ${cls}"><div class="medal">${medal}</div>${tms.map((tm) => `${teamBadge(tm)}<b>${esc(tm.name)}</b>${tm.unit ? `<small class="muted">${esc(tm.unit)}</small>` : ''}`).join('<span class="pod-sep"></span>')}</div>`;
  };
  const blocks = withPod.map((s) => `${t.series.length > 1 ? `<div class="sec"><h3>${esc(seriesLabel(t, s))}</h3><span class="chip">${esc(FORMATS[s.format]?.l || '')}</span></div>` : ''}
    <div class="podium">${pod(s, s.podium[2], 'silver', '🥈')}${pod(s, s.podium[1], 'gold', '🏆')}${pod(s, s.podium[3], 'bronze', '🥉')}</div>`).join('');
  const s0 = withPod[0];
  const champ = teamIn(s0, s0.podium[1][0]);
  const ref = 'CRS-KT-' + t.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  const nDone = allMatches(t).filter((m) => m.status === 'done').length;
  const list = withPod.map((s) => `${t.series.length > 1 ? esc(seriesLabel(t, s)) + ': ' : ''}<b>${esc(teamIn(s, s.podium[1][0])?.name || '')}</b>`).join(' · ');
  return `${blocks}
  ${t.status === 'done' ? `<div class="crs">
    <div class="crs-h"><div><small>CERTIFICATE OF RELEASE TO SERVICE</small><h4>Chứng nhận Vô địch · ${esc(t.name)}</h4></div><div class="crs-ref">Số: ${ref}<br>Form KT-PB-01</div></div>
    <div class="crs-grid">
      <div class="full"><small>${withPod.length > 1 ? 'Các nhà vô địch' : 'Đội / VĐV vô địch'}</small><b class="champ">${withPod.length > 1 ? list : esc(champ?.name || '')}</b></div>
      <div><small>Ngày</small><b>${fmtDate(t.date)}</b></div><div><small>Địa điểm</small><b>${esc(t.venue)}</b></div>
      <div><small>Số nội dung</small><b>${t.series.length}</b></div><div><small>Số trận hoàn thành</small><b>${nDone}</b></div>
    </div>
    <p class="crs-txt">Xác nhận các đội/VĐV nêu trên đã hoàn thành toàn bộ các trận theo điều lệ giải, đạt điều kiện và được công nhận ngôi Vô địch.</p>
    <div class="crs-sign"><span>Thể thức: <b>${esc(t.series.map((s) => FORMATS[s.format]?.l).filter((v, i, a) => a.indexOf(v) === i).join(' · '))}</b></span><span>Ký xác nhận: <b>BTC · Ban Kỹ thuật</b></span></div>
    <div class="stamp" aria-hidden="true">SERVICEABLE<small>VÔ ĐỊCH</small></div>
  </div>` : `<p class="hint">Giải vẫn đang diễn ra ở các nội dung khác – chứng nhận chung cuộc sẽ được cấp khi toàn bộ giải kết thúc.</p>`}`;
}

/* ================= TOÀN ĐOÀN ================= */
function medalTab(t) {
  const rows = medalTable(t, store.profiles);
  const any = rows.some((r) => r.g + r.s + r.b);
  return `<p class="hint" style="margin-bottom:12px">Bảng tổng sắp theo <b>đơn vị</b> (phòng/đội/trung tâm): xếp theo số HCV › HCB › HCĐ. Đơn vị của mỗi đội lấy theo trường “Đơn vị” BTC nhập, hoặc phòng ban trong hồ sơ nếu cả đội cùng phòng.</p>
    <div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Đơn vị</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Tổng</th><th>Số đội dự</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${i === 0 && any ? 'lead' : ''}"><td><span class="rank ${any ? ['r1', 'r2', 'r3'][i] || '' : ''}">${i + 1}</span></td><td class="l"><b>${esc(r.unit)}</b></td>
      <td class="mono">${r.g}</td><td class="mono">${r.s}</td><td class="mono">${r.b}</td><td class="mono">${r.g + r.s + r.b}</td><td>${r.entries}</td></tr>`).join('')}</tbody></table></div>
    ${any ? '' : '<p class="muted" style="font-size:12px;margin-top:10px">Huy chương sẽ được cộng khi từng nội dung kết thúc.</p>'}`;
}

/* ================= ĐĂNG KÝ ================= */
const REG_ST = { pending: ['live', 'Chờ duyệt'], approved: ['ok', 'Đã duyệt'], rejected: ['bad', 'Từ chối'], cancelled: ['', 'Đã huỷ'] };
function regTab(t, _s, mng) {
  const me = store.me;
  const regs = (t.registrations || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const mine = regs.filter((r) => r.pid === me?.id);
  const members = store.profiles.filter((p) => p.status === 'approved' && p.id !== me?.id);
  const sOpt = (sel) => t.series.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(seriesLabel(t, x))}</option>`).join('');
  const nameOf = (r) => esc(profileById(r.pid)?.full_name || '—') + (r.partner?.name ? ' · ' + esc(r.partner.name) : '') + (r.team_name ? ` <small class="muted">(${esc(r.team_name)})</small>` : '');
  const form = t.regOpen && isApproved() ? `<form class="card card-pad stack" id="regForm">
      <b class="side-h">📝 Đăng ký tham gia</b>
      <p class="muted" style="font-size:12.5px;margin-top:-6px">Ban tổ chức sẽ duyệt và xếp bạn vào ${isTeamEvent(t) ? 'đội' : 'nội dung'} phù hợp.</p>
      ${t.series.length ? `<label class="field"><span>Nội dung muốn đăng ký</span><select class="select" name="series">${sOpt(t.series[0].id)}</select></label>` : ''}
      ${isTeamEvent(t) ? `<label class="field"><span>Tên đội / đơn vị (nếu có)</span><input class="input" name="team" placeholder="VD: Trung tâm Bảo dưỡng"></label>`
        : `<label class="field" id="partnerField"><span>Đồng đội (với nội dung đôi)</span><input class="input" name="partner" list="regMembers" placeholder="Gõ tên thành viên hoặc khách mời" autocomplete="off"></label>
           <datalist id="regMembers">${members.map((p) => `<option value="${esc(p.full_name)}">@${esc(p.handle)}</option>`).join('')}</datalist>`}
      <label class="field"><span>Ghi chú cho BTC</span><input class="input" name="note" placeholder="VD: chỉ đánh được buổi sáng"></label>
      <button class="btn btn-gold" type="submit">${I.send} Gửi đăng ký</button>
    </form>` : t.regOpen ? `<div class="card card-pad"><p class="muted">Tài khoản cần được admin duyệt trước khi đăng ký giải.</p></div>` : `<div class="card card-pad"><p class="muted">Giải hiện không nhận đăng ký${mng ? ' – bật “Cho phép tự đăng ký” trong Thiết lập.' : '.'}</p></div>`;
  const row = (r) => {
    const [cls, lbl] = REG_ST[r.status] || ['', r.status];
    const s = t.series.find((x) => x.id === r.series_id);
    return `<div class="reg-row">
      ${avatar(profileById(r.pid), 'sm')}
      <div class="reg-n"><b>${nameOf(r)}</b><small>${esc(s ? seriesLabel(t, s) : '—')} · ${timeAgo(r.created_at)}${r.note ? ' · “' + esc(r.note) + '”' : ''}</small></div>
      ${mng && r.status === 'pending' ? `<select class="select sm" data-regs="${r.id}" aria-label="Xếp vào nội dung">${sOpt(r.series_id)}</select>
        <button class="btn btn-sm btn-ok" data-regok="${r.id}">${I.check} Duyệt</button><button class="btn btn-sm btn-ghost" data-regno="${r.id}">Từ chối</button>`
        : `<span class="chip ${cls}">${lbl}</span>`}
      ${r.pid === me?.id && r.status === 'pending' ? `<button class="btn btn-sm btn-ghost" data-regcancel="${r.id}">Huỷ</button>` : ''}
    </div>`;
  };
  const visible = mng ? regs : regs.filter((r) => r.status !== 'cancelled');
  return `<div class="grid-2" style="align-items:start">
    <div class="stack">${form}
      ${mine.length ? `<div class="card card-pad"><b class="side-h">Đăng ký của bạn</b>${mine.map(row).join('')}</div>` : ''}
    </div>
    <div class="card card-pad"><div class="row between"><b class="side-h">Danh sách đăng ký</b><span class="chip ${pendingN(t) ? 'live' : ''}">${pendingN(t)} chờ duyệt</span></div>
      ${visible.length ? visible.map(row).join('') : '<p class="muted" style="margin-top:8px">Chưa có ai đăng ký.</p>'}
      ${mng ? '<p class="muted" style="font-size:12px;margin-top:10px">Duyệt → người đăng ký được thêm vào nội dung đã chọn ở ô bên cạnh (BTC có thể xếp sang Series khác).</p>' : ''}
    </div>
  </div>`;
}
function mountReg(root, t) {
  const f = root.querySelector('#regForm');
  if (f) {
    const syncPartner = () => {
      const pf = root.querySelector('#partnerField');
      if (!pf) return;
      const s = t.series.find((x) => x.id === f.series?.value) || t.series[0];
      pf.hidden = !s || CAT[s.cat]?.size !== 2;
    };
    f.series?.addEventListener('change', syncPartner);
    syncPartner();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const series_id = f.series?.value || null;
      const pname = f.partner && !root.querySelector('#partnerField')?.hidden ? f.partner.value.trim() : '';
      const pp = pname ? store.profiles.find((x) => x.full_name.toLowerCase() === pname.toLowerCase() && x.status === 'approved') : null;
      try {
        await api.register(t.id, { series_id, partner: pname ? { name: pp?.full_name || pname, pid: pp?.id || null } : null, team_name: f.team?.value.trim() || '', note: f.note.value.trim() });
        toast('Đã gửi đăng ký – chờ BTC duyệt.', 'ok');
      } catch (ex) { toast(ex.message, 'err'); }
    };
  }
  root.querySelectorAll('[data-regok]').forEach((b) => (b.onclick = async () => {
    const sid = root.querySelector(`[data-regs="${b.dataset.regok}"]`)?.value;
    try { await api.reviewRegistration(t.id, b.dataset.regok, true, { series_id: sid }); toast('Đã duyệt & thêm vào danh sách thi đấu.', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }));
  root.querySelectorAll('[data-regno]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Từ chối đăng ký?', 'Người đăng ký sẽ nhận được thông báo.', 'Từ chối', true))) return;
    try { await api.reviewRegistration(t.id, b.dataset.regno, false); toast('Đã từ chối đăng ký.'); } catch (e) { toast(e.message, 'err'); }
  }));
  root.querySelectorAll('[data-regcancel]').forEach((b) => (b.onclick = async () => {
    try { await api.cancelRegistration(t.id, b.dataset.regcancel); toast('Đã huỷ đăng ký.'); } catch (e) { toast(e.message, 'err'); }
  }));
}

/* ================= THẢO LUẬN ================= */
function talk(t) {
  const tps = store.topics.filter((x) => x.tournament_id === t.id && !x.deleted_at);
  return `<div class="row between" style="margin-bottom:12px"><p class="muted">Chủ đề thảo luận gắn với giải này.</p>${isApproved() ? `<a class="btn btn-gold btn-sm" href="#/forum?new=1&t=${t.id}">${I.plus} Tạo chủ đề</a>` : ''}</div>
    ${tps.length ? `<div class="stack">${tps.map((tp) => {
      const n = store.comments.filter((c) => c.topic_id === tp.id && !c.deleted_at).length;
      return `<a class="card card-pad hoverable row" href="#/topic/${tp.id}">${avatar(profileById(tp.author_id))}<div style="flex:1;min-width:0"><b>${esc(tp.title)}</b><div class="muted" style="font-size:12px">${esc(profileById(tp.author_id)?.full_name)} · ${timeAgo(tp.created_at)}</div></div><span class="chip">${n} 💬</span></a>`;
    }).join('')}</div>` : emptyBox('💬', 'Chưa có thảo luận', 'Hãy mở chủ đề đầu tiên cho giải này.')}`;
}

export { STATUS_LABEL };
