// api/results.js — race.com.au results scraper
// Vercel serverless function — called every 3 mins during race day

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { venue, race, date } = req.query;

  try {
    // Check Supabase cache first
    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/results?venue=eq.${encodeURIComponent(venue)}&race_num=eq.${race}&race_date=eq.${date}&select=*`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const cached = await cacheRes.json();
    if (cached && cached.length > 0 && cached[0].winner) {
      return res.json({ source: 'cache', result: cached[0] });
    }

    // Scrape race.com.au
    const result = await scrapeRaceResult(venue, race, date);
    if (!result || !result.winner) {
      return res.json({ source: 'none', result: null, message: 'Race not yet complete' });
    }

    // Store in Supabase
    const row = {
      venue, race_num: parseInt(race), race_date: date,
      winner: result.winner, second: result.second, third: result.third,
      winner_sp: result.sp, winner_margin: result.margin,
      race_name: result.raceName, track_condition: result.condition,
      scraped_at: new Date().toISOString()
    };

    await fetch(`${SUPABASE_URL}/rest/v1/results`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });

    return res.json({ source: 'scraped', result: row });

  } catch (err) {
    console.error('Results error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function scrapeRaceResult(venue, race, date) {
  // race.com.au results page
  // URL format: race.com.au/results/today
  // They have a JSON API endpoint used by their own frontend

  const venueSlug = venue.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Format date as YYYYMMDD for race.com.au
  const dateFormatted = date.replace(/-/g, '');

  try {
    // Try race.com.au internal API
    const url = `https://race.com.au/api/results?venue=${encodeURIComponent(venue)}&race=${race}&date=${date}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://race.com.au/'
      }
    });

    if (r.ok) {
      const data = await r.json();
      if (data && data.runners) {
        const sorted = data.runners.sort((a,b) => (a.finishPosition||99)-(b.finishPosition||99));
        return {
          winner: sorted[0]?.name,
          second: sorted[1]?.name,
          third: sorted[2]?.name,
          sp: sorted[0]?.sp,
          margin: sorted[1]?.margin,
          raceName: data.raceName,
          condition: data.trackCondition
        };
      }
    }

    // Fallback: scrape Racing Australia results API
    return await scrapeRacingAustralia(venue, race, date);

  } catch (e) {
    return await scrapeRacingAustralia(venue, race, date);
  }
}

async function scrapeRacingAustralia(venue, race, date) {
  try {
    // Racing Australia has a public results feed
    const url = `https://racingaustralia.horse/FreeFields/Results_Calendar.aspx?State=QLD&DateFrom=${date}&DateTo=${date}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
    });
    if (!r.ok) return null;

    const html = await r.text();
    // Parse the HTML for results - basic regex extraction
    const venuePattern = new RegExp(venue.replace(/\s+/g,'\\s*'), 'i');
    if (!venuePattern.test(html)) return null;

    // Extract winner from HTML - look for "1st" position markers
    const winnerMatch = html.match(/1st[^>]*>([^<]+)</i);
    if (!winnerMatch) return null;

    return {
      winner: winnerMatch[1].trim(),
      second: null, third: null,
      sp: null, margin: null
    };
  } catch (e) {
    return null;
  }
}
