/* Màn hình Đăng nhập / Đăng ký */
import { I } from '../lib/icons.js';
import { esc, avatar, toast, openModal } from '../lib/utils.js';
import { api } from '../data/api.js';

let mode = 'login';

export function renderAuth(root) {
  root.innerHTML = `
  <div class="auth">
    <section class="auth-art" aria-hidden="true">
      <img src="/login-hero.jpg" alt="">
      <div class="auth-art-ov">
        <div class="auth-brand"><span class="brand" style="margin:0">KT</span><div><b>Pickleball Ban KT</b><small>BAN KỸ THUẬT · VIETNAM AIRLINES</small></div></div>
        <div class="auth-quote">
          <h2>Cất cánh cùng<br><span>từng cú giao bóng.</span></h2>
          <p>Bảng điểm trực tiếp, giải đấu nội bộ và góc giao lưu của anh em kỹ thuật – tất cả ở một nơi.</p>
          <div class="auth-feats">
            <span>${I.live} Tỉ số realtime</span><span>${I.trophy} Tạo giải 1 phút</span><span>${I.chat} Thảo luận & @tag</span>
          </div>
        </div>
        <div class="runway-strip"></div>
      </div>
    </section>

    <section class="auth-side">
      <div class="auth-card card">
        <div class="auth-logo">KT</div>
        <h1 id="authTitle">${mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h1>
        <p class="auth-sub">${mode === 'login' ? 'Đăng nhập để vào sân cùng Ban Kỹ thuật.' : 'Đăng ký miễn phí – admin sẽ duyệt để bạn được tham gia.'}</p>

        <button class="btn btn-white btn-lg btn-block" id="googleBtn">${I.google} Tiếp tục với Google</button>
        <div class="auth-or"><span>hoặc dùng email</span></div>

        <form id="authForm" class="stack" novalidate>
          ${mode === 'signup' ? `<label class="field"><span>Họ và tên</span><input class="input" id="fName" autocomplete="name" placeholder="VD: Nguyễn Văn A" required></label>` : ''}
          <label class="field"><span>Email</span><input class="input" id="fEmail" type="email" autocomplete="email" placeholder="ban@vietnamairlines.com" required></label>
          <label class="field"><span class="row between">Mật khẩu ${mode === 'login' ? '<button type="button" class="link-btn" id="forgotBtn">Quên mật khẩu?</button>' : ''}</span>
            <div class="pw-wrap"><input class="input" id="fPw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="Tối thiểu 6 ký tự" required>
            <button type="button" class="pw-eye" id="pwEye" aria-label="Hiện mật khẩu">${I.eye}</button></div></label>
          <div class="form-err" id="authErr" aria-live="polite"></div>
          <button class="btn btn-gold btn-lg btn-block" id="authSubmit" type="submit">${mode === 'login' ? 'Vào sân' : 'Đăng ký'} ${I.right}</button>
        </form>

        <p class="auth-switch">${mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} <button class="link-btn" id="switchBtn">${mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}</button></p>
        ${api.mode === 'demo' ? `<div class="hint" style="margin-top:14px">🧪 <b>Chế độ demo</b>: đăng nhập admin bằng <code>an@demo.vn</code> / <code>123456</code>, hoặc bấm “Tiếp tục với Google” để chọn tài khoản mẫu.</div>` : ''}
      </div>
      <p class="auth-foot">© ${new Date().getFullYear()} Ban Kỹ thuật – Vietnam Airlines · Ứng dụng nội bộ</p>
    </section>
  </div>`;

  const $ = (s) => root.querySelector(s);
  $('#switchBtn').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; renderAuth(root); };
  $('#pwEye').onclick = () => { const i = $('#fPw'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#forgotBtn')?.addEventListener('click', async () => {
    const email = $('#fEmail').value.trim();
    if (!email) return ($('#authErr').textContent = 'Nhập email trước, rồi bấm “Quên mật khẩu?”.');
    await api.resetPassword(email);
    toast('Đã gửi liên kết đặt lại mật khẩu tới ' + email, 'ok');
  });

  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#authErr');
    err.textContent = '';
    const email = $('#fEmail').value.trim();
    const pw = $('#fPw').value;
    const name = $('#fName')?.value.trim();
    if (mode === 'signup' && !name) return (err.textContent = 'Vui lòng nhập họ tên.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = 'Email chưa đúng định dạng.');
    if (pw.length < 6) return (err.textContent = 'Mật khẩu tối thiểu 6 ký tự.');
    const btn = $('#authSubmit');
    btn.disabled = true;
    try {
      if (mode === 'login') await api.signInWithPassword(email, pw);
      else {
        const r = await api.signUp(email, pw, name);
        if (r?.needsConfirm) {
          err.textContent = '';
          btn.disabled = false;
          toast('Đã gửi email xác nhận tới ' + email + ' – mở hộp thư và bấm liên kết để kích hoạt.', 'ok');
        } else if (r?.status === 'approved') toast('Chào mừng! Tài khoản đã được liên kết với hồ sơ có sẵn.', 'ok');
        else toast('Đăng ký thành công! Tài khoản đang chờ admin duyệt.', 'ok');
      }
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  };

  $('#googleBtn').onclick = () => (api.mode === 'demo' ? demoGooglePicker() : api.signInWithGoogle());
}

/* Demo: mô phỏng màn hình chọn tài khoản Google */
function demoGooglePicker() {
  const accs = api.demoAccounts();
  openModal({
    title: 'Chọn tài khoản Google',
    sub: 'Mô phỏng đăng nhập Google trong chế độ demo',
    body: `<div class="g-list">${accs.map((p) => `<button class="menu-item" data-pick="${p.id}" style="padding:10px">${avatar(p)}<span style="flex:1;min-width:0"><b style="display:block">${esc(p.full_name)}</b><small class="muted">${esc(p.email)}</small></span>
        ${p.role === 'admin' ? '<span class="chip gold">Admin</span>' : p.status === 'pending' ? '<span class="chip live">Chờ duyệt</span>' : ''}</button>`).join('')}</div>
      <div class="menu-sep" style="margin:12px 0"></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:8px">Hoặc giả lập một tài khoản Google mới (sẽ ở trạng thái chờ duyệt):</p>
      <div class="grid-2"><input class="input" id="gName" placeholder="Họ tên"><input class="input" id="gEmail" placeholder="email@gmail.com"></div>`,
    foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-gold" id="gNew">Tạo & đăng nhập</button>`,
    onMount(m, close) {
      m.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { api.signInWithGoogle({ id: b.dataset.pick }); close(); }));
      m.querySelector('#gNew').onclick = () => {
        const full_name = m.querySelector('#gName').value.trim();
        const email = m.querySelector('#gEmail').value.trim().toLowerCase();
        if (!full_name || !email.includes('@')) return toast('Nhập họ tên và email hợp lệ.', 'err');
        api.signInWithGoogle({ full_name, email });
        close();
        toast('Đã tạo tài khoản – đang chờ admin duyệt.', 'ok');
      };
    },
  });
}
