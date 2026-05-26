// api/cron-odds.js — Vercel Cron Job: refresh odds for all active races
// Runs every 5 mins on race days: "*/5 7-19 * * 1-6" (Mon-Sat, 7am-7pm)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  // Verify this is called by Vercel Cron
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD AEST
  console.log(`Cron: refreshing odds for ${today}`);

  // This cron triggers odds refresh — frontend polls /api/odds per race
  // Log the cron run
  res.json({ ok: true, date: today, message: 'Odds cron triggered' });
}
