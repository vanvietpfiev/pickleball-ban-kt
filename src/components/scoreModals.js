/* Hộp thoại nhập tỉ số: trận thường (1 game) & lượt gặp đồng đội (nhiều trận con) */
import { I } from '../lib/icons.js';
import { esc, toast, openModal } from '../lib/utils.js';
import { api } from '../data/api.js';
import { teamIn, scoreProblem, RUBBER_PRESETS, makeRubber, computeTie } from '../logic/tournament.js';
import { teamBadge, roundLabel } from './cards.js';

const rulesTxt = (r) => `1 game · chạm ${r?.ptw || 11} · cách ${r?.diff || 2}${r?.cap ? ' · trần ' + r.cap : ''}`;

export function openScore(t, sid, mid) {
  const s = t.series.find((x) => x.id === sid);
  const m = s?.matches.find((x) => x.id === mid);
  if (!m) return;
  if (t.kind === 'team' && m.rubbers) tieModal(t, s, m);
  else scoreModal(t, s, m);
}

/* ---------- trận thường ---------- */
function scoreModal(t, s, m) {
  const A = teamIn(s, m.t1), B = teamIn(s, m.t2);
  const a = m.s1 ?? 0, b = m.s2 ?? 0;
  openModal({
    title: roundLabel(s, m),
    sub: `${t.series.length > 1 ? esc(s.name) + ' · ' : ''}${rulesTxt(t.rules)}`,
    body: `<div class="scorepad">
      ${[['a', A, a], ['b', B, b]].map(([k, tm, v]) => `<div class="sp-row">${teamBadge(tm)}<b class="sp-n">${esc(tm.name)}</b>
        <div class="sp-ctl"><button class="sp-btn" data-dec="${k}" aria-label="Giảm">−</button><input class="sp-in mono" id="sp_${k}" type="number" min="0" inputmode="numeric" value="${v}"><button class="sp-btn plus" data-inc="${k}" aria-label="Tăng">+</button></div></div>`).join('')}
      </div>
      <div class="grid-2" style="margin-top:14px"><label class="field"><span>Sân</span><input class="input" id="sp_court" value="${esc(m.court || '')}" placeholder="VD: Sân 1"></label>
      <label class="field"><span>Giờ</span><input class="input" id="sp_time" value="${esc(m.time || '')}" placeholder="VD: 08:30"></label></div>
      <div class="form-err" id="spErr" style="margin-top:10px"></div>
      <label class="row" style="font-size:12.5px;color:var(--text-3);gap:8px"><input type="checkbox" id="spForce"> Bỏ qua kiểm tra luật tính điểm (trận rút gọn, bỏ cuộc…)</label>`,
    foot: `${m.status !== 'up' ? '<button class="btn btn-ghost" data-act="reset">Huỷ kết quả</button>' : ''}<span style="flex:1"></span>
      <button class="btn btn-ghost" data-act="live"><span class="dot"></span> Lưu · Đang đấu</button>
      <button class="btn btn-gold" data-act="done">${I.check} Kết thúc trận</button>`,
    onMount(md, close) {
      const ia = md.querySelector('#sp_a'), ib = md.querySelector('#sp_b');
      md.querySelectorAll('[data-inc],[data-dec]').forEach((btn) => (btn.onclick = () => {
        const k = btn.dataset.inc || btn.dataset.dec;
        const inp = k === 'a' ? ia : ib;
        inp.value = Math.max(0, (+inp.value || 0) + (btn.dataset.inc ? 1 : -1));
        inp.classList.remove('bump'); void inp.offsetWidth; inp.classList.add('bump');
      }));
      md.querySelectorAll('[data-act]').forEach((btn) => (btn.onclick = async () => {
        const act = btn.dataset.act;
        const s1 = parseInt(ia.value, 10), s2 = parseInt(ib.value, 10);
        const patch = { id: m.id, court: md.querySelector('#sp_court').value.trim(), time: md.querySelector('#sp_time').value.trim() };
        if (act === 'reset') Object.assign(patch, { s1: null, s2: null, status: 'up' });
        else {
          if (act === 'done' && s1 === s2) return (md.querySelector('#spErr').textContent = 'Pickleball không có hoà – hai bên phải khác điểm.');
          if (act === 'done' && !md.querySelector('#spForce').checked) {
            const pb = scoreProblem(t.rules, s1, s2);
            if (pb) return (md.querySelector('#spErr').textContent = pb);
          }
          Object.assign(patch, { s1: s1 || 0, s2: s2 || 0, status: act });
        }
        try {
          await api.saveMatch(t.id, s.id, patch);
          toast(act === 'done' ? 'Đã lưu kết quả – BXH & nhánh đấu tự cập nhật.' : act === 'live' ? 'Đã cập nhật tỉ số trực tiếp.' : 'Đã huỷ kết quả trận.', 'ok');
          close();
        } catch (e) { md.querySelector('#spErr').textContent = e.message; }
      }));
    },
  });
}

/* ---------- lượt gặp đồng đội ---------- */
function tieModal(t, s, m) {
  const A = teamIn(s, m.t1), B = teamIn(s, m.t2);
  let rs = JSON.parse(JSON.stringify(m.rubbers || []));
  const need = (label) => (/đơn/i.test(label) ? 1 : 2);
  const pSel = (side, r, i, slot) => {
    const roster = (side === 1 ? A : B).players;
    const cur = (side === 1 ? r.p1 : r.p2)[slot];
    return `<select class="select sm" data-p="${i}:${side}:${slot}"><option value="">— Chọn VĐV —</option>${roster.map((p, k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  };
  const body = () => {
    const tmp = computeTie({ ...m, rubbers: rs });
    return `<div class="tie-head">
        <div class="th-side">${teamBadge(A)}<b>${esc(A.name)}</b></div>
        <div class="th-score mono"><b>${tmp.s1 ?? 0}</b><i>–</i><b>${tmp.s2 ?? 0}</b><small>trận con thắng</small></div>
        <div class="th-side r"><b>${esc(B.name)}</b>${teamBadge(B)}</div>
      </div>
      <div class="rubbers">${rs.map((r, i) => `<div class="rubber ${r.status}">
        <div class="rb-top"><input class="input sm rb-label" data-label="${i}" value="${esc(r.label)}" aria-label="Tên trận con">
          <select class="select sm" data-st="${i}"><option value="up" ${r.status === 'up' ? 'selected' : ''}>Chưa đấu</option><option value="live" ${r.status === 'live' ? 'selected' : ''}>Đang đấu</option><option value="done" ${r.status === 'done' ? 'selected' : ''}>Đã xong</option></select>
          <button class="icon-btn sm" data-rmr="${i}" aria-label="Xoá trận con">${I.x}</button></div>
        <div class="rb-grid">
          <div class="rb-side">${Array.from({ length: need(r.label) }, (_, k) => pSel(1, r, i, k)).join('')}</div>
          <div class="rb-score"><input class="sp-in mono sm" type="number" min="0" inputmode="numeric" data-s="${i}:1" value="${r.s1 ?? ''}" placeholder="–"><i>:</i><input class="sp-in mono sm" type="number" min="0" inputmode="numeric" data-s="${i}:2" value="${r.s2 ?? ''}" placeholder="–"></div>
          <div class="rb-side">${Array.from({ length: need(r.label) }, (_, k) => pSel(2, r, i, k)).join('')}</div>
        </div></div>`).join('') || '<p class="muted" style="text-align:center;padding:14px">Chưa có trận con nào – thêm bên dưới.</p>'}
      </div>
      <div class="rb-add"><span class="muted">Thêm trận con:</span>${RUBBER_PRESETS.map((p) => `<button class="pill" data-addr="${esc(p)}">+ ${esc(p)}</button>`).join('')}</div>
      <div class="grid-2" style="margin-top:12px"><label class="field"><span>Sân</span><input class="input" id="tie_court" value="${esc(m.court || '')}"></label><label class="field"><span>Giờ</span><input class="input" id="tie_time" value="${esc(m.time || '')}"></label></div>
      <div class="form-err" id="tieErr" style="margin-top:8px"></div>
      <label class="row" style="font-size:12.5px;color:var(--text-3);gap:8px"><input type="checkbox" id="tieForce"> Bỏ qua kiểm tra luật tính điểm</label>`;
  };
  openModal({
    title: `${roundLabel(s, m)} · Lượt gặp đồng đội`,
    sub: `BTC xếp người ra sân cho từng trận con · ${rulesTxt(t.rules)}`,
    wide: true,
    body: `<div id="tieBody">${body()}</div>`,
    foot: `<span class="muted" style="flex:1;font-size:12px">Đội thắng nhiều trận con hơn sẽ thắng lượt gặp; bằng nhau xét tổng điểm.</span><button class="btn btn-ghost" data-close>Đóng</button><button class="btn btn-gold" id="tieSave">${I.check} Lưu lượt gặp</button>`,
    onMount(md, close) {
      const box = md.querySelector('#tieBody');
      const collect = () => {
        box.querySelectorAll('[data-label]').forEach((el) => (rs[+el.dataset.label].label = el.value.trim() || 'Trận con'));
        box.querySelectorAll('[data-st]').forEach((el) => (rs[+el.dataset.st].status = el.value));
        rs.forEach((r) => { r.p1 = []; r.p2 = []; });
        box.querySelectorAll('[data-p]').forEach((el) => {
          const [i, side, slot] = el.dataset.p.split(':').map(Number);
          if (el.value !== '') (side === 1 ? rs[i].p1 : rs[i].p2)[slot] = +el.value;
        });
        rs.forEach((r) => { r.p1 = r.p1.filter((x) => x != null); r.p2 = r.p2.filter((x) => x != null); });
        box.querySelectorAll('[data-s]').forEach((el) => {
          const [i, side] = el.dataset.s.split(':').map(Number);
          const v = el.value === '' ? null : parseInt(el.value, 10);
          rs[i][side === 1 ? 's1' : 's2'] = v;
        });
        // nhập đủ 2 tỉ số mà chưa chọn trạng thái → coi như đã xong
        rs.forEach((r) => { if (r.status === 'up' && r.s1 != null && r.s2 != null) r.status = 'done'; });
      };
      const redraw = () => { box.innerHTML = body(); bind(); };
      const bind = () => {
        box.querySelectorAll('[data-rmr]').forEach((b) => (b.onclick = () => { collect(); rs.splice(+b.dataset.rmr, 1); redraw(); }));
        box.querySelectorAll('[data-addr]').forEach((b) => (b.onclick = () => { collect(); rs.push(makeRubber(b.dataset.addr)); redraw(); }));
        box.querySelectorAll('[data-s],[data-st],[data-label]').forEach((el) => (el.onchange = () => { collect(); redraw(); }));
      };
      bind();
      md.querySelector('#tieSave').onclick = async () => {
        collect();
        const err = md.querySelector('#tieErr');
        const force = md.querySelector('#tieForce').checked;
        for (const r of rs) {
          if (r.status !== 'done') continue;
          if (r.s1 == null || r.s2 == null) return (err.textContent = `“${r.label}”: nhập đủ tỉ số hoặc đổi trạng thái.`);
          if (r.s1 === r.s2) return (err.textContent = `“${r.label}”: hai bên không thể bằng điểm.`);
          if (!force) { const pb = scoreProblem(t.rules, r.s1, r.s2); if (pb) return (err.textContent = `“${r.label}”: ${pb}`); }
        }
        try {
          await api.saveMatch(t.id, s.id, { id: m.id, rubbers: rs, court: md.querySelector('#tie_court').value.trim(), time: md.querySelector('#tie_time').value.trim() });
          toast('Đã lưu lượt gặp đồng đội.', 'ok');
          close();
        } catch (e) { err.textContent = e.message; }
      };
    },
  });
}
