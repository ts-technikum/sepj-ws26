// Anfragelimit für /api/generate. Schützt vor hohen API-Kosten, wenn die
// Instanz öffentlich erreichbar ist. Zwei Grenzen:
//   perMinute: Anfragen pro IP-Adresse und Minute
//   perDay:    Anfragen insgesamt pro Kalendertag (UTC), über alle Nutzer
// Der Zustand liegt im Speicher und beginnt bei jedem Neustart von vorn.
// Für eine Uni-Demo mit einer Instanz reicht das.

export function createRateLimiter({ perMinute = 10, perDay = 300, now = Date.now } = {}) {
  const perIp = new Map();
  let day = '';
  let dayCount = 0;

  return function check(ip) {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if (today !== day) { day = today; dayCount = 0; }

    if (perDay > 0 && dayCount >= perDay) {
      const midnight = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
      return { ok: false, scope: 'day', retryAfterS: Math.ceil((midnight - t) / 1000) };
    }

    const minute = Math.floor(t / 60_000);
    const entry = perIp.get(ip);
    if (!entry || entry.minute !== minute) {
      perIp.set(ip, { minute, count: 0 });
      if (perIp.size > 10_000) for (const [k, v] of perIp) if (v.minute !== minute) perIp.delete(k);
    }
    const current = perIp.get(ip);
    if (perMinute > 0 && current.count >= perMinute) {
      return { ok: false, scope: 'minute', retryAfterS: 60 - Math.floor((t % 60_000) / 1000) };
    }
    current.count++;
    dayCount++;
    return { ok: true };
  };
}
