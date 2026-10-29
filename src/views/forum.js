/* Thảo luận: danh sách chủ đề + chi tiết chủ đề với bình luận lồng nhau */
import { I } from '../lib/icons.js';
import { esc, avatar, timeAgo, fmtDateTime, toast, openModal, confirmBox, emptyBox, popover, closePopover, stripVN } from '../lib/utils.js';
import { store, profileById, isApproved, isAdmin } from '../data/store.js';
import { api } from '../data/api.js';
import { richText, attachMention } from '../components/mention.js';

export const CATS = {
  thongbao: { l: 'Thông báo', ic: '📢', c: 'gold' },
  rukeo: { l: 'Rủ kèo', ic: '🏓', c: 'live' },
  giaidau: { l: 'Giải đấu', ic: '🏆', c: 'sky' },
  kythuat: { l: 'Kỹ thuật & dụng cụ', ic: '🎯', c: 'ok' },
  chung: { l: 'Tán gẫu', ic: '☕', c: '' },
};
const EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

const commentsOf = (tid) => store.comments.filter((c) => c.topic_id === tid);
const lastAct = (tp) => commentsOf(tp.id).reduce((m, c) => (c.created_at > m ? c.created_at : m), tp.created_at);

/* =============== DANH SÁCH =============== */
let cat = 'all';
let sort = 'new';
let q = '';

export const forum = {
  title: 'Thảo luận',
  render() {
    let list = store.topics.filter((t) => !t.deleted_at);
    if (cat !== 'all') list = list.filter((t) => t.category === cat);
    if (q) { const s = stripVN(q).toLowerCase(); list = list.filter((t) => stripVN(t.title + ' ' + t.body).toLowerCase().includes(s)); }
    const score = (t) => commentsOf(t.id).filter((c) => !c.deleted_at).length * 2 + Object.values(t.reactions || {}).flat().length;
    list.sort((a, b) => (b.pinned - a.pinned) || (sort === 'hot' ? score(b) - score(a) : lastAct(b).localeCompare(lastAct(a))));
    return `<div class="anim-in">
      <div class="page-head">
        <div><h1>Thảo luận</h1><p>Rủ kèo, bàn chiến thuật, review dụng cụ – gõ <b>@</b> để nhắc tên đồng đội</p></div>
        <div class="actions">${isApproved() ? `<button class="btn btn-gold" id="newTopic">${I.plus} Tạo chủ đề</button>` : '<span class="chip live">⏳ Cần được duyệt để đăng bài</span>'}</div>
      </div>
      <div class="row wrap between" style="gap:12px;margin-bottom:16px">
        <div class="pills"><button class="pill ${cat === 'all' ? 'on' : ''}" data-cat="all">Tất cả</button>${Object.entries(CATS).map(([k, v]) => `<button class="pill ${cat === k ? 'on' : ''}" data-cat="${k}">${v.ic} ${v.l}</button>`).join('')}</div>
        <div class="row"><label class="search" style="width:220px">${I.search}<input id="fq" placeholder="Tìm chủ đề…" value="${esc(q)}"></label>
          <select class="select" id="fsort" style="width:auto;padding:9px 34px 9px 12px"><option value="new" ${sort === 'new' ? 'selected' : ''}>Mới hoạt động</option><option value="hot" ${sort === 'hot' ? 'selected' : ''}>Sôi nổi nhất</option></select></div>
      </div>
      ${list.length ? `<div class="topic-list">${list.map(topicRow).join('')}</div>` : emptyBox('💬', 'Chưa có chủ đề nào', q ? 'Không tìm thấy chủ đề phù hợp.' : 'Hãy mở chủ đề đầu tiên!')}
    </div>`;
  },
  mount(root, p, rerender) {
    root.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { cat = b.dataset.cat; rerender(); }));
    root.querySelector('#fsort').onchange = (e) => { sort = e.target.value; rerender(); };
    let tm;
    root.querySelector('#fq').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; rerender(); }, 250); };
    root.querySelector('#newTopic')?.addEventListener('click', () => topicModal());
    if (p.query.new && isApproved()) { topicModal(null, p.query.t); history.replaceState(null, '', '#/forum'); }
  },
};

function topicRow(t) {
  const a = profileById(t.author_id);
  const cs = commentsOf(t.id).filter((c) => !c.deleted_at);
  const people = [...new Set(cs.map((c) => c.author_id))].slice(0, 4).map(profileById);
  const rx = Object.values(t.reactions || {}).flat().length;
  const c = CATS[t.category] || CATS.chung;
  const tour = t.tournament_id ? store.tournaments.find((x) => x.id === t.tournament_id) : null;
  return `<a class="topic-row card hoverable ${t.pinned ? 'pinned' : ''}" href="#/topic/${t.id}">
    ${avatar(a, 'lg')}
    <div class="tr-main">
      <div class="row wrap" style="gap:6px;margin-bottom:4px">${t.pinned ? `<span class="chip gold">${I.pinned.replace('<svg', '<svg width="12" height="12"')} Ghim</span>` : ''}<span class="chip ${c.c}">${c.ic} ${c.l}</span>${tour ? `<span class="chip">🏆 ${esc(tour.name)}</span>` : ''}</div>
      <h3>${esc(t.title)}</h3>
      <p class="tr-ex">${esc(t.body.slice(0, 160))}${t.body.length > 160 ? '…' : ''}</p>
      <div class="tr-meta"><b>${esc(a?.full_name || '—')}</b> · ${timeAgo(t.created_at)}${cs.length ? ` · hoạt động ${timeAgo(lastAct(t))}` : ''}</div>
    </div>
    <div class="tr-side">
      <div class="stack-av">${people.map((p) => avatar(p, 'xs')).join('')}</div>
      <div class="tr-count"><span>💬 <b>${cs.length}</b></span><span>❤️ <b>${rx}</b></span></div>
    </div>
  </a>`;
}

function topicModal(tp = null, tournamentId = '') {
  const tours = store.tournaments;
  openModal({
    title: tp ? 'Sửa chủ đề' : 'Tạo chủ đề mới',
    sub: 'Gõ @ để nhắc tên thành viên – họ sẽ nhận được thông báo',
    wide: true,
    body: `<div class="stack">
      <label class="field"><span>Tiêu đề *</span><input class="input" id="tpTitle" maxlength="140" value="${esc(tp?.title || '')}" placeholder="VD: Rủ kèo đánh đôi tối thứ 6"></label>
      <div class="grid-2">
        <label class="field"><span>Chuyên mục</span><select class="select" id="tpCat">${Object.entries(CATS).filter(([k]) => k !== 'thongbao' || isAdmin()).map(([k, v]) => `<option value="${k}" ${(tp?.category || (tournamentId ? 'giaidau' : 'chung')) === k ? 'selected' : ''}>${v.ic} ${v.l}</option>`).join('')}</select></label>
        <label class="field"><span>Gắn với giải (tuỳ chọn)</span><select class="select" id="tpTour"><option value="">— Không —</option>${tours.map((t) => `<option value="${t.id}" ${(tp?.tournament_id || tournamentId) === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Nội dung *</span><textarea class="textarea" id="tpBody" rows="7" placeholder="Chia sẻ điều bạn muốn bàn…">${esc(tp?.body || '')}</textarea></label>
      <div class="form-err" id="tpErr"></div></div>`,
    foot: `<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-gold" id="tpSave">${tp ? 'Lưu thay đổi' : 'Đăng chủ đề'}</button>`,
    onMount(m, close) {
      attachMention(m.querySelector('#tpBody'));
      m.querySelector('#tpSave').onclick = async () => {
        const title = m.querySelector('#tpTitle').value.trim();
        const body = m.querySelector('#tpBody').value.trim();
        if (!title || !body) return (m.querySelector('#tpErr').textContent = 'Nhập đủ tiêu đề và nội dung.');
        const data = { title, body, category: m.querySelector('#tpCat').value, tournament_id: m.querySelector('#tpTour').value || null };
        try {
          if (tp) { await api.updateTopic(tp.id, data); toast('Đã cập nhật chủ đề.', 'ok'); close(); }
          else { const n = await api.createTopic(data); close(); toast('Đã đăng chủ đề!', 'ok'); location.hash = '#/topic/' + n.id; }
        } catch (e) { m.querySelector('#tpErr').textContent = e.message; }
      };
    },
  });
}

/* =============== CHI TIẾT CHỦ ĐỀ =============== */
let replyTo = null; // id bình luận đang trả lời
let editing = null; // id bình luận đang sửa
let lastTopic = null;

export const topic = {
  title: (p) => store.topics.find((t) => t.id === p.id)?.title || 'Chủ đề',
  render(p) {
    const tp = store.topics.find((t) => t.id === p.id);
    if (!tp) return emptyBox('🔍', 'Không tìm thấy chủ đề', '', `<a class="btn btn-ghost" href="#/forum">${I.back} Thảo luận</a>`);
    if (lastTopic !== tp.id) { replyTo = editing = null; lastTopic = tp.id; }
    const a = profileById(tp.author_id);
    const c = CATS[tp.category] || CATS.chung;
    const own = store.me?.id === tp.author_id;
    const cs = commentsOf(tp.id);
    const alive = cs.filter((x) => !x.deleted_at).length;
    const tour = tp.tournament_id ? store.tournaments.find((x) => x.id === tp.tournament_id) : null;
    const others = store.topics.filter((t) => t.id !== tp.id && !t.deleted_at).sort((x, y) => lastAct(y).localeCompare(lastAct(x))).slice(0, 6);

    if (tp.deleted_at) return `<a class="back-link" href="#/forum">${I.back} Thảo luận</a>` + emptyBox('🗑️', 'Chủ đề đã được thu hồi', 'Tác giả hoặc admin đã thu hồi chủ đề này.');

    return `<div class="topic-layout anim-in">
      <div class="topic-main">
        <a class="back-link" href="#/forum">${I.back} Thảo luận</a>
        <article class="card topic-card">
          <div class="row wrap" style="gap:6px">${tp.pinned ? '<span class="chip gold">📌 Ghim</span>' : ''}<span class="chip ${c.c}">${c.ic} ${c.l}</span>${tour ? `<a class="chip" href="#/t/${tour.id}">🏆 ${esc(tour.name)}</a>` : ''}</div>
          <h1>${esc(tp.title)}</h1>
          <div class="row" style="margin:14px 0 16px">${avatar(a)}<div style="flex:1"><a href="#/u/${a?.id}" class="c-name">${esc(a?.full_name)}</a><div class="c-time">${fmtDateTime(tp.created_at)}${tp.edited_at ? ' · <span class="edited">đã chỉnh sửa</span>' : ''}</div></div>
            ${own || isAdmin() ? `<button class="icon-btn" id="tpMenu" aria-label="Tuỳ chọn">${I.more}</button>` : ''}</div>
          <div class="rich">${richText(tp.body)}</div>
          ${reactBar('topic', tp)}
        </article>

        <div class="sec sky"><h2>${alive} bình luận</h2></div>
        ${isApproved() ? composer('root', 'Viết bình luận… (gõ @ để nhắc tên, Ctrl+Enter để gửi)') : `<div class="hint">⏳ Tài khoản của bạn cần được admin duyệt để bình luận.</div>`}
        <div class="thread">${thread(cs, null, 0)}</div>
        ${!cs.length ? emptyBox('🗨️', 'Chưa có bình luận', 'Hãy là người mở màn cuộc trò chuyện.') : ''}
      </div>
      <aside class="topic-side">
        ${isApproved() ? `<button class="btn btn-gold btn-block" id="newTopic2">${I.plus} Tạo chủ đề</button>` : ''}
        <div class="card card-pad" style="margin-top:14px"><b class="side-h">Chủ đề khác</b>
          ${others.map((t) => `<a class="side-topic" href="#/topic/${t.id}"><div><b>${esc(t.title)}</b><small>${commentsOf(t.id).filter((x) => !x.deleted_at).length} bình luận · ${timeAgo(lastAct(t))}</small></div></a>`).join('')}
        </div>
      </aside>
    </div>`;
  },
  mount(root, p, rerender) {
    const tp = store.topics.find((t) => t.id === p.id);
    if (!tp) return;
    root.querySelectorAll('textarea[data-composer]').forEach((ta) => {
      attachMention(ta);
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(ta.dataset.composer); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; });
    });
    root.querySelector('#newTopic2')?.addEventListener('click', () => topicModal());
    root.querySelector('#tpMenu')?.addEventListener('click', (e) => {
      const own = store.me?.id === tp.author_id;
      popover(e.currentTarget, `${own ? `<button class="menu-item" data-a="edit">${I.edit}Sửa chủ đề</button>` : ''}
        ${isAdmin() ? `<button class="menu-item" data-a="pin">${I.pinned}${tp.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>` : ''}
        <button class="menu-item danger" data-a="del">${I.undo}Thu hồi chủ đề</button>`, (pop) => pop.addEventListener('click', async (ev) => {
        const a = ev.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        closePopover();
        try {
          if (a === 'edit') topicModal(tp);
          if (a === 'pin') { await api.updateTopic(tp.id, { pinned: !tp.pinned }); toast(tp.pinned ? 'Đã bỏ ghim.' : 'Đã ghim chủ đề.', 'ok'); }
          if (a === 'del' && (await confirmBox('Thu hồi chủ đề?', 'Chủ đề sẽ bị ẩn khỏi diễn đàn.', 'Thu hồi', true))) { await api.updateTopic(tp.id, { deleted_at: new Date().toISOString() }); location.hash = '#/forum'; }
        } catch (ex) { toast(ex.message, 'err'); }
      }));
    });

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const { act, id } = b.dataset;
      try {
        if (act === 'reply') { replyTo = replyTo === id ? null : id; editing = null; rerender(); setTimeout(() => root.querySelector(`[data-composer="r:${id}"]`)?.focus(), 0); }
        if (act === 'edit') { editing = id; replyTo = null; rerender(); setTimeout(() => { const t = root.querySelector(`[data-composer="e:${id}"]`); t?.focus(); t?.setSelectionRange(t.value.length, t.value.length); }, 0); }
        if (act === 'cancel') { replyTo = editing = null; rerender(); }
        if (act === 'send') submit(b.dataset.target);
        if (act === 'recall' && (await confirmBox('Thu hồi bình luận?', 'Nội dung sẽ được thay bằng “Bình luận đã được thu hồi”. Các trả lời bên dưới vẫn được giữ lại.', 'Thu hồi', true))) { await api.recallComment(id); toast('Đã thu hồi bình luận.'); }
        if (act === 'react') emojiPicker(b, b.dataset.kind, id);
        if (act === 'rx') await api.toggleReaction(b.dataset.kind, id, b.dataset.e);
        if (act === 'more') commentMenu(b, id);
      } catch (ex) { toast(ex.message, 'err'); }
    });

    async function submit(key) {
      const ta = root.querySelector(`[data-composer="${key}"]`);
      const body = ta?.value.trim();
      if (!body) return ta?.focus();
      try {
        if (key.startsWith('e:')) { await api.editComment(key.slice(2), body); editing = null; toast('Đã lưu chỉnh sửa.', 'ok'); }
        else {
          const parent_id = key.startsWith('r:') ? key.slice(2) : null;
          ta.value = '';
          replyTo = null;
          const c = await api.addComment({ topic_id: tp.id, parent_id, body });
          setTimeout(() => document.getElementById('c_' + c.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        }
        rerender();
      } catch (ex) { toast(ex.message, 'err'); }
    }

    // nhảy tới bình luận từ thông báo
    if (p.query.c) setTimeout(() => { const el = document.getElementById('c_' + p.query.c); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }, 100);
  },
};

function composer(key, ph, value = '', compact = false) {
  return `<div class="composer ${compact ? 'compact' : ''}">
    ${compact ? '' : avatar(store.me, 'sm')}
    <div class="cp-box">
      <textarea class="textarea" id="cp_${key.replace(':', '_')}" data-composer="${key}" rows="${compact ? 2 : 3}" placeholder="${esc(ph)}">${esc(value)}</textarea>
      <div class="cp-bar"><span class="muted">${I.at.replace('<svg', '<svg width="14" height="14"')} gõ @ để tag · Ctrl+Enter để gửi</span>
        <div class="row">${compact ? '<button class="btn btn-sm btn-ghost" data-act="cancel">Huỷ</button>' : ''}<button class="btn btn-sm btn-gold" data-act="send" data-target="${key}">${I.send} ${key.startsWith('e:') ? 'Lưu' : 'Gửi'}</button></div></div>
    </div>
  </div>`;
}

function thread(all, parentId, depth) {
  const kids = all.filter((c) => c.parent_id === parentId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return kids.map((c) => commentHTML(all, c, depth)).join('');
}

function commentHTML(all, c, depth) {
  const a = profileById(c.author_id);
  const own = store.me?.id === c.author_id;
  const parent = c.parent_id ? all.find((x) => x.id === c.parent_id) : null;
  const deep = depth >= 3; // từ cấp 4 trở đi hiển thị phẳng, kèm “trả lời @…”
  const children = thread(all, c.id, depth + 1);
  const rec = !!c.deleted_at;
  return `<div class="cmt ${depth && !deep ? 'nested' : ''}" id="c_${c.id}">
    <div class="cmt-row">
      ${avatar(a, depth ? 'sm' : '')}
      <div class="cmt-body">
        <div class="cmt-bubble ${rec ? 'recalled' : ''}">
          <div class="cmt-head"><a class="c-name" href="#/u/${a?.id}">${esc(a?.full_name || '—')}</a>
            <span class="c-time" title="${fmtDateTime(c.created_at)}">${timeAgo(c.created_at)}</span>
            ${c.edited_at && !rec ? '<span class="edited">đã chỉnh sửa</span>' : ''}</div>
          ${rec ? `<div class="rich muted"><i>${I.undo.replace('<svg', '<svg width="13" height="13"')} Bình luận đã được thu hồi</i></div>`
            : editing === c.id ? composer('e:' + c.id, 'Sửa bình luận…', c.body, true)
            : `<div class="rich">${deep && parent ? `<span class="reply-to">↪ ${esc(profileById(parent.author_id)?.full_name || '')}</span> ` : ''}${richText(c.body)}</div>`}
        </div>
        ${!rec && editing !== c.id ? `<div class="cmt-actions">
          ${rxChips('comment', c)}
          ${isApproved() ? `<button data-act="react" data-kind="comment" data-id="${c.id}" class="ca" aria-label="Bày tỏ cảm xúc">😊</button>
          <button data-act="reply" data-id="${c.id}" class="ca">${I.reply} Trả lời</button>` : ''}
          ${own || isAdmin() ? `<button data-act="more" data-id="${c.id}" class="ca" aria-label="Tuỳ chọn">${I.more}</button>` : ''}
        </div>` : ''}
        ${replyTo === c.id ? composer('r:' + c.id, `Trả lời ${a?.full_name}…`, a && !own ? '@' + a.handle + ' ' : '', true) : ''}
      </div>
    </div>
    ${children ? `<div class="cmt-children ${deep ? 'flat' : ''}">${children}</div>` : ''}
  </div>`;
}

function rxChips(kind, row) {
  return Object.entries(row.reactions || {}).filter(([, u]) => u.length).map(([e, users]) => {
    const mine = users.includes(store.me?.id);
    const names = users.map((u) => profileById(u)?.full_name).filter(Boolean).join(', ');
    return `<button class="rx ${mine ? 'mine' : ''}" data-act="rx" data-kind="${kind}" data-id="${row.id}" data-e="${e}" title="${esc(names)}" ${isApproved() ? '' : 'disabled'}>${e} <b>${users.length}</b></button>`;
  }).join('');
}
function reactBar(kind, row) {
  return `<div class="react-bar">${rxChips(kind, row)}${isApproved() ? `<button class="rx add" data-act="react" data-kind="${kind}" data-id="${row.id}">😊 +</button>` : ''}</div>`;
}

function emojiPicker(anchor, kind, id) {
  popover(anchor, `<div class="emoji-pick">${EMOJIS.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>`, (pop) =>
    pop.addEventListener('click', async (ev) => {
      const e = ev.target.closest('[data-e]')?.dataset.e;
      if (!e) return;
      closePopover();
      try { await api.toggleReaction(kind, id, e); } catch (ex) { toast(ex.message, 'err'); }
    })
  );
}

function commentMenu(anchor, id) {
  const c = store.comments.find((x) => x.id === id);
  const own = store.me?.id === c.author_id;
  popover(anchor, `${own ? `<button class="menu-item" data-act="edit" data-id="${id}">${I.edit}Sửa bình luận</button>` : ''}
    <button class="menu-item danger" data-act="recall" data-id="${id}">${I.undo}Thu hồi${own ? '' : ' (quyền admin)'}</button>`, (pop) =>
    pop.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      closePopover();
      // chuyển tiếp hành động tới khung thread
      const proxy = document.createElement('button');
      proxy.dataset.act = b.dataset.act;
      proxy.dataset.id = id;
      document.querySelector('.thread')?.appendChild(proxy);
      proxy.click();
      proxy.remove();
    })
  );
}
