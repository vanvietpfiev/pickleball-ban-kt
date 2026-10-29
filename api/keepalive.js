// Vercel Serverless Function – được cron gọi mỗi ngày (xem vercel.json)
// Gửi 1 truy vấn nhẹ tới Supabase để project miễn phí không bị tạm dừng do "không hoạt động".
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, error: 'Thiếu biến môi trường Supabase' });
  try {
    const r = await fetch(`${url}/rest/v1/tournaments?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e) });
  }
}
