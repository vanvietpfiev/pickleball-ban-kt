/* =========================================================
   DỮ LIỆU MẪU cho chế độ DEMO (mô hình giải v2: Giải → Series → Bảng/Nhánh → Trận)
   ========================================================= */
import { CAT, makeTeam, newSeries, generateSeries, finalizeTournament, computeTie, GRADS } from '../logic/tournament.js';

const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const dayOffset = (d) => {
  const x = new Date(now + d * 86400e3);
  return x.toISOString().slice(0, 10);
};

const P = (id, full_name, handle, gender, dept, extra = {}) => ({
  id,
  email: handle + '@demo.vn',
  full_name,
  handle,
  gender,
  dept,
  avatar_url: '',
  google_avatar_url: '',
  status: 'approved',
  role: 'member',
  bio: '',
  created_at: ago(24 * 60),
  ...extra,
});

/** ghi tỉ số 1 trận đơn giản */
function play(m, a, b, { court = '', time = '', h = 1, live = false } = {}) {
  m.s1 = a; m.s2 = b;
  m.status = live ? 'live' : 'done';
  if (court) m.court = court;
  if (time) m.time = time;
  m.updated_at = ago(h);
}

export function buildSeed() {
  const profiles = [
    P('u_an', 'Nguyễn Văn An', 'an', 'M', 'Phòng Kỹ thuật', { role: 'admin', bio: 'Admin hệ thống · BTC giải Ban KT' }),
    P('u_tuan', 'Trần Minh Tuấn', 'minhtuan', 'M', 'Trung tâm Bảo dưỡng'),
    P('u_huong', 'Lê Thu Hương', 'thuhuong', 'F', 'Phòng Kế hoạch'),
    P('u_dung', 'Phạm Quốc Dũng', 'quocdung', 'M', 'Đội Động cơ'),
    P('u_lan', 'Đỗ Ngọc Lan', 'ngoclan', 'F', 'Phòng Chất lượng'),
    P('u_khoa', 'Vũ Đăng Khoa', 'dangkhoa', 'M', 'Đội Cấu trúc'),
    P('u_mai', 'Hoàng Thanh Mai', 'thanhmai', 'F', 'Phòng Vật tư'),
    P('u_son', 'Bùi Hải Sơn', 'haison', 'M', 'Đội Điện tử'),
    P('u_thao', 'Ngô Phương Thảo', 'phuongthao', 'F', 'Phòng Tài liệu KT'),
    P('u_long', 'Đinh Bảo Long', 'baolong', 'M', 'Trung tâm Bảo dưỡng'),
    P('u_huy', 'Lý Gia Huy', 'giahuy', 'M', 'Đội Động cơ', { status: 'pending', created_at: ago(5) }),
    P('u_linh', 'Cao Mỹ Linh', 'mylinh', 'F', 'Phòng Kế hoạch', { status: 'pending', created_at: ago(2) }),
    P('u_lead', 'Lê Quang Hải', 'quanghai', 'M', 'Ban Kỹ thuật', {
      email: 'hai.lq@vietnamairlines.com', title: 'Trưởng Ban Kỹ thuật', managed: true, claimed: false, leader: true, created_by: 'u_an', created_at: ago(24 * 10),
    }),
  ];
  const by = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const pl = (id) => ({ name: by[id].full_name, pid: id });
  const g = (name) => ({ name, pid: null }); // khách mời / chưa có tài khoản
  let ci = 0;
  const team = (players, opts) => makeTeam(players, ci++, opts);

  /* ======================= Giải 1: ĐÃ KẾT THÚC (vòng tròn → BK → CK) ======================= */
  const s1 = newSeries({ name: 'Đôi nam nữ', cat: 'XD', format: 'rr_ko', config: { koTop: 4, third: true } });
  s1.teams = [
    team([pl('u_tuan'), pl('u_huong')]),
    team([pl('u_dung'), pl('u_lan')]),
    team([pl('u_khoa'), pl('u_mai')]),
    team([pl('u_son'), pl('u_thao')]),
    team([pl('u_long'), g('Phan Hà My')]),
  ];
  generateSeries(s1);
  const sc1 = [[11, 7], [9, 11], [11, 5], [11, 8], [13, 11], [6, 11], [11, 4], [11, 9], [8, 11], [11, 6]];
  s1.matches.filter((m) => m.stage === 'groups').forEach((m, i) => play(m, ...sc1[i], { court: 'Sân ' + ((i % 2) + 1), h: 24 * 75 }));
  const t1 = {
    id: 't_summer', name: 'Giải Pickleball Mùa Hè 2026', kind: 'standard',
    date: dayOffset(-75), venue: 'Sân Pickleball Gia Lâm · Hà Nội',
    rules: { ptw: 11, diff: 2, cap: 0 }, grad: GRADS[1],
    created_by: 'u_an', managers: [], regOpen: false, registrations: [],
    series: [s1], created_at: ago(24 * 80),
  };
  finalizeTournament(t1);
  s1.matches.filter((m) => m.stage === 'ko' && m.round === 'Bán kết').forEach((m, i) => play(m, ...(i ? [11, 9] : [9, 11]), { court: 'Sân TT', h: 24 * 75 }));
  finalizeTournament(t1);
  s1.matches.filter((m) => m.stage === 'ko' && m.round !== 'Bán kết').forEach((m) => play(m, ...(m.third ? [11, 8] : [12, 10]), { court: 'Sân TT', h: 24 * 75 }));
  finalizeTournament(t1);

  /* ======================= Giải 2: ĐANG DIỄN RA – 2 Series ======================= */
  // Series A (trình độ cao): chia 2 bảng → Bán kết → Chung kết
  const sA = newSeries({ name: 'Series A', cat: 'XD', format: 'groups_ko', config: { groups: 2, advance: 2, third: true } });
  sA.teams = [
    team([pl('u_tuan'), pl('u_lan')], { seed: 1 }),
    team([pl('u_dung'), pl('u_mai')], { seed: 2 }),
    team([pl('u_khoa'), pl('u_thao')], { seed: 3 }),
    team([pl('u_son'), pl('u_huong')], { seed: 4 }),
    team([pl('u_long'), g('Phan Hà My')], { seed: 5 }),
    team([pl('u_an'), g('Trịnh Thu Trang')], { seed: 6 }),
    team([g('Lưu Đức Mạnh'), g('Mạc Kim Oanh')], { seed: 7 }),
    team([g('Tạ Quang Vinh'), g('Hồ Diệu Linh')], { seed: 8 }),
  ];
  // Series B (trình độ phổ thông): vòng tròn 1 bảng
  const sB = newSeries({ name: 'Series B', cat: 'XD', format: 'rr', config: {} });
  sB.teams = [
    team([g('Kiều Văn Toàn'), g('Lã Thị Hà')]),
    team([g('Mai Tiến Đạt'), g('Âu Ngọc Ánh')]),
    team([g('Quách Gia Bảo'), g('Ninh Thuỳ Dương')]),
    team([g('Thân Đức Hải'), g('Từ Minh Châu')]),
    team([g('Văn Công Phúc'), g('Lạc Bảo Ngọc')]),
  ];
  const t2 = {
    id: 't_autumn', name: 'Giải Pickleball Mùa Thu 2026', kind: 'standard',
    date: dayOffset(0), venue: 'Nhà thi đấu Ban KT · Sân bay Nội Bài',
    rules: { ptw: 11, diff: 2, cap: 15 }, grad: GRADS[0],
    created_by: 'u_an', managers: ['u_tuan'], regOpen: false, registrations: [],
    series: [sA, sB], created_at: ago(24 * 6),
  };
  const assignA = (s) => {
    s.groups = [
      { name: 'A', teamIds: [0, 3, 4, 7].map((i) => s.teams[i].id) },
      { name: 'B', teamIds: [1, 2, 5, 6].map((i) => s.teams[i].id) },
    ];
  };
  assignA(sA);
  generateSeries(sA);
  generateSeries(sB);
  const gA = sA.matches.filter((m) => m.stage === 'groups');
  const scA = [[11, 6], [11, 9], [7, 11], [11, 4], [12, 10], [11, 8], [11, 3], [9, 11], [11, 7], [11, 5], [8, 6], [5, 9]];
  gA.forEach((m, i) => {
    m.court = 'Sân ' + ((i % 2) + 1);
    m.time = `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    if (i < 10) play(m, ...scA[i], { h: 4 - i * 0.3 });
    else play(m, ...scA[i], { live: true, h: 0.1 });
  });
  const gB = sB.matches;
  const scB = [[11, 8], [6, 11], [11, 9], [11, 2], [10, 12], [11, 7]];
  gB.forEach((m, i) => {
    m.court = 'Sân 3';
    m.time = `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    if (i < scB.length) play(m, ...scB[i], { h: 3.5 - i * 0.4 });
    else if (i === scB.length) play(m, 4, 3, { live: true, h: 0.05 });
  });
  finalizeTournament(t2);

  /* ======================= Giải 3: ĐỒNG ĐỘI – SẮP DIỄN RA ======================= */
  const sT = newSeries({ name: 'Đồng đội toàn Ban', cat: 'TM', format: 'rr_ko', config: { koTop: 2, third: false, rubbers: ['Đôi nam', 'Đôi nữ', 'Đôi nam nữ'] } });
  sT.teams = [
    team([pl('u_tuan'), pl('u_long'), g('Hà Thị Nhung'), g('Khúc Thanh Vân')], { name: 'Trung tâm Bảo dưỡng', unit: 'Trung tâm Bảo dưỡng' }),
    team([pl('u_dung'), g('Lý Gia Huy'), g('Trương Mỹ Duyên'), g('Ông Thị Hằng')], { name: 'Đội Động cơ', unit: 'Đội Động cơ' }),
    team([pl('u_huong'), pl('u_thao'), g('Phùng Văn Kiên'), g('Đào Duy Anh')], { name: 'Khối Kế hoạch – Tài liệu', unit: 'Phòng Kế hoạch' }),
    team([pl('u_lan'), pl('u_mai'), pl('u_khoa'), pl('u_son')], { name: 'Liên quân Chất lượng', unit: 'Phòng Chất lượng' }),
  ];
  const t3 = {
    id: 't_team', name: 'Giải Đồng đội Ban KT 2026', kind: 'team',
    date: dayOffset(9), venue: 'Nhà thi đấu Ban KT · Sân bay Nội Bài',
    rules: { ptw: 11, diff: 2, cap: 0 }, grad: GRADS[3],
    created_by: 'u_an', managers: ['u_huong'], regOpen: false, registrations: [],
    series: [sT], created_at: ago(24 * 3),
  };
  generateSeries(sT, 'team');
  sT.matches.forEach((m, i) => { m.court = 'Sân ' + ((i % 2) + 1); m.time = `${String(8 + i).padStart(2, '0')}:00`; m.rubbers && computeTie(m); });
  finalizeTournament(t3);

  /* ======================= Giải 4: ĐANG MỞ ĐĂNG KÝ ======================= */
  const sM = newSeries({ name: 'Đơn nam', cat: 'MS', format: 'ko', config: { third: true } });
  sM.teams = ['u_tuan', 'u_dung', 'u_khoa', 'u_son', 'u_long'].map((id, i) => team([pl(id)], { seed: i + 1 }));
  const sW = newSeries({ name: 'Đơn nữ', cat: 'WS', format: 'rr', config: {} });
  sW.teams = ['u_huong', 'u_lan', 'u_mai'].map((id) => team([pl(id)]));
  const t4 = {
    id: 't_yearend', name: 'Giải Đơn Cuối năm 2026', kind: 'standard',
    date: dayOffset(24), venue: 'CLB Pickleball Long Biên',
    rules: { ptw: 11, diff: 2, cap: 0 }, grad: GRADS[2],
    created_by: 'u_tuan', managers: [], regOpen: true,
    registrations: [
      { id: 'rg1', pid: 'u_thao', series_id: sW.id, partner: null, team_name: '', note: 'Em đăng ký đơn nữ ạ', status: 'pending', created_at: ago(20) },
      { id: 'rg2', pid: 'u_an', series_id: sM.id, partner: null, team_name: '', note: '', status: 'pending', created_at: ago(6) },
    ],
    series: [sM, sW], created_at: ago(30),
  };
  finalizeTournament(t4);

  /* ---- Thảo luận ---- */
  const topics = [
    {
      id: 'tp_rules',
      title: '📢 Lịch thi đấu & điều lệ Giải Mùa Thu 2026',
      body: 'Chào cả nhà Ban KT!\n\nGiải Mùa Thu khởi tranh hôm nay tại Nhà thi đấu Ban KT với 2 Series:\n• Series A: 8 cặp chia 2 bảng, nhất – nhì mỗi bảng vào Bán kết (ghép chéo A1–B2).\n• Series B: 5 cặp đấu vòng tròn.\n\nMỗi trận 1 game chạm 11 cách 2, điểm trần 15. Các cặp có mặt trước 15 phút để khởi động nhé.',
      category: 'thongbao',
      tournament_id: 't_autumn',
      author_id: 'u_an',
      pinned: true,
      created_at: ago(30),
      edited_at: null,
      deleted_at: null,
      reactions: { '👍': ['u_tuan', 'u_huong', 'u_dung', 'u_khoa', 'u_mai'], '🔥': ['u_son', 'u_lan'] },
    },
    {
      id: 'tp_keo',
      title: 'Rủ kèo đánh đôi tối thứ 6 sau ca',
      body: 'Tối thứ 6 này mình xong ca lúc 18h, ai rảnh làm vài set đôi ở sân Gia Lâm không? Đang thiếu 2 người 🙌',
      category: 'rukeo',
      tournament_id: null,
      author_id: 'u_tuan',
      pinned: false,
      created_at: ago(9),
      edited_at: null,
      deleted_at: null,
      reactions: { '👍': ['u_dung', 'u_lan'], '❤️': ['u_huong'] },
    },
    {
      id: 'tp_gear',
      title: 'Xin review vợt cho người mới: Joola hay Selkirk?',
      body: 'Mình mới chơi được 2 tháng, đang phân vân giữa Joola Ben Johns Hyperion và Selkirk Vanguard. Anh em tư vấn giúp với, ngân sách tầm 4–5 triệu.',
      category: 'kythuat',
      tournament_id: null,
      author_id: 'u_thao',
      pinned: false,
      created_at: ago(28),
      edited_at: null,
      deleted_at: null,
      reactions: { '👍': ['u_khoa'] },
    },
    {
      id: 'tp_final',
      title: 'Chung kết Mùa Hè: màn ngược dòng không tưởng!',
      body: 'Ai xem trận chung kết hôm đó chưa? Bị dẫn 4–9 mà vẫn lật được 12–10. Đây là trận hay nhất từ trước tới nay của Ban KT 🏆',
      category: 'giaidau',
      tournament_id: 't_summer',
      author_id: 'u_khoa',
      pinned: false,
      created_at: ago(24 * 70),
      edited_at: null,
      deleted_at: null,
      reactions: { '🔥': ['u_tuan', 'u_huong', 'u_an', 'u_lan'], '😂': ['u_son'] },
    },
  ];

  const C = (id, topic_id, parent_id, author_id, body, h, extra = {}) => ({
    id, topic_id, parent_id, author_id, body, created_at: ago(h), edited_at: null, deleted_at: null, reactions: {}, ...extra,
  });
  const comments = [
    C('c1', 'tp_keo', null, 'u_dung', 'Mình tham gia! @ngoclan đi cùng không?', 8.5, { reactions: { '👍': ['u_tuan'] } }),
    C('c2', 'tp_keo', 'c1', 'u_lan', '@quocdung ok luôn, nhưng 18h30 mới tới được nhé.', 8, { edited_at: ago(7.8) }),
    C('c3', 'tp_keo', 'c2', 'u_tuan', '@ngoclan không sao, mình giữ sân tới 21h 👌', 7.5),
    C('c4', 'tp_keo', null, 'u_son', 'Tuần này mình trực đêm rồi.', 6, { deleted_at: ago(5.5) }),
    C('c5', 'tp_keo', null, 'u_huong', 'Cho mình đăng ký dự bị nha @minhtuan 😄', 4),
    C('c6', 'tp_rules', null, 'u_mai', 'Cho hỏi trận hoà điểm 10–10 thì đánh tới bao nhiêu ạ?', 26),
    C('c7', 'tp_rules', 'c6', 'u_an', '@thanhmai đánh tiếp tới khi cách biệt 2 điểm, tối đa chạm 15 là thắng em nhé.', 25, { reactions: { '❤️': ['u_mai'] } }),
    C('c8', 'tp_gear', null, 'u_khoa', 'Người mới thì Selkirk Vanguard dễ kiểm soát hơn, Hyperion lực hơn nhưng khó làm quen.', 27),
    C('c9', 'tp_gear', 'c8', 'u_thao', 'Cảm ơn @dangkhoa, chắc mình chọn Selkirk!', 26.5),
    C('c10', 'tp_final', null, 'u_tuan', 'Hôm đó tay run luôn 😅 cảm ơn cả nhà đã cổ vũ!', 24 * 69),
  ];

  const notifications = [
    { id: 'n1', user_id: 'u_an', type: 'pending', actor_id: 'u_linh', topic_id: null, comment_id: null, read: false, created_at: ago(2) },
    { id: 'n2', user_id: 'u_an', type: 'pending', actor_id: 'u_huy', topic_id: null, comment_id: null, read: false, created_at: ago(5) },
    { id: 'n3', user_id: 'u_tuan', type: 'mention', actor_id: 'u_huong', topic_id: 'tp_keo', comment_id: 'c5', read: false, created_at: ago(4) },
    { id: 'n4', user_id: 'u_tuan', type: 'registration', actor_id: 'u_thao', tournament_id: 't_yearend', read: false, created_at: ago(20) },
  ];

  return {
    version: 2,
    passwords: Object.fromEntries(profiles.filter((p) => !p.managed).map((p) => [p.email, '123456'])),
    profiles,
    tournaments: [t2, t3, t4, t1],
    topics,
    comments,
    notifications,
  };
}

export { CAT };
