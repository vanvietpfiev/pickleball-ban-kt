/* Thẻ trận đấu, thẻ giải, các khối dùng lại cho giải đấu */
import { I } from '../lib/icons.js';
import { esc, fmtDate } from '../lib/utils.js';
import { CAT, FORMATS, teamIn, srcLabel, seriesLabel, allMatches, allTeams, headlineChampion, isTeamEvent } from '../logic/tournament.js';

export function teamBadge(team, cls = '') {
  if (!team) return `<span class="team-badge ${cls}" style="background:#24425f;color:#8fb0cc">?</span>`;
  return `<span class="team-badge ${cls}" style="background:${team.color}">${esc(team.ab)}</span>`;
}

export function statusChip(status) {
  if (status === 'live') return `<span class="chip live"><span class="dot"></span>ĐANG ĐẤU</span>`;
  if (status === 'done') return `<span class="chip ok">KẾT THÚC</span>`;
  if (status === 'setup') return `<span class="chip gold">MỞ ĐĂNG KÝ</span>`;
  if (status === 'bye') return `<span class="chip">MIỄN ĐẤU</span>`;
  return `<span class="chip sky">SẮP TỚI</span>`;
}

/** Nhãn vòng của 1 trận: "Bảng A · Lượt 2" | "Bán kết" … */
export function roundLabel(s, m) {
  if (m.stage === 'groups') return s.groups.length > 1 ? `Bảng ${m.group} · ${m.round}` : `Vòng tròn · ${m.round}`;
  return m.round;
}

/** Thẻ trận – opts: {link, editable, showT, t} */
export function matchCard(t, s, m, opts = {}) {
  const A = teamIn(s, m.t1);
  const B = teamIn(s, m.t2);
  const done = m.status === 'done';
  const live = m.status === 'live';
  const bye = m.status === 'bye';
  const aw = done && m.s1 > m.s2, bw = done && m.s2 > m.s1;
  const team = isTeamEvent(t) && m.rubbers;
  const row = (tm, id, src, sc, win, lose) => `
    <div class="mrow ${win ? 'win' : ''} ${lose ? 'lose' : ''}">
      ${tm ? teamBadge(tm) : `<span class="team-badge ghost">${id === 'BYE' ? '—' : '?'}</span>`}
      <div class="mt"><div class="mn">${tm ? esc(tm.name) : id === 'BYE' ? 'Miễn đấu' : esc(srcLabel(s, src))}</div>${tm ? (team && tm.unit ? `<div class="ms">${esc(tm.unit)}</div>` : '') : id === 'BYE' ? '' : '<div class="ms">Chờ kết quả vòng trước</div>'}</div>
      <div class="score ${live ? 'flip' : ''}">${bye ? '' : sc ?? '–'}</div>
    </div>`;
  const tag = opts.link ? 'a' : 'div';
  const href = opts.link ? `href="#/t/${t.id}?s=${s.id}"` : '';
  const right = live ? statusChip('live') : done ? '<span class="chip ok">KẾT THÚC</span>' : bye ? statusChip('bye') : `<span class="chip">${esc(m.time || 'Chưa xếp giờ')}</span>`;
  const rubLine = team && m.rubbers.length ? `<div class="m-rubs">${m.rubbers.map((r) => {
    const st = r.status === 'done' ? (r.s1 > r.s2 ? 'a' : 'b') : r.status === 'live' ? 'live' : '';
    return `<span class="rub ${st}" title="${esc(r.label)}">${esc(r.label)}${r.s1 != null ? ` <b class="mono">${r.s1}–${r.s2}</b>` : ''}</span>`;
  }).join('')}</div>` : '';
  const canEdit = opts.editable && A && B;
  return `<${tag} class="match ${live ? 'live' : ''} ${done ? 'done' : ''} ${bye ? 'bye' : ''} ${m.third ? 'third' : ''} ${m.round === 'Chung kết' ? 'final' : ''}" ${href} data-mid="${m.id}">
    <div class="m-top">
      <span class="m-round">${esc(roundLabel(s, m))}${m.court ? ' · ' + esc(m.court) : ''}</span>
      ${right}
    </div>
    ${row(A, m.t1, m.src1, m.s1, aw, done && !aw)}
    ${row(B, m.t2, m.src2, m.s2, bw, done && !bw)}
    ${rubLine}
    ${opts.showT ? `<div class="m-foot"><span>${esc(t.name)}${t.series.length > 1 ? ' · <b>' + esc(seriesLabel(t, s)) + '</b>' : ''}</span><span>${I.right}</span></div>` : ''}
    ${canEdit ? `<div class="m-foot"><span>${m.time && !done ? esc(m.time) : ''}</span><button class="btn btn-sm ${live ? 'btn-gold' : 'btn-ghost'}" data-score="${s.id}:${m.id}">${I.edit} ${team ? 'Xếp đội & nhập điểm' : done ? 'Sửa tỉ số' : live ? 'Cập nhật' : 'Nhập tỉ số'}</button></div>` : ''}
  </${tag}>`;
}

/** Tóm tắt thể thức của giải (1 dòng) */
export function formatSummary(t) {
  const S = t.series || [];
  const n = allTeams(t).length;
  const unit = isTeamEvent(t) ? 'đội' : S.every((s) => CAT[s.cat]?.size === 1) ? 'VĐV' : 'đội';
  if (S.length === 1) return `${FORMATS[S[0].format]?.l || ''} · ${n} ${unit}`;
  return `${S.length} nội dung · ${n} ${unit}`;
}

export function tourneyCard(t) {
  const hc = headlineChampion(t);
  const ms = allMatches(t).filter((m) => m.status !== 'bye');
  const doneN = ms.filter((m) => m.status === 'done').length;
  const prog = ms.length ? Math.round((doneN / ms.length) * 100) : 0;
  const S = t.series || [];
  const catLine = isTeamEvent(t) ? `${CAT.TM.ic} Đồng đội` : S.length === 1 ? `${CAT[S[0].cat]?.ic || ''} ${esc(CAT[S[0].cat]?.l || '')}` : S.map((s) => esc(seriesLabel(t, s))).join(' · ');
  const regN = (t.registrations || []).filter((r) => r.status === 'pending').length;
  return `<a class="tcard card hoverable" href="#/t/${t.id}">
    <div class="tc-banner" style="background:${t.grad}">
      <span class="tc-cat">${catLine}</span>
      ${statusChip(t.status)}
      <h3>${esc(t.name)}</h3>
      <span class="tc-court" aria-hidden="true"></span>
    </div>
    <div class="tc-body">
      <div class="tc-meta">${I.cal}<span>${fmtDate(t.date)}</span></div>
      <div class="tc-meta">${I.pin}<span>${esc(t.venue || '—')}</span></div>
      <div class="tc-meta">${I.fmt}<span>${esc(formatSummary(t))}</span></div>
      ${t.status === 'done' && hc ? `<div class="tc-champ">👑 <span>Vô địch${S.length > 1 ? ' ' + esc(seriesLabel(t, hc.series)) : ''}: <b>${esc(hc.team?.name || '')}</b></span></div>`
        : t.status === 'setup' ? `<div class="tc-champ reg">📝 <span>${t.regOpen ? 'Đang nhận đăng ký' : 'Đang chuẩn bị'}${regN ? ` · <b>${regN}</b> chờ duyệt` : ''}</span></div>`
        : `<div class="tc-prog"><div class="bar"><i style="width:${prog}%"></i></div><small>${doneN}/${ms.length} trận</small></div>`}
    </div>
  </a>`;
}
