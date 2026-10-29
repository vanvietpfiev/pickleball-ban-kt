/* Chọn nguồn dữ liệu: Supabase (khi có .env) hoặc DEMO (localStorage) */
import { demoApi } from './demo.js';

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

// Công tắc thử nghiệm: thêm ?demo=1 vào URL để ép chế độ demo, ?demo=0 để bỏ
let forceDemo = false;
if (typeof location !== 'undefined' && typeof localStorage !== 'undefined') {
  const q = new URLSearchParams(location.search || '').get('demo');
  if (q === '1') localStorage.setItem('pbkt_force_demo', '1');
  if (q === '0') localStorage.removeItem('pbkt_force_demo');
  forceDemo = localStorage.getItem('pbkt_force_demo') === '1';
}

let api = demoApi;
if (url && key && !forceDemo) {
  try {
    const mod = await import('./supabase.js');
    api = mod.createSupabaseApi(url, key);
  } catch (e) {
    console.warn('Không khởi tạo được Supabase, dùng chế độ demo.', e);
  }
}
export { api };
