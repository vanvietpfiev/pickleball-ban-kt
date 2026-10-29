/* Điều lệ & Luật thi đấu */
let rtab = 'dieule';

const GENERAL = [
  ['THÔNG TIN CHUNG', ['Đơn vị tổ chức: Ban Kỹ thuật – Tổng công ty Hàng không Việt Nam.', 'Giải giao lưu nội bộ, tổ chức định kỳ theo mùa (Xuân · Hè · Thu · Cuối năm).', 'Tinh thần: rèn luyện sức khoẻ – gắn kết đồng nghiệp – vui là chính.']],
  ['THÀNH PHẦN THAM DỰ', ['Cán bộ, nhân viên Ban Kỹ thuật, các đơn vị trong Khối Kỹ thuật và khách mời được BTC chấp thuận.', 'Đăng ký theo nội dung: đơn nam · đơn nữ · đôi nam · đôi nữ · đôi nam nữ.', 'Mỗi VĐV có thể đăng ký nhiều nội dung nếu lịch cho phép.']],
  ['THỂ THỨC THI ĐẤU', ['Vòng bảng: đấu vòng tròn 1 lượt tính điểm.', 'Vòng trong: các đội dẫn đầu vào Chung kết & Tranh hạng Ba.', 'BTC quyết định số bảng và số đội đi tiếp tuỳ số lượng đăng ký.']],
  ['NGUYÊN TẮC XẾP HẠNG', ['Ưu tiên lần lượt: Số trận thắng › Đối đầu trực tiếp › Hiệu số điểm › Tổng điểm ghi.', 'Nếu vẫn bằng nhau, BTC bốc thăm hoặc đấu thêm 1 ván 7 điểm.']],
  ['QUY ĐỊNH CHUNG', ['Có mặt trước giờ đấu tối thiểu 10 phút; trang phục thể thao phù hợp. Lịch thi đấu bố trí ngoài ca trực.', 'Tôn trọng trọng tài, đối thủ và tinh thần Fair-play.', 'VĐV tự bảo đảm sức khoẻ; báo BTC nếu có vấn đề y tế.', 'Mọi khiếu nại xử lý ngay tại chỗ; quyết định của BTC là cuối cùng.']],
  ['GIẢI THƯỞNG', ['Mỗi nội dung: Giải Nhất · Nhì · Ba.', 'Kèm các giải phụ: Phong cách · Fair-play · Trang phục · Cống hiến…', 'Kết quả được lưu vĩnh viễn trong mục Lịch sử giải đấu.']],
];
const PLAY = [
  ['🏓', 'Sân & dụng cụ', 'Sân 13,41 × 6,10 m, lưới cao 0,86 m ở giữa. Dùng vợt pickleball và bóng nhựa có lỗ. Khu cấm vô-lê (“bếp”) rộng 2,13 m mỗi bên lưới.'],
  ['🚀', 'Giao bóng', 'Giao dưới tay, điểm chạm bóng thấp hơn thắt lưng; đánh chéo sân sang ô đối diện. Bóng phải qua khu bếp. Mỗi lần chỉ giao 1 quả.'],
  ['↩️', 'Luật 2 nảy', 'Sau khi giao, mỗi bên phải để bóng nảy 1 lần rồi mới được đánh. Sau 2 nhịp nảy đó mới được vô-lê.'],
  ['🍳', 'Khu bếp (NVZ)', 'Không được vô-lê khi đang đứng trong khu bếp hoặc chạm vạch bếp. Đà người sau khi vô-lê mà chạm bếp cũng tính lỗi.'],
  ['🔢', 'Cách tính điểm', 'Thể thức chạm 11, thắng cách biệt tối thiểu 2 điểm (10–10 thì đấu tiếp). Trận quan trọng có thể quy định 15 hoặc 21 điểm.'],
  ['⛔', 'Lỗi thường gặp', 'Bóng ra ngoài; không qua lưới; vô-lê trong bếp; bóng nảy 2 lần; chạm lưới/cọc lưới; người/vợt chạm sân đối phương.'],
  ['🤝', 'Tinh thần thi đấu', 'Tự giác báo điểm trung thực, hô tỉ số trước khi giao. Chơi hết mình nhưng an toàn, vui vẻ, đúng tinh thần giao lưu Ban KT.'],
];
const COLORS = ['#F3C43C', '#4AA3DB', '#FFD76A', '#7CC3EF', '#F0A65A', '#5FD3A6'];

export const rules = {
  title: 'Điều lệ',
  render() {
    return `<div class="anim-in">
      <div class="page-head"><div><h1>Điều lệ & Luật thi đấu</h1><p>Áp dụng chung cho các giải do Ban Kỹ thuật tổ chức</p></div></div>
      <div class="tabs" style="max-width:420px"><button class="${rtab === 'dieule' ? 'on' : ''}" data-rt="dieule">Điều lệ chung</button><button class="${rtab === 'luat' ? 'on' : ''}" data-rt="luat">Luật thi đấu</button></div>
      ${rtab === 'dieule'
        ? `<div class="stack">${GENERAL.map(([h, items], i) => `<div class="card card-pad rule-block"><div class="row" style="margin-bottom:10px"><span class="rule-n mono" style="background:${COLORS[i % 6]}">${String(i + 1).padStart(2, '0')}-00</span><h3>${h}</h3></div><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>`
        : `<div class="rule-grid">${PLAY.map(([ic, h, p]) => `<div class="card card-pad row" style="align-items:flex-start;gap:14px"><span style="font-size:30px;line-height:1">${ic}</span><div><h3 style="font-size:15px;margin-bottom:4px">${h}</h3><p class="muted" style="font-size:13px;line-height:1.6">${p}</p></div></div>`).join('')}</div>`}
    </div>`;
  },
  mount(root, _p, rerender) {
    root.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => { rtab = b.dataset.rt; rerender(); }));
  },
};
