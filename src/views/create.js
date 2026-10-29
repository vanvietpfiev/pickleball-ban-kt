/* Tạo giải đấu – wizard 3 bước: Thông tin & luật → Loại giải & thể thức → Đăng ký & xem lại
   Sau khi tạo, BTC vào tab "Thiết lập" để thêm VĐV/đội, chia bảng và sinh lịch. */
import { I } from '../lib/icons.js';
import { esc, toast, emptyBox } from '../lib/utils.js';
import { isApproved } from '../data/store.js';
import { api } from '../data/api.js';
import { CAT, FORMATS, GRADS, RUBBER_PRESETS, newSeries } from '../logic/tournament.js';

export const title = 'Tạo giải mới';
let step = 1;
let d = null;

const TEMPLATES = {
  standard: [
    { k: 'rr', ic: '🔄', l: 'Vòng tròn 1 bảng', d: 'Ít đội (3–6), ai cũng gặp nhau.', series: [{ name: '', format: 'rr' }] },
    { k: 'rr_ko', ic: '🏅', l: 'Vòng tròn → BK → CK', d: 'Top 4 vào Bán kết (1–4, 2–3).', series: [{ name: '', format: 'rr_ko', config: { koTop: 4 } }] },
    { k: 'groups', ic: '🧩', l: 'Chia bảng → Loại trực tiếp', d: 'Bảng A, B… nhất nhì vào vòng trong.', series: [{ name: '', format: 'groups_ko', config: { groups: 2, advance: 2 } }] },
    { k: 'ab', ic: '🅰️', l: 'Series A + Series B', d: 'Chia theo trình độ, BTC tự xếp người.', series: [{ name: 'Series A', format: 'groups_ko', config: { groups: 2, advance: 2 } }, { name: 'Series B', format: 'rr' }] },
    { k: 'ko', ic: '⚡', l: 'Loại trực tiếp', d: 'Thua là loại, tự xếp vé miễn đấu.', series: [{ name: '', format: 'ko' }] },
  ],
  team: [
    { k: 'trr', ic: '🔄', l: 'Đồng đội vòng tròn', d: 'Các đội gặp nhau, mỗi lượt gồm nhiều trận con.', series: [{ name: 'Đồng đội', format: 'rr' }] },
    { k: 'trrko', ic: '🏆', l: 'Vòng tròn → Chung kết', d: 'Nhất & nhì vòng tròn tranh Chung kết.', series: [{ name: 'Đồng đội', format: 'rr_ko', config: { koTop: 2, third: false } }] },
    { k: 'tgroups', ic: '🧩', l: 'Chia bảng → Loại trực tiếp', d: 'Nhiều đội: chia bảng rồi đấu loại.', series: [{ name: 'Đồng đội', format: 'groups_ko', config: { groups: 2, advance: 2 } }] },
  ],
};

const fresh = () => ({
  name: '', date: new Date().toISOString().slice(0, 10), venue: '', ptw: 11, diff: 2, cap: 15, grad: 0,
  kind: 'standard', tpl: 'groups', cat: 'XD', series: clone(TEMPLATES.standard[2].series), rubbers: ['Đôi nam', 'Đôi nữ', 'Đôi nam nữ'], regOpen: true,
});
function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function render() {
  if (!isApproved()) return emptyBox('⏳', 'Cần được duyệt để tạo giải', 'Tài khoản của bạn đang chờ admin duyệt. Sau khi được duyệt bạn có thể tạo giải ngay.', `<a class="btn btn-ghost" href="#/tournaments">${I.back} Quay lại</a>`);
  if (!d) { d = fresh(); step = 1; }
  const steps = ['Thông tin & luật', 'Loại giải & thể thức', 'Đăng ký & xem lại'];
  return `<div class="anim-in create">
    <a class="back-link" href="#/tournaments">${I.back} Giải đấu</a>
    <div class="page-head"><div><h1>Tạo giải đấu mới</h1><p>Chọn thể thức – hệ thống tự sinh lịch vòng bảng, nhánh đấu, BXH và xướng tên nhà vô địch</p></div></div>
    <ol class="stepper">${steps.map((s, i) => `<li class="${step === i + 1 ? 'on' : step > i + 1 ? 'ok' : ''}"><span>${step > i + 1 ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>
    <div id="stepBody">${[s1, s2, s3][step - 1]()}</div>
  </div>`;
}

function s1() {
  return `<div class="card card-pad stack">
    <label class="field"><span>Tên giải *</span><input class="input" id="c_name" value="${esc(d.name)}" placeholder="VD: Giải Pickleball Cuối năm 2026 – Ban KT"></label>
    <div class="grid-2">
      <label class="field"><span>Ngày tổ chức</span><input class="input" type="date" id="c_date" value="${esc(d.date)}"></label>
      <label class="field"><span>Địa điểm</span><input class="input" id="c_venue" value="${esc(d.venue)}" placeholder="VD: Nhà thi đấu Ban KT"></label>
    </div>
    <div class="grid-3">
      <label class="field"><span>Điểm chạm</span><select class="select" id="c_ptw">${[11, 15, 21].map((v) => `<option ${d.ptw === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Cách biệt</span><select class="select" id="c_diff">${[2, 1].map((v) => `<option ${d.diff === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Điểm trần</span><select class="select" id="c_cap"><option value="0" ${!d.cap ? 'selected' : ''}>Không</option>${[13, 15, 17, 21, 25].map((v) => `<option ${d.cap === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <p class="hint">Mỗi trận đánh <b>1 game</b> quyết định đội đi tiếp/vô địch (kể cả Bán kết, Chung kết). Điểm trần: chạm mốc này là thắng dù chưa cách 2.</p>
    <div class="field"><span>Ảnh bìa</span><div class="grad-pick">${GRADS.map((g, i) => `<button class="${d.grad === i ? 'on' : ''}" data-grad="${i}" style="background:${g}" aria-label="Màu ${i + 1}"></button>`).join('')}</div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-gold btn-lg" id="next1">Tiếp tục ${I.right}</button></div>
  </div>`;
}

function s2() {
  const team = d.kind === 'team';
  return `<div class="card card-pad stack">
    <b class="side-h">Loại giải</b>
    <div class="kind-opts">
      <button class="kind-opt ${!team ? 'on' : ''}" data-kind="standard"><b>🏓</b><span>Cá nhân / Đôi</span><small>Đơn, đôi nam, nữ, nam nữ… có thể chia nhiều Series</small></button>
      <button class="kind-opt ${team ? 'on' : ''}" data-kind="team"><b>🛡️</b><span>Đồng đội</span><small>Mỗi đội nhiều VĐV; mỗi lượt gặp gồm nhiều trận con do BTC xếp người</small></button>
    </div>
    <b class="side-h" style="margin-top:6px">Mẫu thể thức</b>
    <div class="tpl-opts">${TEMPLATES[d.kind].map((x) => `<button class="tpl-opt ${d.tpl === x.k ? 'on' : ''}" data-tpl="${x.k}"><b>${x.ic}</b><span>${esc(x.l)}</span><small>${esc(x.d)}</small></button>`).join('')}</div>
  </div>

  <div class="card card-pad stack" style="margin-top:14px">
    <div class="row between"><b class="side-h">Các nội dung thi đấu</b><button class="btn btn-sm btn-ghost" id="addSer">${I.plus} Thêm nội dung</button></div>
    ${d.series.map((s, i) => `<div class="ser-row">
      <input class="input" data-sname="${i}" value="${esc(s.name)}" placeholder="${team ? 'Tên nội dung' : 'Tên (để trống = theo nội dung)'}">
      ${team ? '' : `<select class="select" data-scat="${i}">${Object.entries(CAT).filter(([k]) => k !== 'TM').map(([k, v]) => `<option value="${k}" ${(s.cat || d.cat) === k ? 'selected' : ''}>${v.ic} ${v.l}</option>`).join('')}</select>`}
      <select class="select" data-sfmt="${i}">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${s.format === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select>
      ${d.series.length > 1 ? `<button class="icon-btn sm" data-rmser="${i}" aria-label="Bỏ">${I.x}</button>` : ''}
    </div>`).join('')}
    <p class="muted" style="font-size:12px">Số bảng, số đội đi tiếp, hạt giống… chỉnh chi tiết ở tab <b>Thiết lập</b> sau khi tạo giải.</p>
    ${team ? `<div class="field"><span>Trận con mặc định mỗi lượt gặp</span>
      <div class="rub-chips">${d.rubbers.map((r, i) => `<span class="chip gold">${esc(r)} <button type="button" class="x" data-rmrub="${i}" aria-label="Bỏ">✕</button></span>`).join('')}
      <select class="select sm" id="addRub"><option value="">+ Thêm…</option>${RUBBER_PRESETS.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>
      <small class="muted">Tuỳ trận, BTC có thể thêm/bớt trận con và chọn VĐV ra sân khi nhập điểm.</small></div>` : ''}
  </div>
  <div class="row between" style="margin-top:16px"><button class="btn btn-ghost" id="prev">${I.back} Quay lại</button><button class="btn btn-gold btn-lg" id="next2">Tiếp tục ${I.right}</button></div>`;
}

function s3() {
  const team = d.kind === 'team';
  return `<div class="card" style="overflow:hidden">
    <div class="tc-banner" style="background:${GRADS[d.grad]};height:120px"><span class="tc-cat">${team ? '🛡️ Đồng đội' : d.series.map((s) => esc(s.name || CAT[s.cat || d.cat].l)).join(' · ')}</span><h3 style="font-size:22px">${esc(d.name)}</h3></div>
    <div class="card-pad">
      <div class="review-grid">
        <div><small>Ngày</small><b>${esc(d.date)}</b></div><div><small>Địa điểm</small><b>${esc(d.venue || '—')}</b></div>
        <div><small>Luật điểm</small><b>1 game · chạm ${d.ptw} · cách ${d.diff}${d.cap ? ' · trần ' + d.cap : ''}</b></div><div><small>Số nội dung</small><b>${d.series.length}</b></div>
        ${d.series.map((s) => `<div class="full"><small>${esc(s.name || CAT[s.cat || d.cat].l)}</small><b>${esc(FORMATS[s.format].l)}</b></div>`).join('')}
      </div>
      <label class="switch-row" style="margin-top:16px"><input type="checkbox" id="c_reg" ${d.regOpen ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span>Cho phép thành viên tự đăng ký<br><small class="muted">Thành viên bấm “Đăng ký” trên trang giải, BTC duyệt và xếp vào ${team ? 'đội' : 'Series'}</small></span></label>
      <p class="hint" style="margin-top:14px">Bạn sẽ là <b>Ban tổ chức</b> giải: thêm VĐV/đội, chia bảng, sinh lịch, nhập điểm và giao thêm người hỗ trợ.</p>
    </div>
  </div>
  <div class="row between" style="margin-top:16px"><button class="btn btn-ghost" id="prev">${I.back} Quay lại</button><button class="btn btn-gold btn-lg" id="createT">🏁 Tạo giải</button></div>`;
}

export function mount(root, _p, rerender) {
  const $ = (s) => root.querySelector(s);
  root.querySelectorAll('[data-grad]').forEach((b) => (b.onclick = () => { saveS1(); d.grad = +b.dataset.grad; rerender(); }));
  $('#next1')?.addEventListener('click', () => {
    saveS1();
    if (!d.name) { $('#c_name').focus(); return toast('Vui lòng nhập tên giải.', 'err'); }
    step = 2; rerender();
  });
  $('#prev')?.addEventListener('click', () => { saveS2(); step--; rerender(); });
  $('#next2')?.addEventListener('click', () => { saveS2(); step = 3; rerender(); });

  root.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => {
    d.kind = b.dataset.kind;
    const tp = TEMPLATES[d.kind][d.kind === 'team' ? 1 : 2];
    d.tpl = tp.k; d.series = clone(tp.series);
    rerender();
  }));
  root.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => {
    const tp = TEMPLATES[d.kind].find((x) => x.k === b.dataset.tpl);
    d.tpl = tp.k; d.series = clone(tp.series);
    rerender();
  }));
  $('#addSer')?.addEventListener('click', () => { saveS2(); d.series.push({ name: '', format: d.series[d.series.length - 1]?.format || 'rr' }); d.tpl = ''; rerender(); });
  root.querySelectorAll('[data-rmser]').forEach((b) => (b.onclick = () => { saveS2(); d.series.splice(+b.dataset.rmser, 1); d.tpl = ''; rerender(); }));
  root.querySelectorAll('[data-rmrub]').forEach((b) => (b.onclick = () => { saveS2(); d.rubbers.splice(+b.dataset.rmrub, 1); rerender(); }));
  $('#addRub')?.addEventListener('change', (e) => { saveS2(); if (e.target.value) d.rubbers.push(e.target.value); rerender(); });

  $('#createT')?.addEventListener('click', async (e) => {
    d.regOpen = $('#c_reg').checked;
    e.target.disabled = true;
    try {
      const team = d.kind === 'team';
      const series = d.series.map((s) => newSeries({
        name: s.name || (team ? 'Đồng đội' : ''), cat: team ? 'TM' : s.cat || d.cat, format: s.format,
        config: { ...(s.config || {}), ...(team ? { rubbers: [...d.rubbers] } : {}) },
      }));
      const t = await api.createTournament({
        name: d.name, date: d.date, venue: d.venue, kind: d.kind, rules: { ptw: d.ptw, diff: d.diff, cap: d.cap },
        grad: GRADS[d.grad], regOpen: d.regOpen, registrations: [], series,
      });
      d = null;
      toast('Đã tạo giải! Tiếp theo: thêm VĐV/đội, chia bảng và sinh lịch.', 'ok');
      location.hash = `#/t/${t.id}?tab=manage`;
    } catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; }
  });

  function saveS1() {
    if (!$('#c_name')) return;
    d.name = $('#c_name').value.trim();
    d.date = $('#c_date').value;
    d.venue = $('#c_venue').value.trim();
    d.ptw = +$('#c_ptw').value;
    d.diff = +$('#c_diff').value;
    d.cap = +$('#c_cap').value;
  }
  function saveS2() {
    root.querySelectorAll('[data-sname]').forEach((el) => (d.series[+el.dataset.sname].name = el.value.trim()));
    root.querySelectorAll('[data-scat]').forEach((el) => (d.series[+el.dataset.scat].cat = el.value));
    root.querySelectorAll('[data-sfmt]').forEach((el) => {
      const s = d.series[+el.dataset.sfmt];
      if (s.format !== el.value) { s.format = el.value; s.config = {}; }
    });
  }
}
