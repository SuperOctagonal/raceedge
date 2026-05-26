// api/odds.js — Sportsbet live odds scraper
// Vercel serverless function — called by frontend every 5 mins on race day

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { venue, race, date } = req.query;
  if (!venue || !race || !date) {
    return res.status(400).json({ error: 'venue, race, date required' });
  }

  try {
    // Try to get cached odds from Supabase first (< 3 mins old)
    const cacheRes = await fetch(
      `${SUPABASE_URL}/rest/v1/live_odds?venue=eq.${encodeURIComponent(venue)}&race_num=eq.${race}&race_date=eq.${date}&updated_at=gt.${new Date(Date.now()-180000).toISOString()}&select=horse_name,win_odds,place_odds,updated_at`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const cached = await cacheRes.json();
    if (cached && cached.length > 0) {
      return res.json({ source: 'cache', odds: cached, updated_at: cached[0].updated_at });
    }

    // Fetch fresh from Sportsbet
    const sbOdds = await fetchSportsbetOdds(venue, race, date);
    if (!sbOdds || !sbOdds.length) {
      return res.json({ source: 'none', odds: [], message: 'No odds available yet' });
    }

    // Upsert into Supabase
    const now = new Date().toISOString();
    const rows = sbOdds.map(o => ({
      venue, race_num: parseInt(race), race_date: date,
      horse_name: o.name, win_odds: o.win, place_odds: o.place,
      source: 'sportsbet', updated_at: now
    }));

    await fetch(`${SUPABASE_URL}/rest/v1/live_odds`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });

    return res.json({ source: 'sportsbet', odds: sbOdds, updated_at: now });

  } catch (err) {
    console.error('Odds error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function fetchSportsbetOdds(venue, race, date) {
  // Sportsbet public racing API - no auth required
  // Format: YYYY-MM-DD
  const dateStr = date; // expects YYYY-MM-DD
  const venueSlug = venue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const url = `https://www.sportsbet.com.au/racing/thoroughbreds/${venueSlug}/${dateStr}/race-${race}`;

  try {
    // Use their internal API endpoint
    const apiUrl = `https://www.sportsbet.com.au/api/racing/racing-app/events?venueExternalId=${venueSlug}&raceNumber=${race}&raceDate=${dateStr}&racingCode=R`;
    const r = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.sportsbet.com.au/'
      }
    });

    if (!r.ok) {
      // Try alternate endpoint
      return await fetchSportsbetAlt(venue, race, date);
    }

    const data = await r.json();
    if (!data || !data.runners) return null;

    return data.runners.map(runner => ({
      name: runner.runnerName || runner.name,
      tab: runner.runnerNumber || runner.tabNumber,
      win: runner.winOdds || runner.fixedWin,
      place: runner.placeOdds || runner.fixedPlace
    })).filter(r => r.name && r.win);

  } catch (e) {
    return await fetchSportsbetAlt(venue, race, date);
  }
}

async function fetchSportsbetAlt(venue, race, date) {
  // Alternate: try Ladbrokes public API
  try {
    const venueCode = venue.toUpperCase().replace(/\s+/g,'').substring(0,4);
    const url = `https://api.ladbrokes.com.au/v1/racing/races?venue=${encodeURIComponent(venue)}&raceNumber=${race}&date=${date}&code=R`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.runners) return null;
    return data.runners.map(runner => ({
      name: runner.name,
      tab: runner.runnerNumber,
      win: runner.winOdds,
      place: runner.placeOdds
    })).filter(r => r.name && r.win);
  } catch (e) {
    return null;
  }
}
