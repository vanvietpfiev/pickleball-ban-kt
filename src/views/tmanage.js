/* Tab "Thiết lập" của giải – dành cho BTC (người tạo, người được giao, admin)
   Nội dung (Series) · Danh sách VĐV/đội · Chia bảng · Sinh lịch · Thông tin & luật · Đăng ký · BTC */
import { I } from '../lib/icons.js';
import { esc, toast, openModal, confirmBox, avatar } from '../lib/utils.js';
import { store, profileById } from '../data/store.js';
import { api } from '../data/api.js';
import {
  CAT, FORMATS, RUBBER_PRESETS, makeTeam, newSeries, assignGroups, generateSeries, seriesLabel, srcLabel, isTeamEvent, allTeams,
} from '../logic/tournament.js';
import { teamBadge } from '../components/cards.js';

export const srcText = (s, src) => srcLabel(s, src);
const clone = (o) => JSON.parse(JSON.stringify(o));
let drawAnim = false; // bật hiệu ứng lần vẽ ngay sau khi bốc thăm

export function render(t, s) {
  const isOwner = store.me && (store.me.id === t.created_by || store.me.role === 'admin');
  const team = isTeamEvent(t);
  return `<div class="mg-grid">
    <div class="mg-main stack">
      ${s ? seriesSetup(t, s, team) : `<div class="card card-pad">${'<p class="muted">Giải chưa có nội dung nào. Thêm nội dung ở cột bên phải.</p>'}</div>`}
    </div>
    <aside class="mg-side stack">
      ${seriesList(t)}
      <form class="card card-pad stack" id="infoForm">
        <b class="side-h">Thông tin & luật điểm</b>
        <label class="field"><span>Tên giải</span><input class="input" name="name" value="${esc(t.name)}"></label>
        <div class="grid-2"><label class="field"><span>Ngày</span><input class="input" type="date" name="date" value="${esc(t.date)}"></label>
        <label class="field"><span>Địa điểm</span><input class="input" name="venue" value="${esc(t.venue)}"></label></div>
        <div class="grid-3">
          <label class="field"><span>Chạm</span><select class="select" name="ptw">${[11, 15, 21].map((v) => `<option ${t.rules?.ptw === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Cách biệt</span><select class="select" name="diff">${[2, 1].map((v) => `<option ${t.rules?.diff === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Điểm trần</span><select class="select" name="cap"><option value="0">Không</option>${[13, 15, 17, 21, 25].map((v) => `<option ${t.rules?.cap === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <p class="muted" style="font-size:12px;margin-top:-4px">Mỗi trận 1 game quyết định thắng thua (kể cả Bán kết/Chung kết).</p>
        <button class="btn btn-gold" type="submit">Lưu thông tin</button>
      </form>
      <div class="card card-pad stack">
        <b class="side-h">Đăng ký trực tuyến</b>
        <label class="switch-row"><input type="checkbox" id="regOpen" ${t.regOpen ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span>Cho phép thành viên tự đăng ký<br><small class="muted">BTC duyệt ở tab Đăng ký</small></span></label>
      </div>
      <div class="card card-pad stack">
        <b class="side-h">Ban tổ chức giải</b>
        <p class="muted" style="font-size:12.5px">Có quyền xếp người, chia bảng, nhập điểm, duyệt đăng ký.</p>
        <div class="row">${avatar(profileById(t.created_by), 'sm')}<span style="flex:1">${esc(profileById(t.created_by)?.full_name || '—')}</span><span class="chip gold">Người tạo</span></div>
        ${(t.managers || []).map((id) => { const p = profileById(id); return `<div class="row">${avatar(p, 'sm')}<span style="flex:1">${esc(p?.full_name)}</span>${isOwner ? `<button class="btn btn-sm btn-ghost" data-rmmgr="${id}">Gỡ</button>` : ''}</div>`; }).join('')}
        ${isOwner ? `<button class="btn btn-ghost" id="addMgr">${I.plus} Thêm thành viên BTC</button>` : ''}
        ${isOwner ? `<div class="menu-sep"></div><button class="btn btn-danger" id="delT">${I.trash} Xoá giải đấu</button>` : ''}
      </div>
    </aside>
  </div>`;
}

/* ---------- danh sách nội dung (Series) ---------- */
function seriesList(t) {
  return `<div class="card card-pad stack">
    <div class="row between"><b class="side-h">Nội dung / Series</b><span class="chip">${t.series.length}</span></div>
    ${t.series.map((x) => `<div class="row sl-row"><span class="sl-dot ${x.status}"></span><div style="flex:1;min-width:0"><b>${esc(seriesLabel(t, x))}</b><br><small class="muted">${esc(FORMATS[x.format]?.l || '')} · ${x.teams.length} ${CAT[x.cat]?.size === 1 ? 'VĐV' : 'đội'}</small></div>
      <button class="icon-btn sm" data-pick="${x.id}" aria-label="Chọn">${I.edit}</button>${t.series.length > 1 ? `<button class="icon-btn sm" data-delS="${x.id}" aria-label="Xoá nội dung">${I.trash}</button>` : ''}</div>`).join('')}
    <div class="row"><input class="input" id="newSName" placeholder="${isTeamEvent(t) ? 'VD: Đồng đội nữ' : 'VD: Series B · Đôi nam'}"><button class="btn btn-ghost" id="addS">${I.plus}</button></div>
  </div>`;
}

/* ---------- cấu hình + danh sách + chia bảng + sinh lịch cho 1 Series ---------- */
function seriesSetup(t, s, team) {
  const c = s.config;
  const locked = s.matches.length > 0;
  const started = s.matches.some((m) => m.status === 'done' || m.status === 'live');
  const members = store.profiles.filter((p) => p.status === 'approved');
  const size = team ? 0 : CAT[s.cat]?.size || 2;
  const unitN = new Set(s.teams.map((x) => x.unit).filter(Boolean)).size;
  const fmtOpts = Object.entries(FORMATS).map(([k, v]) => `<button type="button" class="fmt-opt ${s.format === k ? 'on' : ''}" data-fmt="${k}"><b>${v.ic}</b><span>${esc(v.l)}</span><small>${esc(v.d)}</small></button>`).join('');
  return `
  <div class="card card-pad stack">
    <div class="row between wrap"><b class="side-h">① Thể thức · ${esc(seriesLabel(t, s))}</b>${locked ? '<span class="chip live">Đã sinh lịch</span>' : '<span class="chip">Chưa sinh lịch</span>'}</div>
    <div class="grid-2">
      <label class="field"><span>Tên nội dung</span><input class="input" id="s_name" value="${esc(s.name)}" placeholder="VD: Series A"></label>
      ${team ? `<label class="field"><span>Loại</span><input class="input" value="Đồng đội" disabled></label>` : `<label class="field"><span>Nội dung</span><select class="select" id="s_cat" ${s.teams.length ? 'title="Đã có VĐV – chỉ đổi giữa các nội dung cùng số người"' : ''}>${Object.entries(CAT).filter(([k]) => k !== 'TM').map(([k, v]) => `<option value="${k}" ${s.cat === k ? 'selected' : ''} ${s.teams.length && v.size !== CAT[s.cat].size ? 'disabled' : ''}>${v.ic} ${v.l}</option>`).join('')}</select></label>`}
    </div>
    <div class="fmt-opts">${fmtOpts}</div>
    <div class="cfg-row">
      ${s.format === 'groups_ko' ? `<label class="field"><span>Số bảng</span><input class="input" type="number" min="1" max="16" id="c_groups" value="${c.groups}"></label>
        <label class="field"><span>Số đội đi tiếp / bảng</span><select class="select" id="c_adv">${[1, 2, 3, 4].map((v) => `<option ${c.advance === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      ${s.format === 'rr_ko' ? `<label class="field"><span>Số đội vào loại trực tiếp</span><select class="select" id="c_ko">${[[2, 'Top 2 → Chung kết'], [4, 'Top 4 → Bán kết'], [8, 'Top 8 → Tứ kết']].map(([v, l]) => `<option value="${v}" ${c.koTop === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      ${s.format !== 'rr' ? `<label class="switch-row"><input type="checkbox" id="c_third" ${c.third !== false ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span>Đấu tranh hạng 3<br><small class="muted">Tắt: đồng hạng 3 cho 2 đội thua bán kết</small></span></label>` : ''}
    </div>
    ${team ? `<div class="field"><span>Trận con mặc định cho mỗi lượt gặp</span>
      <div class="rub-chips">${(c.rubbers || []).map((r, i) => `<span class="chip gold">${esc(r)} <button type="button" class="x" data-rmrub="${i}" aria-label="Bỏ">✕</button></span>`).join('')}
      <select class="select sm" id="addRub"><option value="">+ Thêm…</option>${RUBBER_PRESETS.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>
      <small class="muted">Đây chỉ là mẫu – BTC vẫn thêm/bớt trận con cho từng lượt gặp khi nhập điểm.</small></div>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn btn-gold" id="saveCfg">Lưu thể thức</button></div>
  </div>

  <div class="card card-pad stack">
    <div class="row between wrap"><b class="side-h">② ${team ? 'Các đội tham dự' : size === 1 ? 'Vận động viên' : 'Cặp đấu'}</b><span class="chip gold mono">${s.teams.length}</span></div>
    ${locked ? `<p class="hint warn">Lịch đã được sinh – chỉ sửa được tên/đơn vị. ${started ? 'Muốn thêm/bớt đội cần <b>sinh lại lịch</b> (kết quả cũ sẽ bị xoá).' : 'Bấm “Xoá lịch” ở bước ④ để chỉnh danh sách.'}</p>` : ''}
    <datalist id="memberList">${members.map((p) => `<option value="${esc(p.full_name)}">@${esc(p.handle)} · ${p.gender === 'F' ? 'Nữ' : 'Nam'} · ${esc(p.dept || '')}</option>`).join('')}</datalist>
    ${locked ? '' : team ? `<div class="add-team team">
        <input class="input" id="tm_name" placeholder="Tên đội *">
        <input class="input" id="tm_unit" placeholder="Đơn vị (phòng/đội)">
        <textarea class="textarea" id="tm_roster" rows="3" placeholder="Danh sách VĐV – mỗi dòng 1 người (gõ đúng tên thành viên để liên kết hồ sơ)"></textarea>
        <button class="btn btn-gold" id="addTeam">${I.plus} Thêm đội</button></div>`
      : `<div class="add-team">
        <input class="input" id="p_a" list="memberList" placeholder="${size === 1 ? 'Tên VĐV' : 'VĐV 1'}" autocomplete="off">
        ${size === 2 ? '<input class="input" id="p_b" list="memberList" placeholder="VĐV 2" autocomplete="off">' : ''}
        <button class="btn btn-gold" id="addTeam">${I.plus} Thêm</button></div>`}
    <div class="form-err" id="teamErr"></div>
    ${s.teams.length ? `<div class="team-list">${s.teams.map((tm, i) => `<div class="tl-row">
        ${teamBadge(tm, 'sm')}
        <div class="tl-n"><b>${esc(tm.name)}</b>${team ? `<small class="muted">${tm.players.length} VĐV: ${tm.players.map((p) => esc(p.name)).join(', ')}</small>` : ''}${tm.unit ? `<small class="chip" style="padding:1px 7px">${esc(tm.unit)}</small>` : ''}</div>
        ${s.format === 'ko' || s.format === 'groups_ko' ? `<label class="seed" title="Hạt giống (1 = mạnh nhất)">#<input type="number" min="1" data-seed="${tm.id}" value="${tm.seed ?? ''}" ${locked ? 'disabled' : ''} aria-label="Hạt giống"></label>` : ''}
        <button class="icon-btn sm" data-editT="${tm.id}" aria-label="Sửa">${I.edit}</button>
        ${locked ? '' : `<button class="icon-btn sm" data-rmT="${i}" aria-label="Xoá">${I.x}</button>`}
      </div>`).join('')}</div>` : '<p class="muted">Chưa có ai. Thêm trực tiếp ở trên hoặc duyệt đăng ký của thành viên.</p>'}
  </div>

  ${s.format === 'groups_ko' ? `<div class="card card-pad stack">
    <div class="row between wrap"><b class="side-h">③ Chia bảng</b><span class="muted" style="font-size:12px">${s.teams.length} đội · ${c.groups} bảng · ~${Math.ceil(s.teams.length / Math.max(1, c.groups))} đội/bảng</span></div>
    ${locked ? '' : `<div class="row wrap" style="gap:8px">
      <button class="btn btn-gold" id="drawRandom" ${s.teams.length < 2 ? 'disabled' : ''}>🎲 Bốc thăm ngẫu nhiên</button>
      <button class="btn btn-ghost" id="drawSnake" ${s.teams.length < 2 ? 'disabled' : ''}>🐍 Chia rắn theo hạt giống</button>
      <label class="switch-row sm"><input type="checkbox" id="avoidUnit" ${unitN > 1 ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span>Tránh 2 đội cùng đơn vị chung bảng</span></label>
    </div>`}
    ${s.groups.length ? `<div class="draw-grid ${drawAnim ? 'anim' : ''}">${s.groups.map((g, gi) => `<div class="draw-g"><h5>Bảng ${esc(g.name)}</h5>${g.teamIds.map((id, k) => {
      const tm = s.teams.find((x) => x.id === id);
      return tm ? `<div class="draw-t" style="--d:${(k * s.groups.length + gi) * 70}ms">${teamBadge(tm, 'sm')}<span>${esc(tm.name)}</span>${locked ? '' : `<select class="select xs" data-move="${id}" aria-label="Chuyển bảng">${s.groups.map((x) => `<option ${x.name === g.name ? 'selected' : ''}>${x.name}</option>`).join('')}</select>`}</div>` : '';
    }).join('')}</div>`).join('')}</div>` : '<p class="muted">Chưa chia bảng. Bốc thăm hoặc chia theo hạt giống – có thể chỉnh tay từng đội sau đó.</p>'}
    ${s.groups.length && s.groups.flatMap((g) => g.teamIds).length !== s.teams.length ? '<p class="hint warn">Có đội chưa được xếp bảng – hãy bốc thăm lại.</p>' : ''}
  </div>` : ''}

  <div class="card card-pad stack">
    <b class="side-h">${s.format === 'groups_ko' ? '④' : '③'} Lịch thi đấu</b>
    ${locked ? `<p class="muted">Đã sinh <b>${s.matches.filter((m) => m.status !== 'bye').length}</b> trận${s.needsRegen ? ' · <span class="chip live">Có đội mới – cần sinh lại</span>' : ''}.</p>
      <div class="row wrap" style="gap:8px"><button class="btn btn-ghost" id="regen">${I.undo} Sinh lại lịch</button><button class="btn btn-danger" id="clearSched">Xoá lịch</button></div>`
      : `<p class="muted">${s.teams.length < 2 ? 'Cần tối thiểu 2 đội.' : 'Lịch vòng tròn & nhánh loại trực tiếp sẽ được tạo tự động. Đội đi tiếp được điền dần khi có kết quả.'}</p>
      <button class="btn btn-gold btn-lg" id="gen" ${s.teams.length < 2 ? 'disabled' : ''}>🏁 Sinh lịch thi đấu</button>`}
  </div>`;
}

/* ---------- gắn sự kiện ---------- */
export function mount(root, t, s, rerender, setSel) {
  const $ = (q) => root.querySelector(q);
  const team = isTeamEvent(t);
  const save = async (patch, msg) => {
    try { await api.updateTournament(t.id, patch); msg && toast(msg, 'ok'); return true; } catch (e) { toast(e.message, 'err'); return false; }
  };
  const withSeries = (fn, msg) => {
    const series = clone(t.series);
    const x = series.find((y) => y.id === s.id);
    if (fn(x, series) === false) return;
    return save({ series }, msg);
  };
  drawAnim = false;

  /* info / rules */
  $('#infoForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    save({ name: f.name.value.trim() || t.name, date: f.date.value, venue: f.venue.value.trim(), rules: { ptw: +f.ptw.value, diff: +f.diff.value, cap: +f.cap.value } }, 'Đã lưu thông tin giải.');
  });
  $('#regOpen')?.addEventListener('change', (e) => save({ regOpen: e.target.checked }, e.target.checked ? 'Đã mở đăng ký cho thành viên.' : 'Đã đóng đăng ký.'));

  /* series list */
  root.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { setSel(b.dataset.pick); rerender(); }));
  $('#addS')?.addEventListener('click', async () => {
    const name = $('#newSName').value.trim() || `Nội dung ${t.series.length + 1}`;
    const base = t.series[t.series.length - 1];
    const ns = newSeries({ name, cat: team ? 'TM' : base?.cat || 'XD', format: base?.format || 'rr', config: base ? clone(base.config) : {} });
    if (await save({ series: [...clone(t.series), ns] }, `Đã thêm “${name}”.`)) { setSel(ns.id); }
  });
  root.querySelectorAll('[data-dels]').forEach((b) => (b.onclick = async () => {
    const x = t.series.find((y) => y.id === b.dataset.dels);
    if (!(await confirmBox('Xoá nội dung?', `“${esc(seriesLabel(t, x))}” cùng toàn bộ đội và kết quả sẽ bị xoá.`, 'Xoá', true))) return;
    save({ series: clone(t.series).filter((y) => y.id !== x.id) }, 'Đã xoá nội dung.');
  }));

  if (!s) return bindMgr(root, t);

  /* format & config */
  root.querySelectorAll('[data-fmt]').forEach((b) => (b.onclick = () => {
    root.querySelectorAll('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b));
    withSeries((x) => { x.format = b.dataset.fmt; x.groups = x.format === 'groups_ko' && x.groups.length > 1 ? x.groups : []; if (x.matches.length) x.needsRegen = true; });
  }));
  root.querySelectorAll('[data-rmrub]').forEach((b) => (b.onclick = () => withSeries((x) => { x.config.rubbers.splice(+b.dataset.rmrub, 1); })));
  $('#addRub')?.addEventListener('change', (e) => e.target.value && withSeries((x) => { x.config.rubbers = [...(x.config.rubbers || []), e.target.value]; }));
  $('#saveCfg')?.addEventListener('click', () => withSeries((x) => {
    x.name = $('#s_name').value.trim();
    if ($('#s_cat')) x.cat = $('#s_cat').value;
    if ($('#c_groups')) x.config.groups = Math.max(1, Math.min(16, +$('#c_groups').value || 2));
    if ($('#c_adv')) x.config.advance = +$('#c_adv').value;
    if ($('#c_ko')) x.config.koTop = +$('#c_ko').value;
    if ($('#c_third')) x.config.third = $('#c_third').checked;
    if (x.matches.length) x.needsRegen = true;
  }, 'Đã lưu thể thức.' + (s.matches.length ? ' Hãy sinh lại lịch để áp dụng.' : '')));

  /* entries */
  const err = $('#teamErr');
  const addTeam = () => {
    err.textContent = '';
    const findP = (name) => store.profiles.find((x) => x.full_name.toLowerCase() === name.toLowerCase() && x.status === 'approved');
    const toPlayer = (name) => { const p = findP(name); return p ? { name: p.full_name, pid: p.id, g: p.gender } : { name, pid: null, g: null }; };
    const taken = s.teams.flatMap((tm) => tm.players).map((p) => p.name.toLowerCase());
    let tm;
    if (team) {
      const name = $('#tm_name').value.trim();
      const roster = $('#tm_roster').value.split('\n').map((v) => v.trim()).filter(Boolean);
      if (!name) return (err.textContent = 'Nhập tên đội.');
      if (roster.length < 2) return (err.textContent = 'Mỗi đội cần tối thiểu 2 VĐV.');
      const players = roster.map(toPlayer);
      const dup = players.find((p) => taken.includes(p.name.toLowerCase()));
      if (dup) return (err.textContent = `${dup.name} đã có trong đội khác.`);
      tm = makeTeam(players.map(({ name: n, pid }) => ({ name: n, pid })), allTeams(t).length, { name, unit: $('#tm_unit').value.trim() });
    } else {
      const c = CAT[s.cat];
      const vals = ['#p_a', '#p_b'].map((q) => $(q)?.value.trim()).filter((v) => v !== undefined);
      if (vals.some((v) => !v)) return (err.textContent = c.size === 1 ? 'Nhập tên VĐV.' : 'Nhập đủ 2 VĐV của cặp.');
      const players = vals.map(toPlayer);
      if (players.length === 2 && players[0].name.toLowerCase() === players[1].name.toLowerCase()) return (err.textContent = 'Hai VĐV trong cặp phải khác nhau.');
      const dup = players.find((p) => taken.includes(p.name.toLowerCase()));
      if (dup) return (err.textContent = `${dup.name} đã có trong nội dung này.`);
      const gs = players.map((p) => p.g), rule = c.rule;
      const bad = (rule === 'M' && gs[0] === 'F') || (rule === 'F' && gs[0] === 'M') || (rule === 'MM' && gs.includes('F')) || (rule === 'FF' && gs.includes('M')) || (rule === 'MF' && gs[0] && gs[1] && gs[0] === gs[1]);
      if (bad) return (err.textContent = `Không đúng quy tắc nội dung “${c.l}”.`);
      tm = makeTeam(players.map(({ name, pid }) => ({ name, pid })), allTeams(t).length);
    }
    root.querySelectorAll('#p_a,#p_b,#tm_name,#tm_unit,#tm_roster').forEach((i) => (i.value = ''));
    withSeries((x) => { x.teams.push(tm); x.groups = []; }).then(() => setTimeout(() => document.querySelector(team ? '#tm_name' : '#p_a')?.focus(), 30));
  };
  $('#addTeam')?.addEventListener('click', addTeam);
  root.querySelectorAll('#p_a,#p_b,#tm_name,#tm_unit').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), addTeam())));
  root.querySelectorAll('[data-rmt]').forEach((b) => (b.onclick = () => withSeries((x) => { const [rm] = x.teams.splice(+b.dataset.rmt, 1); x.groups.forEach((g) => (g.teamIds = g.teamIds.filter((id) => id !== rm.id))); })));
  root.querySelectorAll('[data-seed]').forEach((inp) => (inp.onchange = () => withSeries((x) => { const tm = x.teams.find((y) => y.id === inp.dataset.seed); tm.seed = inp.value ? +inp.value : null; })));
  root.querySelectorAll('[data-editt]').forEach((b) => (b.onclick = () => editTeam(t, s, b.dataset.editt, team, withSeries)));

  /* draw */
  const draw = (method) => { drawAnim = true; withSeries((x) => { assignGroups(x, method, x.config.groups, { avoidUnit: $('#avoidUnit')?.checked }); }, method === 'random' ? 'Đã bốc thăm chia bảng.' : 'Đã chia bảng theo hạt giống.'); };
  $('#drawRandom')?.addEventListener('click', () => draw('random'));
  $('#drawSnake')?.addEventListener('click', () => {
    if (!s.teams.some((x) => x.seed)) toast('Chưa có hạt giống – nhập số # cho các đội mạnh trước nhé.', 'err');
    draw('snake');
  });
  root.querySelectorAll('[data-move]').forEach((sel) => (sel.onchange = () => withSeries((x) => {
    x.groups.forEach((g) => (g.teamIds = g.teamIds.filter((id) => id !== sel.dataset.move)));
    x.groups.find((g) => g.name === sel.value).teamIds.push(sel.dataset.move);
  })));

  /* schedule */
  const gen = () => withSeries((x) => {
    if (x.format === 'groups_ko' && (!x.groups.length || x.groups.flatMap((g) => g.teamIds).length !== x.teams.length)) assignGroups(x, 'random', x.config.groups, { avoidUnit: true });
    generateSeries(x, t.kind);
    delete x.needsRegen;
  }, 'Đã sinh lịch thi đấu!');
  $('#gen')?.addEventListener('click', gen);
  $('#regen')?.addEventListener('click', async () => {
    const started = s.matches.some((m) => m.status === 'done' || m.status === 'live');
    if (started && !(await confirmBox('Sinh lại lịch?', 'Toàn bộ kết quả đã nhập của nội dung này sẽ bị <b>xoá</b> và lịch được tạo mới.', 'Sinh lại', true))) return;
    gen();
  });
  $('#clearSched')?.addEventListener('click', async () => {
    if (!(await confirmBox('Xoá lịch?', 'Lịch và kết quả của nội dung này sẽ bị xoá để bạn chỉnh danh sách/chia bảng.', 'Xoá lịch', true))) return;
    withSeries((x) => { x.matches = []; x.podium = null; delete x.needsRegen; }, 'Đã xoá lịch.');
  });

  bindMgr(root, t);
}

function bindMgr(root, t) {
  root.querySelector('#addMgr')?.addEventListener('click', () => addManager(t));
  root.querySelectorAll('[data-rmmgr]').forEach((b) => (b.onclick = () => api.updateTournament(t.id, { managers: t.managers.filter((x) => x !== b.dataset.rmmgr) }).then(() => toast('Đã gỡ khỏi BTC.')).catch((e) => toast(e.message, 'err'))));
  root.querySelector('#delT')?.addEventListener('click', async () => {
    if (!(await confirmBox('Xoá giải đấu?', `Giải “${esc(t.name)}” và toàn bộ kết quả sẽ bị xoá vĩnh viễn.`, 'Xoá giải', true))) return;
    try { await api.deleteTournament(t.id); toast('Đã xoá giải.', 'ok'); location.hash = '#/tournaments'; } catch (e) { toast(e.message, 'err'); }
  });
}

function editTeam(t, s, id, team, withSeries) {
  const tm = s.teams.find((x) => x.id === id);
  openModal({
    title: team ? 'Sửa đội' : 'Sửa đội / VĐV',
    body: `<div class="stack">
      <label class="field"><span>Tên hiển thị</span><input class="input" id="et_name" value="${esc(tm.name)}"></label>
      <label class="field"><span>Đơn vị (dùng cho bảng tổng sắp toàn đoàn)</span><input class="input" id="et_unit" value="${esc(tm.unit || '')}" placeholder="VD: Trung tâm Bảo dưỡng"></label>
      ${team ? `<label class="field"><span>Danh sách VĐV (mỗi dòng 1 người – nên thêm vào cuối để không lệch các trận con đã xếp)</span><textarea class="textarea" id="et_roster" rows="6">${esc(tm.players.map((p) => p.name).join('\n'))}</textarea></label>` : ''}
    </div>`,
    foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-gold" id="etSave">Lưu</button>`,
    onMount(m, close) {
      m.querySelector('#etSave').onclick = async () => {
        const name = m.querySelector('#et_name').value.trim();
        const unit = m.querySelector('#et_unit').value.trim();
        const roster = team ? m.querySelector('#et_roster').value.split('\n').map((v) => v.trim()).filter(Boolean) : null;
        if (team && roster.length < 2) return toast('Mỗi đội cần tối thiểu 2 VĐV.', 'err');
        const ok = await withSeries((x) => {
          const y = x.teams.find((z) => z.id === id);
          if (name) y.name = name;
          y.unit = unit;
          if (roster) y.players = roster.map((n) => { const p = store.profiles.find((q) => q.full_name.toLowerCase() === n.toLowerCase() && q.status === 'approved'); return p ? { name: p.full_name, pid: p.id } : { name: n, pid: null }; });
        }, 'Đã cập nhật.');
        if (ok) close();
      };
    },
  });
}

function addManager(t) {
  const cands = store.profiles.filter((p) => p.status === 'approved' && p.id !== t.created_by && !(t.managers || []).includes(p.id));
  openModal({
    title: 'Thêm thành viên BTC',
    sub: 'Người được thêm có thể xếp người, chia bảng, nhập điểm và duyệt đăng ký',
    body: `<input class="input" id="mgrQ" placeholder="Tìm theo tên…" style="margin-bottom:10px"><div id="mgrList" style="max-height:340px;overflow:auto">${cands.map((p) => `<button class="menu-item" data-add="${p.id}" data-n="${esc(p.full_name.toLowerCase())}">${avatar(p, 'sm')}<span>${esc(p.full_name)}<br><small class="muted">@${esc(p.handle)}</small></span></button>`).join('')}</div>`,
    onMount(m, close) {
      m.querySelector('#mgrQ').oninput = (e) => m.querySelectorAll('[data-add]').forEach((b) => (b.hidden = !b.dataset.n.includes(e.target.value.toLowerCase())));
      m.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => {
        try { await api.updateTournament(t.id, { managers: [...(t.managers || []), b.dataset.add] }); toast('Đã thêm vào BTC.', 'ok'); close(); } catch (e) { toast(e.message, 'err'); }
      }));
    },
  });
}
