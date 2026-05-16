// Vercel serverless function — proxies TAB API server-side (no CORS issues)
// Deployed at: https://project-hbjpu.vercel.app/api/odds?venue=DOOMBEN&race=5&date=2026-05-16&jur=QLD

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { venue, race, date, jur } = req.query;
  if (!date || !jur) {
    return res.status(400).json({ error: 'Missing params: date, jur required' });
  }

  try {
    // Step 1: Get meetings
    const meetingsUrl = `https://api.tab.com.au/v1/tab-info-service/racing/dates/${date}/meetings?jurisdiction=${jur}`;
    const m = await fetch(meetingsUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Origin': 'https://www.tab.com.au',
        'Referer': 'https://www.tab.com.au/'
      }
    });
    if (!m.ok) return res.status(m.status).json({ error: `TAB meetings ${m.status}` });
    const mData = await m.json();

    // Step 2: Find meeting
    const meetings = mData.meetings || [];
    const venueUpper = (venue || '').toUpperCase();
    const meeting = meetings.find(x =>
      x.meetingName?.toUpperCase() === venueUpper ||
      x.meetingName?.toUpperCase().includes(venueUpper.split(' ')[0]) ||
      x.venueMnemonic?.toUpperCase() === venueUpper.substring(0, 4)
    );
    if (!meeting) return res.status(404).json({ error: `Venue not found: ${venue}`, available: meetings.map(x=>x.meetingName) });

    // Step 3: Find race
    const raceObj = meeting.races?.find(r => String(r.raceNumber) === String(race));
    if (!raceObj?.raceLink) return res.status(404).json({ error: `Race ${race} not found` });

    // Step 4: Get runners + odds
    const raceUrl = `https://api.tab.com.au${raceObj.raceLink}?jurisdiction=${jur}`;
    const r = await fetch(raceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json', 
        'Origin': 'https://www.tab.com.au',
        'Referer': 'https://www.tab.com.au/'
      }
    });
    if (!r.ok) return res.status(r.status).json({ error: `TAB race ${r.status}` });
    const rData = await r.json();

    // Return clean runner odds
    const runners = (rData.runners || []).map(runner => ({
      name: runner.runnerName,
      tabNo: runner.tabNo,
      scratched: runner.scratched || runner.isScratched || false,
      win: parseFloat(runner.parimutuel?.returnWin || runner.fixedOdds?.returnWin || 0),
      place: parseFloat(runner.parimutuel?.returnPlace || runner.fixedOdds?.returnPlace || 0)
    }));

    res.status(200).json({ runners, raceLink: raceObj.raceLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
