/* Thành viên · Hồ sơ cá nhân · Quản trị · Tìm kiếm */
import { I } from '../lib/icons.js';
import { esc, avatar, timeAgo, fmtDate, toast, emptyBox, confirmBox, stripVN, openModal } from '../lib/utils.js';
import { store, profileById, isAdmin } from '../data/store.js';
import { api } from '../data/api.js';
import { playerStats, teamIn, CAT, seriesLabel } from '../logic/tournament.js';
import { tourneyCard, roundLabel } from '../components/cards.js';
import { openAvatarEditor } from '../components/avatarEditor.js';

const statusChip = (s) => ({ approved: '<span class="chip ok">Đã duyệt</span>', pending: '<span class="chip live">Chờ duyệt</span>', locked: '<span class="chip bad">Bị khoá</span>' }[s] || '');
const isLeader = (u) => !!u?.leader;
const leaderChip = (u) => (isLeader(u) ? `<span class="chip gold">⭐ ${esc(u.title || 'Lãnh đạo')}</span>` : '');
const inactiveChip = (u) => (u?.managed && !u.claimed ? '<span class="chip" title="Hồ sơ do admin tạo hộ – sẽ tự liên kết khi người này đăng nhập bằng đúng email">Chưa kích hoạt tài khoản</span>' : '');

/* =============== THÀNH VIÊN =============== */
let mtab = 'dir';
let mq = '';
export const members = {
  title: 'Thành viên',
  render(p) {
    if (p.query.tab) mtab = p.query.tab;
    const stats = playerStats(store.tournaments, store.profiles);
    const statOf = (id) => stats.find((s) => s.pid === id);
    let list = store.profiles.filter((x) => x.status === 'approved');
    if (mq) { const s = stripVN(mq).toLowerCase(); list = list.filter((x) => stripVN(x.full_name + ' ' + x.handle + ' ' + x.dept).toLowerCase().includes(s)); }
    list.sort((a, b) => isLeader(b) - isLeader(a) || a.full_name.localeCompare(b.full_name, 'vi'));
    return `<div class="anim-in">
      <div class="page-head"><div><h1>Thành viên</h1><p>${list.length} thành viên đã duyệt · thống kê tính tự động từ kết quả thi đấu</p></div></div>
      <div class="tabs" style="max-width:460px"><button class="${mtab === 'dir' ? 'on' : ''}" data-mt="dir">Danh bạ</button><button class="${mtab === 'rank' ? 'on' : ''}" data-mt="rank">Bảng xếp hạng VĐV</button></div>
      ${mtab === 'dir' ? `
        <label class="search" style="width:min(420px,100%);margin-bottom:16px">${I.search}<input id="mq" placeholder="Tìm theo tên, @tên gọi, phòng ban…" value="${esc(mq)}"></label>
        <div class="member-grid">${list.map((m) => { const s = statOf(m.id); return `<a class="member card hoverable" href="#/u/${m.id}">
          ${avatar(m, 'lg')}<div class="mm"><b>${esc(m.full_name)}</b><small>@${esc(m.handle)}</small><span>${esc(m.title ? m.title + ' · ' : '')}${esc(m.dept || '—')}</span></div>
          <div class="mstat">${isLeader(m) ? '<span class="chip gold">⭐ Lãnh đạo</span>' : ''}${m.role === 'admin' ? '<span class="chip gold">Admin</span>' : ''}${s ? `<span class="mono"><b>${s.wr}%</b> thắng</span><span class="muted">${s.pl} trận${s.titles ? ' · ' + '🏆'.repeat(Math.min(3, s.titles)) : ''}</span>` : '<span class="muted">Chưa thi đấu</span>'}</div></a>`; }).join('')}</div>
        ${!list.length ? emptyBox('🔍', 'Không tìm thấy thành viên', '') : ''}`
      : rankTable(stats)}
    </div>`;
  },
  mount(root, _p, rerender) {
    root.querySelectorAll('[data-mt]').forEach((b) => (b.onclick = () => { mtab = b.dataset.mt; history.replaceState(null, '', '#/members'); rerender(); }));
    let t;
    root.querySelector('#mq')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { mq = e.target.value; rerender(); }, 200); });
  },
};

function rankTable(stats) {
  if (!stats.length) return emptyBox('📊', 'Chưa có dữ liệu', 'Bảng xếp hạng sẽ xuất hiện khi có trận đấu hoàn tất.');
  const maxPl = Math.max(...stats.map((s) => s.pl));
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th class="l">Vận động viên</th><th>Giải</th><th>Trận</th><th>T–B</th><th>Hiệu số</th><th>Danh hiệu</th><th>Tỉ lệ thắng</th></tr></thead>
    <tbody>${stats.map((s, i) => `<tr>
      <td><span class="rank ${['r1', 'r2', 'r3'][i] || ''}">${i + 1}</span></td>
      <td class="l"><a class="cell-team" href="${s.pid ? '#/u/' + s.pid : '#/members?tab=rank'}">${avatar(s.profile || { id: s.key, full_name: s.name }, 'sm')}<div><div class="n">${esc(s.name)}</div>
        <div>${s.pl === maxPl ? '<span class="bdg ht">HIGH TIME</span>' : ''}${s.pl >= 3 && s.w === s.pl ? '<span class="bdg zd">ZERO DEFECT</span>' : ''}${!s.pid ? '<span class="bdg">KHÁCH MỜI</span>' : ''}</div></div></a></td>
      <td>${s.events}</td><td>${s.pl}</td><td class="mono">${s.w}–${s.pl - s.w}</td>
      <td class="mono ${s.diff >= 0 ? 'pos' : 'neg'}">${s.diff > 0 ? '+' : ''}${s.diff}</td>
      <td>${s.titles ? '🏆'.repeat(s.titles) : ''}${s.runner ? '🥈'.repeat(s.runner) : ''}${!s.titles && !s.runner ? '<span class="muted">—</span>' : ''}</td>
      <td><div class="row" style="justify-content:center"><b class="mono">${s.wr}%</b><div class="bar" style="width:70px"><i style="width:${s.wr}%"></i></div></div></td>
    </tr>`).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin-top:10px">Xếp theo: Số cúp › Tỉ lệ thắng › Hiệu số. <b>Zero Defect</b> = toàn thắng (≥3 trận) · <b>High Time</b> = đấu nhiều trận nhất.</p>`;
}

/* =============== HỒ SƠ =============== */
export const profile = {
  title: (p) => profileById(p.id)?.full_name || 'Hồ sơ',
  render(p) {
    const u = profileById(p.id);
    if (!u) return emptyBox('🔍', 'Không tìm thấy thành viên', '');
    const me = store.me?.id === u.id;
    const s = playerStats(store.tournaments, store.profiles).find((x) => x.pid === u.id);
    const inTeam = (tm) => tm?.players.some((pl) => pl.pid === u.id);
    const myT = store.tournaments.filter((t) => (t.series || []).some((s) => s.teams.some(inTeam)));
    const matches = myT.flatMap((t) => t.series.flatMap((s) => s.matches.filter((m) => m.status === 'done' && (inTeam(teamIn(s, m.t1)) || inTeam(teamIn(s, m.t2)))).map((m) => [t, s, m])))
      .sort((a, b) => (a[2].updated_at || a[0].date).localeCompare(b[2].updated_at || b[0].date)).slice(-8).reverse();
    const topics = store.topics.filter((t) => t.author_id === u.id && !t.deleted_at);
    const editMode = p.query.edit && (me || isAdmin());
    return `<div class="anim-in">
      <section class="profile-hero card">
        <div class="ph-cover"></div>
        <div class="ph-body">
          <div class="ph-av">${avatar(u, 'xl')}${me || isAdmin() ? `<button class="ph-cam" id="pfAvatar" aria-label="Đổi ảnh đại diện" title="Đổi ảnh đại diện">📷</button>` : ''}</div>
          <div class="ph-info"><h1>${esc(u.full_name)}</h1><p>@${esc(u.handle)} · ${u.title ? esc(u.title) + ' · ' : ''}${esc(u.dept || 'Ban Kỹ thuật')} · ${u.gender === 'F' ? 'Nữ' : 'Nam'}</p>
            <div class="row wrap" style="margin-top:8px">${leaderChip(u)}${statusChip(u.status)}${u.role === 'admin' ? '<span class="chip gold">Admin</span>' : ''}${inactiveChip(u)}<span class="chip">${u.managed && !u.claimed ? 'Tạo hộ' : 'Tham gia'} ${fmtDate(u.created_at)}</span></div>
            ${isAdmin() && u.managed && !u.claimed ? `<p class="muted" style="font-size:12px;margin-top:6px">🔗 Email liên kết: <b>${esc(u.email || 'chưa nhập')}</b> – người này đăng nhập Google / đăng ký bằng email này sẽ tự nhận hồ sơ.</p>` : ''}
            ${u.bio ? `<p class="ph-bio">${esc(u.bio)}</p>` : ''}</div>
          ${me || isAdmin() ? `<a class="btn btn-ghost" href="#/u/${u.id}${editMode ? '' : '?edit=1'}">${editMode ? 'Đóng' : I.edit + ' Sửa hồ sơ'}</a>` : ''}
        </div>
      </section>
      ${editMode ? editForm(u) : ''}
      <div class="stats" style="margin-top:16px">
        <div class="stat"><small>Trận đã đấu</small><b>${s?.pl || 0}</b><i>${s?.events || 0} giải</i></div>
        <div class="stat"><small>Tỉ lệ thắng</small><b style="color:var(--gold)">${s?.wr || 0}%</b><i>${s?.w || 0} thắng · ${(s?.pl || 0) - (s?.w || 0)} thua</i></div>
        <div class="stat"><small>Hiệu số điểm</small><b>${s ? (s.diff > 0 ? '+' : '') + s.diff : 0}</b><i>${s?.pf || 0} ghi · ${s?.pa || 0} thủng</i></div>
        <div class="stat"><small>Danh hiệu</small><b>${s?.titles ? '🏆'.repeat(s.titles) : '—'}</b><i>${s?.runner ? s.runner + ' lần á quân' : 'đang chờ cúp đầu tiên'}</i></div>
      </div>
      <div class="grid-2" style="align-items:start;margin-top:4px">
        <div><div class="sec"><h2>Trận gần đây</h2></div>
          ${matches.length ? `<div class="stack">${matches.map(([t, s, m]) => {
            const A = teamIn(s, m.t1), B = teamIn(s, m.t2);
            const mine = inTeam(A) ? 1 : 2;
            const w = (mine === 1 && m.s1 > m.s2) || (mine === 2 && m.s2 > m.s1);
            return `<a class="card card-pad row hoverable" href="#/t/${t.id}?s=${s.id}" style="padding:12px 16px"><span class="wl-tag ${w ? 'w' : 'l'}">${w ? 'T' : 'B'}</span>
              <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(A.name)} <span class="muted">vs</span> ${esc(B.name)}</b><div class="muted" style="font-size:11.5px">${esc(t.name)}${t.series.length > 1 ? ' · ' + esc(seriesLabel(t, s)) : ''} · ${esc(roundLabel(s, m))}</div></div>
              <b class="mono">${m.s1}–${m.s2}</b></a>`;
          }).join('')}</div>` : emptyBox('🏓', 'Chưa có trận nào', '')}</div>
        <div><div class="sec sky"><h2>Chủ đề đã đăng</h2></div>
          ${topics.length ? `<div class="stack">${topics.map((t) => `<a class="card card-pad hoverable" href="#/topic/${t.id}" style="padding:12px 16px"><b style="font-size:13.5px">${esc(t.title)}</b><div class="muted" style="font-size:11.5px">${timeAgo(t.created_at)}</div></a>`).join('')}</div>` : emptyBox('💬', 'Chưa có chủ đề', '')}</div>
      </div>
      ${myT.length ? `<div class="sec"><h2>Giải đã tham gia</h2></div><div class="tgrid">${myT.map(tourneyCard).join('')}</div>` : ''}
    </div>`;
  },
  mount(root, p) {
    root.querySelectorAll('#pfAvatar,#pfAvatar2').forEach((b) => b.addEventListener('click', () => {
      const u = profileById(p.id);
      openAvatarEditor(u, { byAdmin: store.me?.id !== u.id });
    }));
    root.querySelector('#pfForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const patch = { full_name: f.full_name.value.trim(), handle: f.handle.value.trim(), dept: f.dept.value.trim(), gender: f.gender.value, bio: f.bio.value.trim() };
        if (isAdmin()) {
          patch.title = f.elements.title.value.trim();
          patch.leader = f.leader.checked;
          if (f.email) patch.email = f.email.value.trim();
        }
        await api.updateProfile(p.id, patch);
        toast('Đã lưu hồ sơ.', 'ok');
        location.hash = '#/u/' + p.id;
      } catch (ex) { toast(ex.message, 'err'); }
    });
  },
};

function editForm(u) {
  return `<form class="card card-pad stack" id="pfForm" style="margin-top:16px">
    <b class="side-h">Chỉnh sửa hồ sơ</b>
    <div class="grid-2"><label class="field"><span>Họ và tên</span><input class="input" name="full_name" value="${esc(u.full_name)}" required></label>
      <label class="field"><span>Tên gọi để @tag</span><input class="input" name="handle" value="${esc(u.handle)}" pattern="[a-zA-Z0-9]+" title="Chỉ chữ không dấu và số"></label></div>
    <div class="grid-2"><label class="field"><span>Phòng / Đội</span><input class="input" name="dept" value="${esc(u.dept)}"></label>
      <label class="field"><span>Giới tính</span><select class="select" name="gender"><option value="M" ${u.gender === 'M' ? 'selected' : ''}>Nam</option><option value="F" ${u.gender === 'F' ? 'selected' : ''}>Nữ</option></select></label></div>
    ${isAdmin() ? `<div class="grid-2"><label class="field"><span>Chức vụ <small class="muted">(chỉ admin sửa)</small></span><input class="input" name="title" value="${esc(u.title)}" placeholder="VD: Phó Trưởng ban"></label>
      <label class="field"><span>Vai trò hiển thị</span><label class="row" style="gap:8px;min-height:42px"><input type="checkbox" name="leader" ${u.leader ? 'checked' : ''}> ⭐ Lãnh đạo (ưu tiên đầu danh bạ)</label></label></div>
    ${u.managed && !u.claimed ? `<label class="field"><span>Email liên kết</span><input class="input" type="email" name="email" value="${esc(u.email)}" placeholder="email công ty hoặc Gmail của lãnh đạo"><small class="muted">Khi người này đăng nhập Google hoặc đăng ký bằng đúng email này, tài khoản sẽ tự gắn vào hồ sơ (giữ nguyên lịch sử thi đấu).</small></label>` : ''}` : ''}
    <div class="row wrap" style="gap:10px">${avatar(u, 'lg')}<div style="flex:1;min-width:200px"><b style="font-size:13px">Ảnh đại diện</b><br><small class="muted">${u.avatar_url ? (u.avatar_url === u.google_avatar_url ? 'Đang dùng ảnh từ tài khoản Google' : 'Ảnh tải lên riêng') : 'Chưa có ảnh – đang hiển thị chữ viết tắt'}</small></div><button type="button" class="btn btn-ghost" id="pfAvatar2">📷 Đổi ảnh</button></div>
    <label class="field"><span>Giới thiệu</span><textarea class="textarea" name="bio" rows="3" placeholder="Tay vợt thuận, sở trường dink…">${esc(u.bio)}</textarea></label>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-gold" type="submit">Lưu hồ sơ</button></div>
  </form>`;
}

/* =============== QUẢN TRỊ =============== */
let atab = 'pending';
export const admin = {
  title: 'Quản trị',
  render() {
    if (!isAdmin()) return emptyBox('🔒', 'Chỉ dành cho admin', 'Bạn không có quyền truy cập trang này.');
    const by = (s) => store.profiles.filter((p) => p.status === s);
    const leaders = store.profiles.filter(isLeader);
    const list = atab === 'all' ? store.profiles : atab === 'leader' ? leaders : by(atab);
    return `<div class="anim-in">
      <div class="page-head"><div><h1>Quản trị thành viên</h1><p>Duyệt tài khoản mới, khoá/mở, phân quyền admin và tạo hồ sơ hộ lãnh đạo</p></div>
        <button class="btn btn-gold" id="newLeader">⭐ Tạo hồ sơ lãnh đạo</button></div>
      <div class="stats">
        <div class="stat"><small>Chờ duyệt</small><b style="color:var(--live)">${by('pending').length}</b><i>cần xử lý</i></div>
        <div class="stat"><small>Đã duyệt</small><b style="color:var(--ok)">${by('approved').length}</b><i>thành viên</i></div>
        <div class="stat"><small>Bị khoá</small><b>${by('locked').length}</b><i>tài khoản</i></div>
        <div class="stat"><small>Admin</small><b style="color:var(--gold)">${store.profiles.filter((p) => p.role === 'admin').length}</b><i>quản trị viên</i></div>
      </div>
      <div class="row wrap between" style="margin:18px 0 12px">
        <div class="pills">${[['pending', '⏳ Chờ duyệt'], ['approved', 'Đã duyệt'], ['leader', '⭐ Lãnh đạo'], ['locked', 'Bị khoá'], ['all', 'Tất cả']].map(([k, l]) => `<button class="pill ${atab === k ? 'on' : ''}" data-at="${k}">${l} (${k === 'all' ? store.profiles.length : k === 'leader' ? leaders.length : by(k).length})</button>`).join('')}</div>
        ${atab === 'pending' && list.length > 1 ? `<button class="btn btn-ok" id="approveAll">${I.check} Duyệt tất cả (${list.length})</button>` : ''}
      </div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="l">Thành viên</th><th class="l">Email</th><th>Đăng ký</th><th>Trạng thái</th><th>Vai trò</th><th>Thao tác</th></tr></thead>
        <tbody>${list.map((u) => `<tr>
          <td class="l"><a class="cell-team" href="#/u/${u.id}">${avatar(u, 'sm')}<div><div class="n">${esc(u.full_name)}</div><div class="p">@${esc(u.handle)} · ${u.title ? esc(u.title) + ' · ' : ''}${esc(u.dept || '—')}</div></div></a></td>
          <td class="l muted" style="font-size:12.5px">${esc(u.email || '—')}</td><td class="muted" style="font-size:12.5px">${timeAgo(u.created_at)}</td>
          <td><div class="row wrap" style="justify-content:center;gap:4px">${u.managed && !u.claimed ? inactiveChip(u) : statusChip(u.status)}</div></td>
          <td><div class="row wrap" style="justify-content:center;gap:4px">${isLeader(u) ? '<span class="chip gold">⭐ Lãnh đạo</span>' : ''}${u.role === 'admin' ? '<span class="chip gold">Admin</span>' : isLeader(u) ? '' : '<span class="chip">Thành viên</span>'}</div></td>
          <td><div class="row" style="justify-content:center;gap:6px">
            ${u.managed && !u.claimed ? `<a class="btn btn-sm btn-ghost" href="#/u/${u.id}?edit=1">${I.edit} Sửa</a><button class="btn btn-sm btn-danger" data-delm="${u.id}">Xoá</button>` : `
            ${u.status !== 'approved' ? `<button class="btn btn-sm btn-ok" data-st="approved" data-id="${u.id}">${I.check} Duyệt</button>` : ''}
            ${u.status !== 'locked' && u.id !== store.me.id ? `<button class="btn btn-sm btn-danger" data-st="locked" data-id="${u.id}">${u.status === 'pending' ? 'Từ chối' : 'Khoá'}</button>` : ''}
            ${u.status === 'approved' && u.id !== store.me.id ? `<button class="btn btn-sm btn-ghost" data-role="${u.role === 'admin' ? 'member' : 'admin'}" data-id="${u.id}">${u.role === 'admin' ? 'Gỡ admin' : 'Cấp admin'}</button>` : ''}`}
          </div></td></tr>`).join('')}</tbody></table></div>`
      : atab === 'leader' ? emptyBox('⭐', 'Chưa có hồ sơ lãnh đạo', 'Bấm “Tạo hồ sơ lãnh đạo” để tạo hộ – lãnh đạo không cần tự đăng ký.')
      : emptyBox('✅', atab === 'pending' ? 'Không có ai chờ duyệt' : 'Danh sách trống', atab === 'pending' ? 'Mọi tài khoản đăng ký đã được xử lý.' : '')}
    </div>`;
  },
  mount(root, _p, rerender) {
    root.querySelectorAll('[data-at]').forEach((b) => (b.onclick = () => { atab = b.dataset.at; rerender(); }));
    root.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
      const u = profileById(b.dataset.id);
      if (b.dataset.st === 'locked' && !(await confirmBox(u.status === 'pending' ? 'Từ chối đăng ký?' : 'Khoá tài khoản?', `${esc(u.full_name)} sẽ không thể đăng bài, tạo giải hay nhập điểm.`, 'Xác nhận', true))) return;
      try { await api.setStatus(u.id, b.dataset.st); toast(b.dataset.st === 'approved' ? `Đã duyệt ${u.full_name}.` : 'Đã cập nhật trạng thái.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    root.querySelectorAll('[data-role]').forEach((b) => (b.onclick = async () => {
      try { await api.setRole(b.dataset.id, b.dataset.role); toast('Đã cập nhật vai trò.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    root.querySelector('#newLeader')?.addEventListener('click', openLeaderModal);
    root.querySelectorAll('[data-delm]').forEach((b) => (b.onclick = async () => {
      const u = profileById(b.dataset.delm);
      if (!(await confirmBox('Xoá hồ sơ tạo hộ?', `Xoá hồ sơ <b>${esc(u.full_name)}</b> (chưa kích hoạt). Chỉ nên xoá khi tạo nhầm.`, 'Xoá', true))) return;
      try { await api.deleteManagedProfile(u.id); toast('Đã xoá hồ sơ.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    root.querySelector('#approveAll')?.addEventListener('click', async () => {
      const ps = store.profiles.filter((p) => p.status === 'pending');
      if (!(await confirmBox('Duyệt tất cả?', `Duyệt ${ps.length} tài khoản đang chờ.`, 'Duyệt tất cả'))) return;
      for (const p of ps) await api.setStatus(p.id, 'approved');
      toast(`Đã duyệt ${ps.length} tài khoản.`, 'ok');
    });
  },
};

/** Modal admin tạo hồ sơ hộ lãnh đạo (duyệt sẵn, tự liên kết khi họ đăng nhập bằng đúng email) */
function openLeaderModal() {
  openModal({
    title: '⭐ Tạo hồ sơ lãnh đạo',
    sub: 'Hồ sơ được duyệt sẵn, có thể xếp vào giải ngay. Thành viên thường vẫn tự đăng ký như bình thường.',
    body: `<form class="stack" id="ldForm">
      <label class="field"><span>Họ và tên *</span><input class="input" name="full_name" required placeholder="VD: Nguyễn Văn A"></label>
      <div class="grid-2"><label class="field"><span>Chức vụ *</span><input class="input" name="title" required placeholder="VD: Phó Trưởng ban"></label>
        <label class="field"><span>Phòng / Đơn vị</span><input class="input" name="dept" placeholder="VD: Ban Kỹ thuật"></label></div>
      <label class="field"><span>Giới tính</span><select class="select" name="gender"><option value="M">Nam</option><option value="F">Nữ</option></select></label>
      <label class="field"><span>Email liên kết</span><input class="input" type="email" name="email" placeholder="email công ty hoặc Gmail">
        <small class="muted">Khi lãnh đạo đăng nhập Google hoặc đăng ký bằng email này, tài khoản sẽ tự gắn vào hồ sơ và giữ nguyên lịch sử. Có thể bổ sung sau.</small></label>
    </form>`,
    foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-gold" id="ldSave">Tạo hồ sơ</button>`,
    onMount(m, close) {
      const f = m.querySelector('#ldForm');
      const submit = async (e) => {
        e?.preventDefault();
        if (!f.reportValidity()) return;
        try {
          const p = await api.createManagedProfile({ full_name: f.full_name.value, title: f.elements.title.value.trim(), dept: f.dept.value.trim(), gender: f.gender.value, email: f.email.value });
          close();
          toast(`Đã tạo hồ sơ ${p.full_name}.`, 'ok');
          location.hash = '#/u/' + p.id;
        } catch (ex) { toast(ex.message, 'err'); }
      };
      f.addEventListener('submit', submit);
      m.querySelector('#ldSave').onclick = submit;
    },
  });
}

/* =============== TÌM KIẾM =============== */
export const search = {
  title: 'Tìm kiếm',
  render(p) {
    const q = (p.query.q || '').trim();
    const s = stripVN(q).toLowerCase();
    const hit = (txt) => stripVN(txt).toLowerCase().includes(s);
    const ts = store.tournaments.filter((t) => hit(t.name + ' ' + t.venue));
    const ms = store.profiles.filter((u) => u.status === 'approved' && hit(u.full_name + ' ' + u.handle + ' ' + u.dept));
    const tp = store.topics.filter((t) => !t.deleted_at && hit(t.title + ' ' + t.body));
    return `<div class="anim-in"><div class="page-head"><div><h1>Kết quả cho “${esc(q)}”</h1><p>${ts.length + ms.length + tp.length} kết quả</p></div></div>
      ${ts.length ? `<div class="sec"><h2>Giải đấu</h2></div><div class="tgrid">${ts.map(tourneyCard).join('')}</div>` : ''}
      ${ms.length ? `<div class="sec sky"><h2>Thành viên</h2></div><div class="member-grid">${ms.map((m) => `<a class="member card hoverable" href="#/u/${m.id}">${avatar(m, 'lg')}<div class="mm"><b>${esc(m.full_name)}</b><small>@${esc(m.handle)}</small><span>${esc(m.dept)}</span></div></a>`).join('')}</div>` : ''}
      ${tp.length ? `<div class="sec"><h2>Thảo luận</h2></div><div class="stack">${tp.map((t) => `<a class="card card-pad hoverable" href="#/topic/${t.id}"><b>${esc(t.title)}</b><div class="muted" style="font-size:12px">${esc(profileById(t.author_id)?.full_name)} · ${timeAgo(t.created_at)}</div></a>`).join('')}</div>` : ''}
      ${!ts.length && !ms.length && !tp.length ? emptyBox('🔍', 'Không tìm thấy kết quả', 'Thử từ khoá khác, ví dụ tên giải hoặc tên thành viên.') : ''}
    </div>`;
  },
};
