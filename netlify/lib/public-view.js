const crypto = require('crypto');
const TTL = 30 * 24 * 60 * 60;
function signature(name, expires, secret) {
  return crypto.createHmac('sha256', secret).update(`schedule-view:v2:${name}:${expires}`).digest('hex');
}
exports.makeViewToken = (name, secret) => {
  const expires = Math.floor(Date.now() / 1000) + TTL;
  return `${expires}.${signature(name, expires, secret)}`;
};
exports.isAuthorizedView = (name, token, secret) => {
  if (!secret || typeof token !== 'string') return false;
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const now = Math.floor(Date.now() / 1000), expires = Number(match[1]);
  if (expires <= now || expires > now + TTL) return false;
  return crypto.timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(signature(name, expires, secret), 'hex'));
};
// Allow only fields actually rendered by ScheduleReadView. Never spread a
// private document: contacts, call sheets, internal status and future fields
// must not leak just because the browser doesn't render them.
function pick(value, keys) {
  const result = {};
  for (const key of keys.split(' ')) {
    const item = value?.[key];
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) result[key] = item;
  }
  return result;
}
exports.publicSchedule = data => ({
  meta: {
    ...pick(data.meta, 'town date prod dir dp projectName phase dayNumber totalDays'),
    wx: data.meta?.wx ? pick(data.meta.wx, 'sunrise sunset maxF minF prec code cond fetchedAt noForecast') : null,
  },
  rows: (Array.isArray(data.rows) ? data.rows : []).filter(row => row && (row.action || row.timeIn)).map(row => ({
    ...pick(row, 'action otherText desc loc locLat locLng locName locAddress notes timeIn dur sunLocked fixedOut fixedOutTime'),
    ...(Array.isArray(row.subLocations) ? { subLocations: row.subLocations.map(item => pick(item, 'id loc locLat locLng desc name address')) } : {}),
  })),
});
