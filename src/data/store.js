/* Kho trạng thái toàn cục – đơn giản, có subscribe */
import { api } from './api.js';

export const store = {
  session: null,
  me: null,
  profiles: [],
  tournaments: [],
  topics: [],
  comments: [],
  notifications: [],
  loaded: false,
};

const subs = new Set();
export const onStore = (fn) => (subs.add(fn), () => subs.delete(fn));
const notify = (what) => subs.forEach((fn) => fn(what));

export const profileById = (id) => store.profiles.find((p) => p.id === id) || null;
export const profileByHandle = (h) => store.profiles.find((p) => p.handle === h) || null;
export const isApproved = () => store.me?.status === 'approved';
export const isAdmin = () => isApproved() && store.me?.role === 'admin';

const loaders = {
  profiles: async () => {
    store.profiles = await api.listProfiles();
    store.me = store.session ? store.profiles.find((p) => p.id === store.session.user.id) || null : null;
  },
  tournaments: async () => (store.tournaments = await api.listTournaments()),
  topics: async () => (store.topics = await api.listTopics()),
  comments: async () => (store.comments = await api.listComments()),
  notifications: async () => (store.notifications = store.session ? await api.listNotifications() : []),
};

export async function reload(which) {
  const keys = which ? [which] : Object.keys(loaders);
  await Promise.all(keys.map((k) => loaders[k]?.()));
  // khi thay đổi hồ sơ / bình luận có thể sinh thông báo mới
  if (which && which !== 'notifications') await loaders.notifications();
  notify(which || 'all');
}

export async function initStore() {
  store.session = await api.getSession();
  await reload();
  store.loaded = true;
  api.subscribe((table) => reload(table));
  api.onAuthChange(async (s) => {
    store.session = s;
    await reload();
    notify('auth');
  });
}
