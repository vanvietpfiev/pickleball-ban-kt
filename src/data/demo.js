/* =========================================================
   ADAPTER DEMO – mô phỏng Supabase bằng localStorage
   Áp dụng đúng quy tắc phân quyền như RLS trên server
   để hành vi demo giống hệt bản thật.
   ========================================================= */
import { buildSeed } from './seed.js';
import { uid, slugHandle, colorFor } from '../lib/utils.js';
import { finalizeTournament, canManage, computeTie, makeTeam, allTeams } from '../logic/tournament.js';

const KEY = 'pbkt_demo_db_v3';
const SKEY = 'pbkt_demo_session';
const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();

let db = load();
const listeners = new Set();
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('pbkt_demo') : null;
chan && (chan.onmessage = (e) => { db = load(); emit(e.data, false); });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  ['pbkt_demo_db_v1', 'pbkt_demo_db_v2'].forEach((k) => localStorage.removeItem(k));
  const seed = buildSeed();
  localStorage.setItem(KEY, JSON.stringify(seed));
  return seed;
}
function save(table) {
  localStorage.setItem(KEY, JSON.stringify(db));
  emit(table, true);
}
function emit(table, broadcast) {
  listeners.forEach((fn) => fn(table));
  if (broadcast && chan) chan.postMessage(table);
}
const wait = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));
const fail = (msg) => { const e = new Error(msg); e.code = 'denied'; throw e; };

/* ---------- auth ---------- */
let authCbs = new Set();
function currentUserId() { return localStorage.getItem(SKEY); }
function me() { return db.profiles.find((p) => p.id === currentUserId()) || null; }
function setSession(id) {
  if (id) localStorage.setItem(SKEY, id); else localStorage.removeItem(SKEY);
  authCbs.forEach((cb) => cb(id ? { user: { id } } : null));
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
  while (db.profiles.some((p) => p.handle === h)) h = slugHandle(base) + ++i;
  return h;
}
function newProfile({ id, email, full_name, avatar_url = '' }) {
  const p = {
    id, email, full_name, handle: uniqueHandle(full_name), gender: 'M', dept: '', avatar_url, google_avatar_url: avatar_url,
    status: 'pending', role: 'member', bio: '', color: colorFor(id), created_at: nowIso(),
  };
  db.profiles.push(p);
  db.profiles.filter((a) => a.role === 'admin').forEach((a) =>
    db.notifications.push({ id: uid('n_'), user_id: a.id, type: 'pending', actor_id: id, read: false, created_at: nowIso() })
  );
  save('profiles');
  return p;
}
/** Hồ sơ do admin tạo sẵn (lãnh đạo) chưa ai nhận → trả về để gắn tài khoản khi đăng nhập lần đầu */
function claimable(email) {
  return db.profiles.find((x) => x.managed && !x.claimed && x.email && x.email === email) || null;
}
function claim(p, { avatar_url } = {}) {
  p.claimed = true;
  p.claimed_at = nowIso();
  if (avatar_url) { p.google_avatar_url = avatar_url; if (!p.avatar_url) p.avatar_url = avatar_url; }
  if (p.created_by) db.notifications.push({ id: uid('n_'), user_id: p.created_by, type: 'claimed', actor_id: p.id, read: false, created_at: nowIso() });
  save('profiles');
  return p;
}

/* ---------- mentions → notifications ---------- */
function notifyFrom(text, actorId, topic_id, comment_id, parentAuthor) {
  const handles = [...String(text).matchAll(/@([a-z0-9_.]+)/gi)].map((m) => m[1].toLowerCase());
  const targets = new Set();
  handles.forEach((h) => {
    const p = db.profiles.find((x) => x.handle === h);
    if (p && p.id !== actorId) targets.add(p.id);
  });
  targets.forEach((uidT) => db.notifications.push({ id: uid('n_'), user_id: uidT, type: 'mention', actor_id: actorId, topic_id, comment_id, read: false, created_at: nowIso() }));
  if (parentAuthor && parentAuthor !== actorId && !targets.has(parentAuthor))
    db.notifications.push({ id: uid('n_'), user_id: parentAuthor, type: 'reply', actor_id: actorId, topic_id, comment_id, read: false, created_at: nowIso() });
}

export const demoApi = {
  mode: 'demo',

  /* ===== AUTH ===== */
  async getSession() { const id = currentUserId(); return id && me() ? { user: { id } } : null; },
  onAuthChange(cb) { authCbs.add(cb); return () => authCbs.delete(cb); },
  async signInWithPassword(email, password) {
    email = email.trim().toLowerCase();
    const p = db.profiles.find((x) => x.email === email);
    if (!p || db.passwords[email] !== password) fail('Email hoặc mật khẩu không đúng.');
    setSession(p.id);
    return p;
  },
  async signUp(email, password, full_name) {
    email = email.trim().toLowerCase();
    if (password.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.');
    const pre = claimable(email);
    if (pre) {
      claim(pre);
      db.passwords[email] = password;
      save('profiles');
      setSession(pre.id);
      return pre;
    }
    if (db.profiles.some((x) => x.email === email)) fail('Email này đã được đăng ký.');
    const p = newProfile({ id: uid('u_'), email, full_name });
    db.passwords[email] = password;
    save('profiles');
    setSession(p.id);
    return p;
  },
  /** Demo: mô phỏng Google bằng cách chọn tài khoản có sẵn hoặc tạo mới */
  async signInWithGoogle(pick) {
    if (pick?.id) { setSession(pick.id); return; }
    if (pick?.full_name) {
      const email = String(pick.email || '').trim().toLowerCase();
      const pre = claimable(email);
      if (pre) { claim(pre); setSession(pre.id); return; }
      const p = newProfile({ id: uid('u_'), email, full_name: pick.full_name });
      setSession(p.id);
    }
  },
  async resetPassword() { return true; },
  async signOut() { setSession(null); },
  demoAccounts() { return clone(db.profiles.filter((p) => !p.managed || p.claimed)); },
  resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); location.reload(); },

  /* ===== PROFILES ===== */
  async me() { return wait(me()); },
  async listProfiles() { return wait(db.profiles); },
  async updateProfile(id, patch) {
    const u = me();
    if (!u) fail('Bạn cần đăng nhập.');
    if (u.id !== id && u.role !== 'admin') fail('Không thể sửa hồ sơ người khác.');
    const p = db.profiles.find((x) => x.id === id);
    const allowed = ['full_name', 'gender', 'dept', 'bio', 'avatar_url', 'handle', ...(u.role === 'admin' ? ['title', 'leader'] : [])];
    for (const k of allowed) if (k in patch) p[k] = patch[k];
    if ('email' in patch && u.role === 'admin' && p.managed && !p.claimed) {
      const em = String(patch.email || '').trim().toLowerCase();
      if (em && db.profiles.some((x) => x.email === em && x.id !== id)) fail('Email này đã thuộc về tài khoản khác.');
      p.email = em;
    }
    if (patch.handle) {
      const h = slugHandle(patch.handle);
      if (db.profiles.some((x) => x.handle === h && x.id !== id)) fail('Tên gọi @' + h + ' đã có người dùng.');
      p.handle = h;
    }
    save('profiles');
    return clone(p);
  },
  async setStatus(id, status) {
    requireAdmin();
    const p = db.profiles.find((x) => x.id === id);
    p.status = status;
    if (status === 'approved') db.notifications.push({ id: uid('n_'), user_id: id, type: 'approved', actor_id: me().id, read: false, created_at: nowIso() });
    save('profiles');
  },
  async setRole(id, role) {
    const a = requireAdmin();
    if (a.id === id && role !== 'admin') fail('Không thể tự gỡ quyền admin của chính mình.');
    db.profiles.find((x) => x.id === id).role = role;
    save('profiles');
  },
  /** Admin tạo hồ sơ hộ lãnh đạo: duyệt sẵn, chưa có tài khoản; tự gắn khi họ đăng nhập bằng đúng email */
  async createManagedProfile({ full_name, title = '', dept = '', gender = 'M', email = '' }) {
    const a = requireAdmin();
    full_name = String(full_name || '').trim();
    if (!full_name) fail('Nhập họ tên.');
    email = String(email || '').trim().toLowerCase();
    if (email && db.profiles.some((x) => x.email === email)) fail('Email này đã có tài khoản – không cần tạo hộ.');
    const id = uid('u_');
    const p = {
      id, email, full_name, handle: uniqueHandle(full_name), gender, dept, title, avatar_url: '', google_avatar_url: '',
      status: 'approved', role: 'member', bio: '', color: colorFor(id), created_at: nowIso(),
      managed: true, claimed: false, leader: true, created_by: a.id,
    };
    db.profiles.push(p);
    save('profiles');
    return clone(p);
  },
  /** Xoá hồ sơ tạo hộ khi chưa được nhận (VD: tạo nhầm) */
  async deleteManagedProfile(id) {
    requireAdmin();
    const p = db.profiles.find((x) => x.id === id);
    if (!p?.managed || p.claimed) fail('Chỉ xoá được hồ sơ tạo hộ chưa kích hoạt.');
    db.profiles = db.profiles.filter((x) => x.id !== id);
    save('profiles');
  },
  /** Đổi ảnh đại diện: dataUrl (ảnh đã cắt/nén) | 'google' (dùng lại ảnh Google) | null (xoá). Chính chủ hoặc admin. */
  async setAvatar(id, value) {
    const u = me();
    if (!u) fail('Bạn cần đăng nhập.');
    if (u.id !== id && u.role !== 'admin') fail('Chỉ chính chủ hoặc admin được đổi ảnh đại diện.');
    const p = db.profiles.find((x) => x.id === id);
    if (value && value !== 'google' && value.length > 400_000) fail('Ảnh quá lớn.');
    p.avatar_url = value === 'google' ? p.google_avatar_url || '' : value || '';
    save('profiles');
    return clone(p);
  },

  /* ===== TOURNAMENTS ===== */
  async listTournaments() { return wait(db.tournaments); },
  async createTournament(t) {
    const u = requireApproved();
    const row = { registrations: [], regOpen: false, ...clone(t), id: uid('t_'), created_by: u.id, managers: t.managers || [], created_at: nowIso() };
    finalizeTournament(row);
    db.tournaments.unshift(row);
    save('tournaments');
    return clone(row);
  },
  async updateTournament(id, patch) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === id);
    if (!t) fail('Không tìm thấy giải.');
    if (!canManage(t, u)) fail('Chỉ người tạo giải, người được giao quản lý hoặc admin mới được sửa.');
    if ('created_by' in patch && u.role !== 'admin') delete patch.created_by;
    Object.assign(t, clone(patch));
    finalizeTournament(t);
    save('tournaments');
    return clone(t);
  },
  /** Lưu 1 trận trong 1 Series. Nếu là lượt gặp đồng đội thì tự tổng hợp tỉ số từ trận con. */
  async saveMatch(tid, sid, match) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === tid);
    if (!t || !canManage(t, u)) fail('Bạn không có quyền nhập điểm giải này.');
    const s = t.series.find((x) => x.id === sid);
    const i = s?.matches.findIndex((m) => m.id === match.id) ?? -1;
    if (i < 0) fail('Không tìm thấy trận.');
    const m = { ...s.matches[i], ...clone(match), updated_at: nowIso() };
    if (m.rubbers && t.kind === 'team') computeTie(m);
    s.matches[i] = m;
    finalizeTournament(t);
    save('tournaments');
    return clone(t);
  },

  /* ===== ĐĂNG KÝ GIẢI ===== */
  async register(tid, { series_id, partner = null, team_name = '', note = '' }) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === tid);
    if (!t?.regOpen) fail('Giải này không mở đăng ký.');
    t.registrations = t.registrations || [];
    if (t.registrations.some((r) => r.pid === u.id && r.series_id === series_id && r.status !== 'rejected' && r.status !== 'cancelled')) fail('Bạn đã đăng ký nội dung này rồi.');
    const s = t.series.find((x) => x.id === series_id);
    if (s && s.teams.some((tm) => tm.players.some((p) => p.pid === u.id))) fail('Bạn đã có tên trong nội dung này.');
    const r = { id: uid('rg_'), pid: u.id, series_id, partner, team_name, note, status: 'pending', created_at: nowIso() };
    t.registrations.push(r);
    new Set([t.created_by, ...(t.managers || [])]).forEach((id) => id !== u.id &&
      db.notifications.push({ id: uid('n_'), user_id: id, type: 'registration', actor_id: u.id, tournament_id: tid, read: false, created_at: nowIso() }));
    save('tournaments');
    return clone(r);
  },
  async cancelRegistration(tid, rid) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === tid);
    const r = t?.registrations?.find((x) => x.id === rid);
    if (!r || (r.pid !== u.id && !canManage(t, u))) fail('Không có quyền huỷ đăng ký này.');
    r.status = 'cancelled';
    save('tournaments');
  },
  /** BTC duyệt/từ chối đăng ký. Duyệt → thêm đội vào Series (BTC có thể chuyển sang Series khác). */
  async reviewRegistration(tid, rid, approve, { series_id } = {}) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === tid);
    if (!t || !canManage(t, u)) fail('Chỉ ban tổ chức giải được duyệt đăng ký.');
    const r = t.registrations.find((x) => x.id === rid);
    if (!r || r.status !== 'pending') fail('Đăng ký không còn chờ duyệt.');
    r.status = approve ? 'approved' : 'rejected';
    r.reviewed_by = u.id;
    if (approve) {
      const s = t.series.find((x) => x.id === (series_id || r.series_id)) || t.series[0];
      if (!s) fail('Giải chưa có nội dung nào.');
      r.series_id = s.id;
      const p = db.profiles.find((x) => x.id === r.pid);
      const players = [{ name: p.full_name, pid: p.id }];
      if (r.partner?.name) players.push({ name: r.partner.name, pid: r.partner.pid || null });
      s.teams.push(makeTeam(players, allTeams(t).length, { name: r.team_name || '', unit: t.kind === 'team' ? p.dept : '' }));
      if (s.matches.length) s.needsRegen = true;
    }
    db.notifications.push({ id: uid('n_'), user_id: r.pid, type: approve ? 'reg_ok' : 'reg_no', actor_id: u.id, tournament_id: tid, read: false, created_at: nowIso() });
    finalizeTournament(t);
    save('tournaments');
  },
  async deleteTournament(id) {
    const u = requireApproved();
    const t = db.tournaments.find((x) => x.id === id);
    if (!(u.role === 'admin' || t.created_by === u.id)) fail('Chỉ người tạo hoặc admin mới xoá được giải.');
    db.tournaments = db.tournaments.filter((x) => x.id !== id);
    save('tournaments');
  },

  /* ===== FORUM ===== */
  async listTopics() { return wait(db.topics); },
  async listComments(topicId) { return wait(topicId ? db.comments.filter((c) => c.topic_id === topicId) : db.comments); },
  async createTopic({ title, body, category, tournament_id }) {
    const u = requireApproved();
    const tp = { id: uid('tp_'), title, body, category, tournament_id: tournament_id || null, author_id: u.id, pinned: false, created_at: nowIso(), edited_at: null, deleted_at: null, reactions: {} };
    db.topics.unshift(tp);
    notifyFrom(body, u.id, tp.id, null, null);
    save('topics');
    return clone(tp);
  },
  async updateTopic(id, patch) {
    const u = requireApproved();
    const tp = db.topics.find((x) => x.id === id);
    const own = tp.author_id === u.id;
    if ('pinned' in patch && u.role !== 'admin') fail('Chỉ admin được ghim chủ đề.');
    if (('title' in patch || 'body' in patch) && !own) fail('Chỉ tác giả được sửa chủ đề.');
    if ('deleted_at' in patch && !own && u.role !== 'admin') fail('Không có quyền thu hồi chủ đề này.');
    Object.assign(tp, patch);
    if ('title' in patch || 'body' in patch) tp.edited_at = nowIso();
    save('topics');
  },
  async addComment({ topic_id, parent_id, body }) {
    const u = requireApproved();
    const c = { id: uid('c_'), topic_id, parent_id: parent_id || null, author_id: u.id, body, created_at: nowIso(), edited_at: null, deleted_at: null, reactions: {} };
    db.comments.push(c);
    const parent = parent_id ? db.comments.find((x) => x.id === parent_id) : null;
    const topic = db.topics.find((x) => x.id === topic_id);
    notifyFrom(body, u.id, topic_id, c.id, parent ? parent.author_id : topic?.author_id);
    save('comments');
    return clone(c);
  },
  async editComment(id, body) {
    const u = requireApproved();
    const c = db.comments.find((x) => x.id === id);
    if (c.author_id !== u.id) fail('Chỉ người viết được sửa bình luận.');
    if (c.deleted_at) fail('Bình luận đã thu hồi.');
    c.body = body;
    c.edited_at = nowIso();
    save('comments');
  },
  async recallComment(id) {
    const u = requireApproved();
    const c = db.comments.find((x) => x.id === id);
    if (c.author_id !== u.id && u.role !== 'admin') fail('Không có quyền thu hồi bình luận này.');
    c.deleted_at = nowIso();
    c.recalled_by = u.id;
    save('comments');
  },
  async toggleReaction(kind, id, emoji) {
    const u = requireApproved();
    const row = (kind === 'topic' ? db.topics : db.comments).find((x) => x.id === id);
    row.reactions = row.reactions || {};
    const arr = row.reactions[emoji] || (row.reactions[emoji] = []);
    const i = arr.indexOf(u.id);
    if (i >= 0) arr.splice(i, 1); else arr.push(u.id);
    if (!arr.length) delete row.reactions[emoji];
    save(kind === 'topic' ? 'topics' : 'comments');
  },

  /* ===== NOTIFICATIONS ===== */
  async listNotifications() { const u = me(); return wait(u ? db.notifications.filter((n) => n.user_id === u.id) : []); },
  async markRead(ids) {
    const u = me();
    db.notifications.forEach((n) => { if (n.user_id === u?.id && (!ids || ids.includes(n.id))) n.read = true; });
    save('notifications');
  },

  /* ===== REALTIME ===== */
  subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
};
