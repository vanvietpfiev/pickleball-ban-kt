/* Trình đổi ảnh đại diện: chọn/chụp ảnh → kéo & thu phóng trong khung tròn → nén 256px WebP
   Chính chủ hoặc admin được dùng. Có "Dùng lại ảnh Google" và "Xoá ảnh". */
import { I } from '../lib/icons.js';
import { esc, toast, openModal, avatar, confirmBox } from '../lib/utils.js';
import { api } from '../data/api.js';

const OUT = 256; // kích thước ảnh lưu
const VIEW = 260; // kích thước khung xem trước

export function openAvatarEditor(u, { byAdmin = false } = {}) {
  let img = null, scale = 1, minScale = 1, ox = 0, oy = 0;
  openModal({
    title: byAdmin ? `Ảnh đại diện · ${u.full_name}` : 'Đổi ảnh đại diện',
    sub: byAdmin ? 'Bạn đang sửa với quyền admin' : 'Ảnh được cắt tròn và nén nhẹ trước khi lưu',
    body: `<div class="ave">
      <div class="ave-stage" id="aveStage">
        <canvas id="aveCv" width="${VIEW * 2}" height="${VIEW * 2}" aria-label="Khung cắt ảnh"></canvas>
        <div class="ave-ring" aria-hidden="true"></div>
        <div class="ave-empty" id="aveEmpty">${avatar(u, 'xl')}<small>Chưa chọn ảnh mới</small></div>
      </div>
      <div class="ave-ctl" id="aveCtl" hidden>
        <span>−</span><input type="range" id="aveZoom" min="1" max="4" step="0.01" value="1" aria-label="Thu phóng"><span>+</span>
      </div>
      <p class="muted ave-tip" id="aveTip" hidden>Kéo để căn chỉnh · cuộn chuột / kéo thanh trượt để phóng to</p>
      <div class="row wrap ave-actions">
        <label class="btn btn-gold">${I.plus} Chọn ảnh<input type="file" accept="image/*" id="aveFile" hidden></label>
        <label class="btn btn-ghost ave-cam">📷 Chụp ảnh<input type="file" accept="image/*" capture="user" id="aveCam" hidden></label>
        ${u.google_avatar_url ? `<button class="btn btn-ghost" id="aveGoogle">${I.google} Dùng ảnh Google</button>` : ''}
        ${u.avatar_url ? `<button class="btn btn-ghost danger" id="aveDel">${I.trash} Xoá ảnh</button>` : ''}
      </div>
      <div class="form-err" id="aveErr"></div>
    </div>`,
    foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-gold" id="aveSave" disabled>${I.check} Lưu ảnh</button>`,
    onMount(m, close) {
      const cv = m.querySelector('#aveCv'), ctx = cv.getContext('2d');
      const zoom = m.querySelector('#aveZoom'), err = m.querySelector('#aveErr');
      const R = VIEW; // bán kính theo pixel canvas (canvas = 2x để nét)
      const clamp = () => {
        const w = img.width * scale, h = img.height * scale;
        ox = Math.min(0, Math.max(cv.width - w, ox));
        oy = Math.min(0, Math.max(cv.height - h, oy));
      };
      const draw = () => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (!img) return;
        clamp();
        ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);
      };
      const load = (file) => {
        err.textContent = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return (err.textContent = 'Vui lòng chọn tệp ảnh.');
        if (file.size > 15 * 1024 * 1024) return (err.textContent = 'Ảnh quá lớn (tối đa 15 MB).');
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
          img = im;
          minScale = Math.max(cv.width / im.width, cv.height / im.height);
          scale = minScale; zoom.value = 1;
          ox = (cv.width - im.width * scale) / 2; oy = (cv.height - im.height * scale) / 2;
          m.querySelector('#aveEmpty').hidden = true;
          m.querySelector('#aveCtl').hidden = false;
          m.querySelector('#aveTip').hidden = false;
          m.querySelector('#aveSave').disabled = false;
          draw();
          URL.revokeObjectURL(url);
        };
        im.onerror = () => (err.textContent = 'Không đọc được ảnh này (định dạng HEIC? hãy chọn JPG/PNG).');
        im.src = url;
      };
      m.querySelector('#aveFile').onchange = (e) => load(e.target.files[0]);
      m.querySelector('#aveCam').onchange = (e) => load(e.target.files[0]);

      const setZoom = (z, cx = cv.width / 2, cy = cv.height / 2) => {
        if (!img) return;
        const ns = minScale * Math.max(1, Math.min(4, z));
        ox = cx - ((cx - ox) * ns) / scale; oy = cy - ((cy - oy) * ns) / scale;
        scale = ns; zoom.value = ns / minScale; draw();
      };
      zoom.oninput = () => setZoom(+zoom.value);
      cv.addEventListener('wheel', (e) => { if (!img) return; e.preventDefault(); setZoom(scale / minScale * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });
      let drag = null;
      cv.addEventListener('pointerdown', (e) => { if (!img) return; drag = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const k = cv.width / cv.getBoundingClientRect().width;
        ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; draw();
      });
      cv.addEventListener('pointerup', () => (drag = null));
      cv.addEventListener('pointercancel', () => (drag = null));

      const done = async (value, msg) => {
        try { await api.setAvatar(u.id, value); toast(msg, 'ok'); close(); } catch (e) { err.textContent = e.message; }
      };
      m.querySelector('#aveSave').onclick = () => {
        if (!img) return;
        const out = document.createElement('canvas');
        out.width = out.height = OUT;
        const o = out.getContext('2d');
        o.imageSmoothingQuality = 'high';
        o.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, OUT, OUT);
        let data = out.toDataURL('image/webp', 0.85);
        if (!data.startsWith('data:image/webp')) data = out.toDataURL('image/jpeg', 0.88);
        done(data, 'Đã cập nhật ảnh đại diện.');
      };
      m.querySelector('#aveGoogle')?.addEventListener('click', () => done('google', 'Đã chuyển về ảnh Google.'));
      m.querySelector('#aveDel')?.addEventListener('click', async () => {
        if (!(await confirmBox('Xoá ảnh đại diện?', `Ảnh của ${esc(u.full_name)} sẽ được thay bằng chữ viết tắt tên.`, 'Xoá ảnh', true))) return;
        done(null, 'Đã xoá ảnh đại diện.');
      });
      void R;
    },
  });
}
