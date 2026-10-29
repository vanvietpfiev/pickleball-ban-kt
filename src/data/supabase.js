/* =========================================================
   ADAPTER SUPABASE – cùng interface với demo.js
   Quyền thật được kiểm soát bởi RLS/trigger (supabase/schema.sql);
   các kiểm tra phía client chỉ để báo lỗi thân thiện.
   ========================================================= */
import { createClient } from '@supabase/supabase-js';
import { uid, slugHandle, openModal, toast } from '../lib/utils.js';
import { finalizeTournament, canManage, computeTie, makeTeam, allTeams } from '../logic/tournament.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();
const fail = (msg) => { const e = new Error(msg); e.code = 'denied'; throw e; };

const MSG = [
  [/Invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
  [/User already registered/i, 'Email này đã được đăng ký.'],
  [/Email not confirmed/i, 'Email chưa được xác nhận – hãy mở hộp thư và bấm liên kết xác nhận.'],
  [/Password should be at least/i, 'Mật khẩu tối thiểu 6 ký tự.'],
  [/rate limit/i, 'Thao tác quá nhanh, vui lòng thử lại sau ít phút.'],
  [/profiles_handle_key|duplicate key.*handle/i, 'Tên gọi @ này đã có người dùng.'],
  [/profiles_email_uq/i, 'Email này đã thuộc về tài khoản khác.'],
  [/row-level security|permission denied/i, 'Bạn không có quyền thực hiện thao tác này.'],
  [/Failed to fetch|NetworkError/i, 'Mất kết nối máy chủ – kiểm tra mạng rồi thử lại.'],
];
function check({ data, error }) {
  if (error) {
    const raw = error.message || String(error);
    const hit = MSG.find(([re]) => re.test(raw));
    fail(hit ? hit[1] : raw);
  }
  return data;
}

export function createSupabaseApi(url, key) {
  const sb = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const origin = () => location.origin + location.pathname;

  /* ---------- cache phiên ---------- */
  let authUid = null;
  let myPid = null;
  let profiles = [];
  const me = () => profiles.find((p) => p.id === myPid) || null;

  const normP = (p) => ({
    ...p,
    email: p.email || '', dept: p.dept || '', title: p.title || '', bio: p.bio || '',
    avatar_url: p.avatar_url || '', google_avatar_url: p.google_avatar_url || '',
  });
  const normT = (r) => ({ ...r.data, id: r.id, created_by: r.created_by, managers: r.managers || [], created_at: r.created_at, _v: r.version });
  const stripT = (t) => { const { id, _v, ...rest } = t; return rest; };

  async function resolvePid(session) {
    authUid = session?.user?.id || null;
    myPid = null;
    if (!authUid) return null;
    // hồ sơ do trigger tạo ngay khi tài khoản ra đời – thử lại vài lần phòng trễ
    for (let i = 0; i < 4 && !myPid; i++) {
      const { data } = await sb.from('profiles').select('*').eq('auth_id', authUid).maybeSingle();
      if (data) {
        myPid = data.id;
        const i2 = profiles.findIndex((p) => p.id === data.id);
        if (i2 >= 0) profiles[i2] = normP(data); else profiles.push(normP(data));
      } else await new Promise((r) => setTimeout(r, 400));
    }
    return myPid;
  }
  function requireApproved() {
    const u = me();
    if (!u) fail('Bạn cần đăng nhập.');
    if (u.status === 'locked') fail('Tài khoản đã bị khoá.');
    if (u.status !== 'approved') fail('Tài khoản đang chờ admin duyệt – tạm thời chỉ được xem.');
    return u;
  }
  function requireAdmin() {
    const u = requireApproved();
    if (u.role !== 'admin') fail('Chỉ admin được thực hiện thao tác này.');
    return u;
  }
  function uniqueHandle(base) {
    let h = slugHandle(base);
    let i = 1;
    while (profiles.some((p) => p.handle === h)) h = slugHandle(base) + ++i;
    return h;
  }
  /** Ghi chú + gửi thông báo @tag / trả lời */
  async function notifyFrom(text, actorId, topic_id, comment_id, parentAuthor) {
    const handles = [...String(text).matchAll(/@([a-z0-9_.]+)/gi)].map((m) => m[1].toLowerCase());
    const targets = new Set();
    handles.forEach((h) => { const p = profiles.find((x) => x.handle === h); if (p && p.id !== actorId) targets.add(p.id); });
    const rows = [...targets].map((user_id) => ({ user_id, type: 'mention', actor_id: actorId, topic_id, comment_id }));
    if (parentAuthor && parentAuthor !== actorId && !targets.has(parentAuthor)) rows.push({ user_id: parentAuthor, type: 'reply', actor_id: actorId, topic_id, comment_id });
    if (rows.length) await sb.from('notifications').insert(rows);
  }

  /** Đọc – sửa – ghi 1 giải với khoá lạc quan (version), tự thử lại nếu người khác vừa lưu */
  async function mutateTournament(id, fn) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = check(await sb.from('tournaments').select('*').eq('id', id).maybeSingle());
      if (!row) fail('Không tìm thấy giải.');
      const t = normT(row);
      const out = await fn(t);
      const res = check(await sb.from('tournaments')
        .update({ data: stripT(t), managers: t.managers || [], created_by: t.created_by, version: row.version + 1 })
        .eq('id', id).eq('version', row.version).select('id'));
      if (res.length) { fire('tournaments'); return out === undefined ? clone(t) : out; }
      const still = check(await sb.from('tournaments').select('version').eq('id', id).maybeSingle());
      if (still && still.version === row.version) fail('Bạn không có quyền sửa giải này.');
    }
    fail('Dữ liệu giải vừa được người khác cập nhật liên tục – vui lòng thử lại.');
  }

  /* ---------- auth events ---------- */
  const authCbs = new Set();
  let announced = null; // auth uid mà store đã biết
  sb.auth.onAuthStateChange((event, session) => {
    // không gọi Supabase trực tiếp trong callback (tránh deadlock) → đẩy sang macrotask
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') return askNewPassword();
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
      const nextUid = event === 'SIGNED_IN' ? session?.user?.id || null : null;
      if (nextUid === announced) return; // VD: SIGNED_IN lặp lại khi quay lại tab
      const pid = await resolvePid(session);
      announced = nextUid;
      cleanUrl();
      authCbs.forEach((cb) => cb(pid ? { user: { id: pid } } : null));
    }, 0);
  });
  function cleanUrl() {
    if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
  }
  function askNewPassword() {
    openModal({
      title: 'Đặt mật khẩu mới',
      body: '<label class="field"><span>Mật khẩu mới</span><input class="input" type="password" id="npw" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"></label>',
      foot: '<button class="btn btn-gold" id="npwOk">Lưu mật khẩu</button>',
      onMount(m, close) {
        m.querySelector('#npwOk').onclick = async () => {
          const pw = m.querySelector('#npw').value;
          if (pw.length < 6) return toast('Mật khẩu tối thiểu 6 ký tự.', 'err');
          const { error } = await sb.auth.updateUser({ password: pw });
          if (error) return toast(error.message, 'err');
          toast('Đã đổi mật khẩu.', 'ok');
          close();
        };
      },
    });
  }

  /* ---------- realtime ---------- */
  const listeners = new Set();
  const timers = {};
  const fire = (table) => { clearTimeout(timers[table]); timers[table] = setTimeout(() => listeners.forEach((fn) => fn(table)), 150); };
  const done = (table, v) => { fire(table); return v; };
  let channel = null;
  function ensureChannel() {
    if (channel) return;
    channel = sb.channel('pbkt-db');
    ['profiles', 'tournaments', 'topics', 'comments', 'notifications'].forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => fire(table)));
    channel.subscribe();
  }

  return {
    mode: 'supabase',
    client: sb,

    /* ===== AUTH ===== */
    async getSession() {
      cleanUrl();
      const { data } = await sb.auth.getSession();
      const pid = await resolvePid(data.session);
      announced = pid ? authUid : null;
      cleanUrl();
      return pid ? { user: { id: pid } } : null;
    },
    onAuthChange(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
    async signInWithPassword(email, password) {
      check(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
    },
    async signUp(email, password, full_name) {
      if (password.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.');
      const data = check(await sb.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name }, emailRedirectTo: origin() } }));
      if (!data.session) return { needsConfirm: true };
      const pid = await resolvePid(data.session);
      return clone(me() || { id: pid });
    },
    async signInWithGoogle() {
      check(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin(), queryParams: { prompt: 'select_account' } } }));
    },
    async resetPassword(email) {
      check(await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: origin() }));
      return true;
    },
    async signOut() { await sb.auth.signOut(); },

    /* ===== PROFILES ===== */
    async me() { return clone(me()); },
    async listProfiles() {
      const rows = check(await sb.from('profiles').select('*').order('created_at'));
      profiles = rows.map(normP);
      return clone(profiles);
    },
    async updateProfile(id, patch) {
      const u = me();
      if (!u) fail('Bạn cần đăng nhập.');
      if (u.id !== id && u.role !== 'admin') fail('Không thể sửa hồ sơ người khác.');
      const p = profiles.find((x) => x.id === id);
      const allowed = ['full_name', 'gender', 'dept', 'bio', 'avatar_url', 'handle', ...(u.role === 'admin' ? ['title', 'leader'] : [])];
      const row = {};
      for (const k of allowed) if (k in patch) row[k] = patch[k];
      if ('email' in patch && u.role === 'admin' && p?.managed && !p.claimed) {
        const em = String(patch.email || '').trim().toLowerCase();
        if (em && profiles.some((x) => x.email === em && x.id !== id)) fail('Email này đã thuộc về tài khoản khác.');
        row.email = em;
      }
      if (patch.handle) {
        const h = slugHandle(patch.handle);
        if (profiles.some((x) => x.handle === h && x.id !== id)) fail('Tên gọi @' + h + ' đã có người dùng.');
        row.handle = h;
      } else delete row.handle;
      const out = check(await sb.from('profiles').update(row).eq('id', id).select().maybeSingle());
      if (!out) fail('Không thể sửa hồ sơ này.');
      return done('profiles', normP(out));
    },
    async setStatus(id, status) {
      requireAdmin();
      const out = check(await sb.from('profiles').update({ status }).eq('id', id).select('id'));
      if (!out.length) fail('Không thể cập nhật trạng thái.');
      fire('profiles');
    },
    async setRole(id, role) {
      const a = requireAdmin();
      if (a.id === id && role !== 'admin') fail('Không thể tự gỡ quyền admin của chính mình.');
      check(await sb.from('profiles').update({ role }).eq('id', id));
      fire('profiles');
    },
    async createManagedProfile({ full_name, title = '', dept = '', gender = 'M', email = '' }) {
      const a = requireAdmin();
      full_name = String(full_name || '').trim();
      if (!full_name) fail('Nhập họ tên.');
      email = String(email || '').trim().toLowerCase();
      if (email && profiles.some((x) => x.email === email)) fail('Email này đã có tài khoản – không cần tạo hộ.');
      const row = { email, full_name, handle: uniqueHandle(full_name), gender, dept, title, status: 'approved', role: 'member', managed: true, claimed: false, leader: true, created_by: a.id };
      const out = check(await sb.from('profiles').insert(row).select().single());
      profiles.push(normP(out));
      return done('profiles', normP(out));
    },
    async deleteManagedProfile(id) {
      requireAdmin();
      const p = profiles.find((x) => x.id === id);
      if (!p?.managed || p.claimed) fail('Chỉ xoá được hồ sơ tạo hộ chưa kích hoạt.');
      const out = check(await sb.from('profiles').delete().eq('id', id).select('id'));
      if (!out.length) fail('Không xoá được hồ sơ (có thể đã được kích hoạt).');
      fire('profiles');
    },
    /** dataUrl (ảnh đã cắt/nén) | 'google' | null. Ảnh lưu ở Storage bucket "avatars/<profileId>/" */
    async setAvatar(id, value) {
      const u = me();
      if (!u) fail('Bạn cần đăng nhập.');
      if (u.id !== id && u.role !== 'admin') fail('Chỉ chính chủ hoặc admin được đổi ảnh đại diện.');
      const p = profiles.find((x) => x.id === id);
      let avatar_url = '';
      const old = (check(await sb.storage.from('avatars').list(id)) || []).map((f) => `${id}/${f.name}`);
      if (value === 'google') avatar_url = p?.google_avatar_url || '';
      else if (value) {
        const blob = await (await fetch(value)).blob();
        if (blob.size > 500_000) fail('Ảnh quá lớn.');
        const ext = (blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
        const path = `${id}/${Date.now()}.${ext}`;
        check(await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: true }));
        avatar_url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const out = check(await sb.from('profiles').update({ avatar_url }).eq('id', id).select().maybeSingle());
      if (!out) fail('Không thể đổi ảnh đại diện.');
      if (old.length) await sb.storage.from('avatars').remove(old); // dọn ảnh cũ
      return done('profiles', normP(out));
    },

    /* ===== TOURNAMENTS ===== */
    async listTournaments() {
      const rows = check(await sb.from('tournaments').select('*').order('created_at', { ascending: false }));
      return rows.map(normT);
    },
    async createTournament(t) {
      const u = requireApproved();
      const row = { registrations: [], regOpen: false, ...clone(t), id: uid('t_'), created_by: u.id, managers: t.managers || [], created_at: nowIso() };
      finalizeTournament(row);
      check(await sb.from('tournaments').insert({ id: row.id, data: stripT(row), created_by: u.id, managers: row.managers }));
      return done('tournaments', clone(row));
    },
    async updateTournament(id, patch) {
      const u = requireApproved();
      return mutateTournament(id, (t) => {
        if (!canManage(t, u)) fail('Chỉ người tạo giải, người được giao quản lý hoặc admin mới được sửa.');
        const pt = clone(patch);
        if ('created_by' in pt && u.role !== 'admin') delete pt.created_by;
        Object.assign(t, pt);
        finalizeTournament(t);
      });
    },
    async saveMatch(tid, sid, match) {
      const u = requireApproved();
      return mutateTournament(tid, (t) => {
        if (!canManage(t, u)) fail('Bạn không có quyền nhập điểm giải này.');
        const s = t.series.find((x) => x.id === sid);
        const i = s?.matches.findIndex((m) => m.id === match.id) ?? -1;
        if (i < 0) fail('Không tìm thấy trận.');
        const m = { ...s.matches[i], ...clone(match), updated_at: nowIso() };
        if (m.rubbers && t.kind === 'team') computeTie(m);
        s.matches[i] = m;
        finalizeTournament(t);
      });
    },
    async deleteTournament(id) {
      requireApproved();
      const out = check(await sb.from('tournaments').delete().eq('id', id).select('id'));
      if (!out.length) fail('Chỉ người tạo hoặc admin mới xoá được giải.');
      fire('tournaments');
    },

    /* ===== ĐĂNG KÝ GIẢI ===== */
    async register(tid, { series_id, partner = null, team_name = '', note = '' }) {
      requireApproved();
      return done('tournaments', check(await sb.rpc('register_tournament', { p_tid: tid, p_series: series_id, p_partner: partner, p_team_name: team_name, p_note: note })));
    },
    async cancelRegistration(tid, rid) {
      requireApproved();
      check(await sb.rpc('cancel_registration', { p_tid: tid, p_rid: rid }));
      fire('tournaments');
    },
    async reviewRegistration(tid, rid, approve, { series_id } = {}) {
      const u = requireApproved();
      let pid = null;
      await mutateTournament(tid, (t) => {
        if (!canManage(t, u)) fail('Chỉ ban tổ chức giải được duyệt đăng ký.');
        const r = (t.registrations || []).find((x) => x.id === rid);
        if (!r || r.status !== 'pending') fail('Đăng ký không còn chờ duyệt.');
        r.status = approve ? 'approved' : 'rejected';
        r.reviewed_by = u.id;
        pid = r.pid;
        if (approve) {
          const s = t.series.find((x) => x.id === (series_id || r.series_id)) || t.series[0];
          if (!s) fail('Giải chưa có nội dung nào.');
          r.series_id = s.id;
          const p = profiles.find((x) => x.id === r.pid) || { id: r.pid, full_name: 'VĐV', dept: '' };
          const players = [{ name: p.full_name, pid: p.id }];
          if (r.partner?.name) players.push({ name: r.partner.name, pid: r.partner.pid || null });
          s.teams.push(makeTeam(players, allTeams(t).length, { name: r.team_name || '', unit: t.kind === 'team' ? p.dept : '' }));
          if (s.matches.length) s.needsRegen = true;
        }
        finalizeTournament(t);
      });
      if (pid) await sb.from('notifications').insert({ user_id: pid, type: approve ? 'reg_ok' : 'reg_no', actor_id: u.id, tournament_id: tid });
    },

    /* ===== FORUM ===== */
    async listTopics() { return check(await sb.from('topics').select('*').order('created_at', { ascending: false })); },
    async listComments(topicId) {
      let q = sb.from('comments').select('*').order('created_at');
      if (topicId) q = q.eq('topic_id', topicId);
      return check(await q);
    },
    async createTopic({ title, body, category, tournament_id }) {
      const u = requireApproved();
      const tp = check(await sb.from('topics').insert({ title, body, category, tournament_id: tournament_id || null, author_id: u.id }).select().single());
      await notifyFrom(body, u.id, tp.id, null, null);
      return done('topics', tp);
    },
    async updateTopic(id, patch) {
      const u = requireApproved();
      const { data: tp } = await sb.from('topics').select('author_id').eq('id', id).maybeSingle();
      const own = tp?.author_id === u.id;
      if ('pinned' in patch && u.role !== 'admin') fail('Chỉ admin được ghim chủ đề.');
      if (('title' in patch || 'body' in patch) && !own) fail('Chỉ tác giả được sửa chủ đề.');
      if ('deleted_at' in patch && !own && u.role !== 'admin') fail('Không có quyền thu hồi chủ đề này.');
      const row = { ...patch };
      if ('title' in patch || 'body' in patch) row.edited_at = nowIso();
      const out = check(await sb.from('topics').update(row).eq('id', id).select('id'));
      if (!out.length) fail('Không thể cập nhật chủ đề.');
      fire('topics');
    },
    async addComment({ topic_id, parent_id, body }) {
      const u = requireApproved();
      const c = check(await sb.from('comments').insert({ topic_id, parent_id: parent_id || null, author_id: u.id, body }).select().single());
      let parentAuthor = null;
      if (parent_id) parentAuthor = (await sb.from('comments').select('author_id').eq('id', parent_id).maybeSingle()).data?.author_id;
      else parentAuthor = (await sb.from('topics').select('author_id').eq('id', topic_id).maybeSingle()).data?.author_id;
      await notifyFrom(body, u.id, topic_id, c.id, parentAuthor);
      return done('comments', c);
    },
    async editComment(id, body) {
      requireApproved();
      const out = check(await sb.from('comments').update({ body, edited_at: nowIso() }).eq('id', id).is('deleted_at', null).select('id'));
      if (!out.length) fail('Chỉ người viết được sửa bình luận (và bình luận chưa bị thu hồi).');
      fire('comments');
    },
    async recallComment(id) {
      const u = requireApproved();
      const out = check(await sb.from('comments').update({ deleted_at: nowIso(), recalled_by: u.id }).eq('id', id).select('id'));
      if (!out.length) fail('Không có quyền thu hồi bình luận này.');
      fire('comments');
    },
    async toggleReaction(kind, id, emoji) {
      requireApproved();
      check(await sb.rpc('toggle_reaction', { p_kind: kind, p_id: id, p_emoji: emoji }));
      fire(kind === 'topic' ? 'topics' : 'comments');
    },

    /* ===== NOTIFICATIONS ===== */
    async listNotifications() {
      if (!myPid) return [];
      return check(await sb.from('notifications').select('*').eq('user_id', myPid).order('created_at', { ascending: false }).limit(60));
    },
    async markRead(ids) {
      if (!myPid) return;
      let q = sb.from('notifications').update({ read: true }).eq('user_id', myPid).eq('read', false);
      if (ids) q = q.in('id', ids);
      check(await q);
      fire('notifications');
    },

    /* ===== REALTIME ===== */
    subscribe(cb) { listeners.add(cb); ensureChannel(); return () => listeners.delete(cb); },
  };
}
