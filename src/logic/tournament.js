/* =========================================================
   BỘ MÁY GIẢI ĐẤU (engine) – thuần logic, không dính giao diện
   Mô hình: Giải → Series → (Vòng bảng: các bảng A,B,C…) → (Loại trực tiếp) → Trận
   Giải "đồng đội": mỗi trận (lượt gặp) gồm nhiều trận con do BTC sắp xếp.
   ========================================================= */
import { uid, PALETTE, initials } from '../lib/utils.js';

/* ---------- hằng số ---------- */
export const CAT = {
  MS: { l: 'Đơn nam', size: 1, rule: 'M', ic: '♂' },
  WS: { l: 'Đơn nữ', size: 1, rule: 'F', ic: '♀' },
  MD: { l: 'Đôi nam', size: 2, rule: 'MM', ic: '♂♂' },
  WD: { l: 'Đôi nữ', size: 2, rule: 'FF', ic: '♀♀' },
  XD: { l: 'Đôi nam nữ', size: 2, rule: 'MF', ic: '♂♀' },
  OD: { l: 'Đôi tự do', size: 2, rule: '', ic: '👥' },
  TM: { l: 'Đồng đội', size: 0, rule: '', ic: '🛡️' },
};

export const FORMATS = {
  rr: { l: 'Vòng tròn 1 bảng', d: 'Mọi đội gặp nhau 1 lần, xếp hạng theo BXH.', ic: '🔄' },
  rr_ko: { l: 'Vòng tròn → Bán kết → Chung kết', d: 'Top 2/4/8 sau vòng tròn vào loại trực tiếp (1 gặp 4, 2 gặp 3…).', ic: '🏅' },
  groups_ko: { l: 'Chia bảng → Loại trực tiếp', d: 'Chia bảng A, B, C, D… đấu vòng tròn; top mỗi bảng vào Tứ kết/Bán kết, ghép chéo A1–B2.', ic: '🧩' },
  ko: { l: 'Loại trực tiếp', d: 'Thua là loại, tự xếp vé miễn đấu (bye) khi số đội lẻ.', ic: '⚡' },
};

export const RUBBER_PRESETS = ['Đôi nam', 'Đôi nữ', 'Đôi nam nữ', 'Đơn nam', 'Đơn nữ', 'Đôi tự do', 'Đôi 1', 'Đôi 2', 'Đơn'];
export const STATUS_LABEL = { setup: 'Đang mở đăng ký', up: 'Sắp diễn ra', live: 'Đang diễn ra', done: 'Đã kết thúc' };
export const GRADS = [
  'linear-gradient(120deg,#06315a 0%,#0b4f7f 55%,#1b7bb0 100%)',
  'linear-gradient(120deg,#0a2c4f 0%,#3a4b2a 60%,#8a6a12 100%)',
  'linear-gradient(120deg,#062a4b 0%,#14506e 55%,#0f7a77 100%)',
  'linear-gradient(120deg,#0a2547 0%,#36306a 60%,#6a3f8a 100%)',
  'linear-gradient(120deg,#052443 0%,#5b3a1a 60%,#b0661c 100%)',
];
const GROUP_NAMES = 'ABCDEFGHIJKLMNOP'.split('');

export const koName = (size) => ({ 2: 'Chung kết', 4: 'Bán kết', 8: 'Tứ kết', 16: 'Vòng 1/8', 32: 'Vòng 1/16', 64: 'Vòng 1/32' }[size] || `Vòng ${size} đội`);
export const R_THIRD = 'Tranh hạng 3';
const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

/* ---------- tạo đối tượng ---------- */
export function makeTeam(players, index, opts = {}) {
  const name = opts.name || players.map((p) => p.name).join(' · ');
  const ab = opts.name
    ? initials(opts.name)
    : players.length === 1 ? initials(players[0].name) : players.map((p) => initials(p.name).slice(-1)).join('');
  return { id: uid('tm_'), ab: ab.toUpperCase().slice(0, 3), name, players, color: PALETTE[index % PALETTE.length], unit: opts.unit || '', seed: opts.seed ?? null };
}

export function newSeries({ name = '', cat = 'XD', format = 'rr', config = {} } = {}) {
  return {
    id: uid('s_'), name, cat, format,
    config: { groups: 2, advance: 2, koTop: 4, third: true, rubbers: ['Đôi nam', 'Đôi nữ', 'Đôi nam nữ'], ...config },
    teams: [], groups: [], matches: [], podium: null, status: 'setup',
  };
}

/* ---------- truy vấn ---------- */
export const allTeams = (t) => (t.series || []).flatMap((s) => s.teams);
export const allMatches = (t) => (t.series || []).flatMap((s) => s.matches.map((m) => ({ ...m, _s: s })));
export function findTeam(t, id) {
  for (const s of t.series || []) { const x = s.teams.find((tm) => tm.id === id); if (x) return x; }
  return null;
}
export const teamIn = (s, id) => (id && id !== 'BYE' ? s.teams.find((x) => x.id === id) || null : null);
export const isTeamEvent = (t) => t.kind === 'team';
export const seriesLabel = (t, s) => s.name || CAT[s.cat]?.l || 'Nội dung chính';

/* ---------- chia bảng ---------- */
function shuffle(a, rnd = Math.random) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
/**
 * method: 'random' | 'snake' (theo hạt giống) | 'keep' (giữ phân bảng thủ công hiện có)
 * avoidUnit: hạn chế 2 đội cùng đơn vị chung bảng (ngẫu nhiên có thử lại)
 */
export function assignGroups(s, method = 'random', nGroups = s.config.groups, { avoidUnit = false, rnd } = {}) {
  nGroups = Math.max(1, Math.min(nGroups, Math.floor(s.teams.length / 2) || 1));
  const groups = GROUP_NAMES.slice(0, nGroups).map((name) => ({ name, teamIds: [] }));
  let order;
  if (method === 'snake') order = [...s.teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  else order = shuffle(s.teams, rnd);
  const unitOfId = (id) => s.teams.find((x) => x.id === id)?.unit;
  const tryPlace = (ord) => {
    groups.forEach((g) => (g.teamIds = []));
    let clashes = 0;
    ord.forEach((tm, i) => {
      const row = Math.floor(i / nGroups);
      let gi = row % 2 === 0 ? i % nGroups : nGroups - 1 - (i % nGroups);
      const clash = (g) => !!tm.unit && g.teamIds.some((id) => unitOfId(id) === tm.unit);
      const min = Math.min(...groups.map((g) => g.teamIds.length));
      if (groups[gi].teamIds.length !== min) gi = groups.findIndex((g) => g.teamIds.length === min);
      if (avoidUnit && clash(groups[gi])) {
        const alt = groups.findIndex((g) => g.teamIds.length === min && !clash(g));
        if (alt >= 0) gi = alt;
      }
      if (clash(groups[gi])) clashes++;
      groups[gi].teamIds.push(tm.id);
    });
    return clashes;
  };
  if (avoidUnit && method === 'random') {
    let best = null, bestC = Infinity;
    for (let k = 0; k < 40 && bestC > 0; k++) {
      const ord = k ? shuffle(s.teams, rnd) : order;
      const c = tryPlace(ord);
      if (c < bestC) { bestC = c; best = groups.map((g) => [...g.teamIds]); }
    }
    groups.forEach((g, i) => (g.teamIds = best[i]));
  } else tryPlace(order);
  s.groups = groups;
  s.config.groups = nGroups;
  return groups;
}

/* ---------- sinh lịch ---------- */
function rrPairs(ids) {
  const a = [...ids];
  if (a.length % 2) a.push(null);
  const n = a.length;
  const out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x && y) out.push([x, y, r + 1]); }
    a.splice(1, 0, a.pop());
  }
  return out;
}
export function bracketOrder(P) {
  let o = [1];
  while (o.length < P) { const n = o.length * 2; o = o.flatMap((x) => [x, n + 1 - x]); }
  return o;
}
function M(s, extra) {
  return { id: uid('m_'), stage: 'groups', group: null, round: '', t1: null, t2: null, src1: null, src2: null, s1: null, s2: null, status: 'up', court: '', time: '', rubbers: null, updated_at: null, ...extra };
}

/** Sinh toàn bộ lịch cho 1 Series. Nếu thể thức có bảng mà chưa chia bảng thì tự chia ngẫu nhiên. */
export function generateSeries(s, kind = 'standard') {
  const fmt = s.format;
  const cfg = s.config;
  s.matches = [];
  if (fmt === 'rr' || fmt === 'rr_ko') s.groups = [{ name: 'A', teamIds: s.teams.map((x) => x.id) }];
  if (fmt === 'groups_ko' && (!s.groups.length || s.groups.flatMap((g) => g.teamIds).length !== s.teams.length)) assignGroups(s, 'random');
  if (fmt === 'ko') s.groups = [];

  // vòng bảng
  for (const g of s.groups) {
    for (const [a, b, r] of rrPairs(g.teamIds)) s.matches.push(M(s, { stage: 'groups', group: g.name, round: `Lượt ${r}`, t1: a, t2: b, src1: { team: a }, src2: { team: b } }));
  }

  // loại trực tiếp
  let first = null; // các cặp vòng đầu: [[srcA, srcB], ...] theo thứ tự nhánh
  if (fmt === 'rr_ko') {
    const n = s.teams.length;
    const k = Math.min(cfg.koTop || 4, n >= 8 ? 8 : n >= 4 ? 4 : 2);
    const seeds = Array.from({ length: k }, (_, i) => ({ g: 'A', r: i + 1 }));
    first = seededPairs(seeds);
  } else if (fmt === 'groups_ko') {
    const G = s.groups.length;
    const k = Math.max(1, cfg.advance || 2);
    if (k === 2 && G % 2 === 0) {
      const left = [], right = [];
      for (let i = 0; i < G; i += 2) {
        const A = s.groups[i].name, B = s.groups[i + 1].name;
        left.push([{ g: A, r: 1 }, { g: B, r: 2 }]);
        right.push([{ g: B, r: 1 }, { g: A, r: 2 }]);
      }
      first = interleaveHalves(left, right);
    } else {
      const seeds = [];
      for (let r = 1; r <= k; r++) {
        const gs = r % 2 ? s.groups : [...s.groups].reverse();
        gs.forEach((g) => { if (g.teamIds.length >= r) seeds.push({ g: g.name, r }); });
      }
      first = seededPairs(seeds);
    }
  } else if (fmt === 'ko') {
    const ordered = [...s.teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
    first = seededPairs(ordered.map((tm) => ({ team: tm.id })));
  }
  if (first && first.length) buildKO(s, first, cfg.third !== false);
  if (kind === 'team') s.matches.forEach((m) => (m.rubbers = makeRubbers(cfg.rubbers)));
  resolveSeries(s, kind);
  return s;
}

function seededPairs(seeds) {
  const P = nextPow2(Math.max(2, seeds.length));
  const order = bracketOrder(P);
  const pairs = [];
  for (let i = 0; i < P; i += 2) pairs.push([seeds[order[i] - 1] || { bye: true }, seeds[order[i + 1] - 1] || { bye: true }]);
  return pairs;
}
/** đặt nửa trái/phải xen kẽ để hai đội nhất của 2 bảng cặp đôi chỉ gặp nhau ở chung kết */
function interleaveHalves(left, right) {
  if (left.length === 1) return [left[0], right[0]];
  // left = [A1-B2, C1-D2, ...] ; right = [B1-A2, D1-C2, ...]
  return [...left, ...right];
}

function buildKO(s, pairs, third) {
  let size = pairs.length * 2;
  let prev = pairs.map((p, i) => {
    const m = M(s, { stage: 'ko', round: koName(size), slot: i, src1: p[0], src2: p[1] });
    s.matches.push(m);
    return m;
  });
  let sfs = size === 4 ? prev : null;
  while (prev.length > 1) {
    size /= 2;
    const cur = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m = M(s, { stage: 'ko', round: koName(size), slot: i / 2, src1: { w: prev[i].id }, src2: { w: prev[i + 1].id } });
      s.matches.push(m);
      cur.push(m);
    }
    if (size === 4) sfs = cur;
    prev = cur;
  }
  if (third && sfs && sfs.length === 2) s.matches.push(M(s, { stage: 'ko', round: R_THIRD, slot: 0, third: true, src1: { l: sfs[0].id }, src2: { l: sfs[1].id } }));
}

export const makeRubber = (label) => ({ id: uid('r_'), label, p1: [], p2: [], s1: null, s2: null, status: 'up' });
export const makeRubbers = (labels = []) => labels.map(makeRubber);

/* ---------- kết quả trận ---------- */
export function matchWinner(m) {
  if (m.status === 'bye') return m.t1 && m.t1 !== 'BYE' ? m.t1 : m.t2;
  if (m.status !== 'done' || m.s1 == null) return null;
  if (m.s1 > m.s2) return m.t1;
  if (m.s2 > m.s1) return m.t2;
  if (m.rubbers) return (m.pts1 || 0) >= (m.pts2 || 0) ? m.t1 : m.t2;
  return null;
}
export function matchLoser(m) {
  if (m.status === 'bye') return 'BYE';
  const w = matchWinner(m);
  return w ? (w === m.t1 ? m.t2 : m.t1) : null;
}

/** Tổng hợp tỉ số lượt gặp đồng đội từ các trận con */
export function computeTie(m) {
  const rs = (m.rubbers || []).filter((r) => r.status === 'done' && r.s1 != null);
  m.s1 = rs.filter((r) => r.s1 > r.s2).length;
  m.s2 = rs.filter((r) => r.s2 > r.s1).length;
  m.pts1 = rs.reduce((a, r) => a + r.s1, 0);
  m.pts2 = rs.reduce((a, r) => a + r.s2, 0);
  const total = (m.rubbers || []).length;
  const anyLive = (m.rubbers || []).some((r) => r.status === 'live' || r.status === 'done');
  if (total && rs.length === total) m.status = 'done';
  else if (anyLive) m.status = 'live';
  else m.status = 'up';
  if (m.status === 'done' && m.s1 === m.s2 && m.pts1 === m.pts2) m.status = 'live'; // hoà tuyệt đối → cần thêm trận con
  if (!rs.length) { m.s1 = m.s2 = null; m.pts1 = m.pts2 = 0; }
  return m;
}

/* ---------- bảng xếp hạng ---------- */
export function groupStandings(s, groupName, kind = 'standard') {
  const g = s.groups.find((x) => x.name === groupName);
  if (!g) return [];
  const rows = {};
  g.teamIds.forEach((id) => (rows[id] = { t: teamIn(s, id), pl: 0, w: 0, l: 0, sw: 0, sl: 0, pf: 0, pa: 0 }));
  const done = s.matches.filter((m) => m.stage === 'groups' && m.group === groupName && m.status === 'done' && m.s1 != null);
  const team = kind === 'team';
  done.forEach((m) => {
    const a = rows[m.t1], b = rows[m.t2];
    if (!a || !b) return;
    a.pl++; b.pl++;
    const p1 = team ? m.pts1 || 0 : m.s1, p2 = team ? m.pts2 || 0 : m.s2;
    a.pf += p1; a.pa += p2; b.pf += p2; b.pa += p1;
    if (team) { a.sw += m.s1; a.sl += m.s2; b.sw += m.s2; b.sl += m.s1; }
    const w = matchWinner(m);
    if (w === m.t1) { a.w++; b.l++; } else if (w === m.t2) { b.w++; a.l++; }
  });
  const R = Object.values(rows).filter((r) => r.t).map((r) => ({ ...r, sd: r.sw - r.sl, diff: r.pf - r.pa }));
  const beat = (x, y) => done.some((m) => matchWinner(m) === x && (m.t1 === y || m.t2 === y));
  const mini = (r, grp) => grp.filter((o) => o !== r && beat(r.t.id, o.t.id)).length;
  function rank(grp) {
    if (grp.length <= 1) return grp;
    const crit = [
      (r) => r.w,
      ...(grp.length === 2 ? [(r) => (beat(r.t.id, grp.find((o) => o !== r).t.id) ? 1 : 0)] : [(r) => mini(r, grp)]),
      ...(team ? [(r) => r.sd] : []),
      (r) => r.diff,
      (r) => r.pf,
    ];
    for (const f of crit) {
      const vals = grp.map(f);
      const mx = Math.max(...vals);
      if (vals.every((v) => v === mx)) continue;
      const top = grp.filter((r) => f(r) === mx), rest = grp.filter((r) => f(r) !== mx);
      return [...rank(top), ...rank(rest)];
    }
    return grp; // bằng tuyệt đối – giữ thứ tự
  }
  return rank(R);
}
export const groupDone = (s, name) => {
  const ms = s.matches.filter((m) => m.stage === 'groups' && m.group === name);
  return ms.length > 0 && ms.every((m) => m.status === 'done');
};

/* ---------- điền đội vào nhánh đấu ---------- */
function resolveSrc(s, src, kind) {
  if (!src) return null;
  if (src.bye) return 'BYE';
  if (src.team) return src.team;
  if (src.g) {
    if (!groupDone(s, src.g)) return null;
    return groupStandings(s, src.g, kind)[src.r - 1]?.t.id || 'BYE';
  }
  const m = s.matches.find((x) => x.id === (src.w || src.l));
  if (!m) return null;
  return src.w ? matchWinner(m) : matchLoser(m);
}
export function resolveSeries(s, kind = 'standard') {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const m of s.matches) {
      if (m.stage !== 'ko') continue;
      const a = resolveSrc(s, m.src1, kind), b = resolveSrc(s, m.src2, kind);
      if (m.t1 !== a || m.t2 !== b) {
        // đội thay đổi (do sửa kết quả vòng trước) → huỷ kết quả trận này
        if (m.status === 'done' || m.status === 'live') Object.assign(m, { s1: null, s2: null, status: 'up', rubbers: m.rubbers ? m.rubbers.map((r) => ({ ...r, s1: null, s2: null, status: 'up' })) : null });
        m.t1 = a; m.t2 = b;
        changed = true;
      }
      const bye = (a === 'BYE') !== (b === 'BYE') || (a === 'BYE' && b === 'BYE');
      if (bye && a !== null && b !== null && m.status !== 'bye') { m.status = 'bye'; changed = true; }
      if (!bye && m.status === 'bye') { m.status = 'up'; changed = true; }
    }
    if (!changed) break;
  }
}

/** Mô tả nguồn của 1 vị trí chưa xác định */
export function srcLabel(s, src) {
  if (!src) return 'Chờ xác định';
  if (src.bye) return 'Miễn đấu';
  if (src.g) return s.groups.length > 1 ? `${['Nhất', 'Nhì', 'Ba', 'Tư'][src.r - 1] || 'Hạng ' + src.r} bảng ${src.g}` : `Hạng ${src.r} vòng bảng`;
  const m = s.matches.find((x) => x.id === (src.w || src.l));
  if (!m) return 'Chờ xác định';
  const same = s.matches.filter((x) => x.round === m.round);
  const no = same.length > 1 ? ' ' + (same.indexOf(m) + 1) : '';
  return `${src.w ? 'Thắng' : 'Thua'} ${m.round}${no}`;
}

/* ---------- chốt giải ---------- */
export function finalizeSeries(s, kind) {
  if (kind === 'team') s.matches.forEach((m) => m.rubbers && m.status !== 'bye' && computeTie(m));
  resolveSeries(s, kind);
  if (kind === 'team') s.matches.forEach((m) => m.rubbers && m.status !== 'bye' && computeTie(m));
  const real = s.matches.filter((m) => m.status !== 'bye');
  s.podium = null;
  const final = s.matches.find((m) => m.stage === 'ko' && m.round === 'Chung kết');
  if (final) {
    if (matchWinner(final)) {
      const third = s.matches.find((m) => m.third);
      const sfs = s.matches.filter((m) => m.round === 'Bán kết');
      let thirds = [];
      if (third && matchWinner(third)) thirds = [matchWinner(third)];
      else if (!third) thirds = sfs.map(matchLoser).filter((x) => x && x !== 'BYE');
      s.podium = { 1: [matchWinner(final)], 2: [matchLoser(final)].filter((x) => x && x !== 'BYE'), 3: thirds };
    }
  } else if (s.groups.length === 1 && groupDone(s, 'A')) {
    const st = groupStandings(s, 'A', kind);
    s.podium = { 1: [st[0]?.t.id].filter(Boolean), 2: [st[1]?.t.id].filter(Boolean), 3: [st[2]?.t.id].filter(Boolean) };
  }
  if (!s.matches.length) s.status = 'setup';
  else if (real.every((m) => m.status === 'done') && s.podium) s.status = 'done';
  else if (real.some((m) => m.status === 'done' || m.status === 'live')) s.status = 'live';
  else s.status = 'up';
  return s;
}

export function finalizeTournament(t) {
  (t.series || []).forEach((s) => finalizeSeries(s, t.kind));
  const st = (t.series || []).map((s) => s.status);
  if (!st.length || st.every((x) => x === 'setup')) t.status = 'setup';
  else if (st.every((x) => x === 'done')) t.status = 'done';
  else if (st.some((x) => x === 'live' || x === 'done')) t.status = 'live';
  else t.status = 'up';
  return t;
}

/* ---------- luật điểm (1 game) ---------- */
export function scoreProblem(rules, a, b) {
  const ptw = rules?.ptw || 11, diff = rules?.diff || 2, cap = rules?.cap || 0;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Tỉ số phải là số nguyên ≥ 0.';
  if (a === b) return 'Pickleball không có hoà – hai bên phải khác điểm.';
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (cap && hi === cap && hi > lo) return '';
  if (cap && hi > cap) return `Điểm trần là ${cap}.`;
  if (hi < ptw) return `Bên thắng phải đạt tối thiểu ${ptw} điểm.`;
  if (hi - lo < diff) return `Cách biệt tối thiểu ${diff} điểm.`;
  if (hi > ptw && hi - lo !== diff) return `Khi vượt ${ptw} điểm, chỉ thắng khi cách biệt đúng ${diff}.`;
  return '';
}

/* ---------- thống kê VĐV (tính cả trận con đồng đội) ---------- */
export function playerStats(tournaments, profiles = []) {
  const by = {};
  const keyOf = (p) => p.pid || 'n:' + p.name.trim().toLowerCase();
  const ensure = (p) => {
    const k = keyOf(p);
    if (!by[k]) {
      const prof = p.pid ? profiles.find((x) => x.id === p.pid) : null;
      by[k] = { key: k, pid: p.pid || null, name: prof?.full_name || p.name, profile: prof, pl: 0, w: 0, pf: 0, pa: 0, titles: 0, runner: 0, events: new Set() };
    }
    return by[k];
  };
  const add = (players, sf, sa, tid) => players.forEach((p) => { const x = ensure(p); x.pl++; x.pf += sf; x.pa += sa; if (sf > sa) x.w++; x.events.add(tid); });
  for (const t of tournaments) {
    for (const s of t.series || []) {
      for (const m of s.matches) {
        const A = teamIn(s, m.t1), B = teamIn(s, m.t2);
        if (!A || !B) continue;
        if (m.rubbers) {
          for (const r of m.rubbers) {
            if (r.status !== 'done' || r.s1 == null) continue;
            const pa = (r.p1 || []).map((i) => A.players[i]).filter(Boolean), pb = (r.p2 || []).map((i) => B.players[i]).filter(Boolean);
            add(pa, r.s1, r.s2, t.id); add(pb, r.s2, r.s1, t.id);
          }
        } else if (m.status === 'done' && m.s1 != null) {
          add(A.players, m.s1, m.s2, t.id); add(B.players, m.s2, m.s1, t.id);
        }
      }
      if (s.podium) {
        (s.podium[1] || []).forEach((id) => teamIn(s, id)?.players.forEach((p) => ensure(p).titles++));
        (s.podium[2] || []).forEach((id) => teamIn(s, id)?.players.forEach((p) => ensure(p).runner++));
      }
    }
  }
  return Object.values(by)
    .map((x) => ({ ...x, events: x.events.size, wr: x.pl ? Math.round((x.w / x.pl) * 100) : 0, diff: x.pf - x.pa }))
    .sort((a, b) => b.titles - a.titles || b.wr - a.wr || b.diff - a.diff || b.pl - a.pl);
}

/* ---------- tổng sắp toàn đoàn (theo đơn vị) ---------- */
export function unitOf(team, profiles = []) {
  if (team.unit) return team.unit;
  const depts = team.players.map((p) => profiles.find((x) => x.id === p.pid)?.dept).filter(Boolean);
  return depts.length && depts.every((d) => d === depts[0]) ? depts[0] : depts.length ? 'Liên quân' : 'Khách mời';
}
export function medalTable(t, profiles = []) {
  const rows = {};
  const row = (u) => (rows[u] ||= { unit: u, g: 0, s: 0, b: 0, entries: 0 });
  for (const s of t.series || []) {
    s.teams.forEach((tm) => row(unitOf(tm, profiles)).entries++);
    if (!s.podium) continue;
    (s.podium[1] || []).forEach((id) => row(unitOf(teamIn(s, id), profiles)).g++);
    (s.podium[2] || []).forEach((id) => row(unitOf(teamIn(s, id), profiles)).s++);
    (s.podium[3] || []).forEach((id) => row(unitOf(teamIn(s, id), profiles)).b++);
  }
  return Object.values(rows).map((r) => ({ ...r, pts: r.g * 3 + r.s * 2 + r.b })).sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || b.entries - a.entries);
}

/* ---------- quyền ---------- */
export function canManage(t, me) {
  if (!me || me.status !== 'approved') return false;
  return me.role === 'admin' || t.created_by === me.id || (t.managers || []).includes(me.id);
}

/* ---------- tương thích: nhà vô địch đầu tiên của giải ---------- */
export function headlineChampion(t) {
  const s = (t.series || []).find((x) => x.podium?.[1]?.length);
  return s ? { series: s, team: teamIn(s, s.podium[1][0]) } : null;
}
