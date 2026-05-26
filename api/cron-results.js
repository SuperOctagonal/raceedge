// api/cron-results.js — Vercel Cron Job: check for new race results
// Runs every 3 mins: "*/3 * * * *"

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`Cron: checking results for ${today}`);

  // Results are fetched on-demand via /api/results
  // This cron can be used to proactively scrape all meetings
  res.json({ ok: true, date: today });
}
