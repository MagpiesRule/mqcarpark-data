// "Is anything really counting?" check for Macquarie University car parks.
//
// Runs every 15 minutes, around the clock. Each run takes one reading from
// https://vpermit.com.au/parkavail/mq and adds it to a rolling 24-hour record
// for every car park, kept in reliability.json.
//
// Rule (no time-of-day assumptions):
//   counting       its number changed at least MIN_CHANGES times in the last 24 hours
//   no-real-count  watched for a full 24 hours with fewer changes than that
//                  (a number that never moves, sits at 0, jumps once, or is blank)
//   watching       first seen less than 24 hours ago and not yet counting
// A flag clears on the first run where the rolling 24 hours reaches MIN_CHANGES.
//
// Usage: node check.js [path/to/reliability.json]

const fs = require('fs');

const SOURCE_URL = 'https://vpermit.com.au/parkavail/mq';
const WINDOW_HOURS = 24;
const MIN_CHANGES = 3;
const FILE = process.argv[2] || 'reliability.json';
const H = 3600 * 1000;

const decode = (s) => s
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function parse(html) {
  const values = {};
  const row = /<td[^>]*class=["']?zone["']?[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["']?casual["']?[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = row.exec(html)) !== null) {
    const name = decode(m[1]);
    const raw = decode(m[2]);
    if (name) values[name] = /^\d+$/.test(raw) ? Number(raw) : null;
  }
  return values;
}

// Add one reading taken at nowIso and re-judge every car park.
function update(prev, values, nowIso) {
  const now = Date.parse(nowIso);
  const cutoff = now - WINDOW_HOURS * H;
  const counters = {};
  for (const [name, value] of Object.entries(values)) {
    const p = (prev.counters && prev.counters[name]) || {};
    // readings: [[isoTime, value], ...] within the window, plus the last one before it
    // so a change right at the window edge is still counted.
    let readings = [...(p.readings || []), [nowIso, value]];
    const firstInside = readings.findIndex(([t]) => Date.parse(t) >= cutoff);
    if (firstInside > 0) readings = readings.slice(firstInside - 1);

    let changes = 0;
    let lastChangeAt = p.lastChangeAt || null;
    for (let i = 1; i < readings.length; i++) {
      if (readings[i][1] !== readings[i - 1][1]) {
        if (Date.parse(readings[i][0]) >= cutoff) changes++;
        lastChangeAt = readings[i][0];
      }
    }
    const firstSeenAt = p.firstSeenAt || nowIso;
    const watchedHours = (now - Date.parse(firstSeenAt)) / H;

    let status;
    if (changes >= MIN_CHANGES) status = 'counting';
    else if (watchedHours >= WINDOW_HOURS) status = 'no-real-count';
    else status = 'watching';

    const nums = readings.filter(([t]) => Date.parse(t) >= cutoff).map(([, v]) => v);
    let reason;
    if (status === 'counting') reason = `Changed ${changes} times in the last 24 hours`;
    else if (nums.every((v) => v === null)) reason = 'Blank for the last 24 hours';
    else if (changes === 0) reason = `Stayed at ${value} for the last 24 hours`;
    else reason = `Changed only ${changes} time${changes === 1 ? '' : 's'} in the last 24 hours`;
    if (status === 'watching') reason = `Watching: ${changes} of ${MIN_CHANGES} changes seen so far`;

    counters[name] = {
      status,
      reason,
      changes24h: changes,
      readings24h: nums.length,
      lastChangeAt,
      firstSeenAt,
      lastCountingAt: status === 'counting' ? nowIso : (p.lastCountingAt || null),
      noRealCountSince: status === 'no-real-count'
        ? (p.status === 'no-real-count' && p.noRealCountSince ? p.noRealCountSince : nowIso)
        : null,
      readings,
    };
  }
  return {
    source: SOURCE_URL,
    rule: `Counting = number changed at least ${MIN_CHANGES} times in the last ${WINDOW_HOURS} hours (readings every 15 minutes)`,
    updatedAt: nowIso,
    counters,
  };
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'MQCarPark counting check (github.com/MagpiesRule/mqcarpark-data)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`vpermit responded ${res.status}`);
  const values = parse(await res.text());
  if (!Object.keys(values).length) throw new Error('no car park rows found on the vpermit page');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
  const out = update(prev, values, new Date().toISOString());
  fs.writeFileSync(FILE, JSON.stringify(out) + '\n');
  for (const [k, v] of Object.entries(out.counters)) console.log(`${k}: ${v.status} (${v.reason})`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
module.exports = { parse, update, MIN_CHANGES, WINDOW_HOURS };
