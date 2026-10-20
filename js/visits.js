// your visits, for last, who and finger. Kept in this browser only; a reload in the same tab is the same visit
import { store } from './core.js';

const KEY = 'visits';
// the local date, so a visit at 00:30 counts for that day
const day = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const visits = store.get(KEY, null) || { first: Date.now(), count: 0, logins: [], days: [] };
let current = null;

export function recordVisit() {
  let same = false;
  try { same = sessionStorage.getItem('iterm.visit') === '1'; sessionStorage.setItem('iterm.visit', '1'); } catch {}
  if (same && visits.logins.length) current = visits.logins.at(-1);
  else {
    visits.count++;
    current = { start: Date.now(), end: null };
    visits.logins.push(current);
    visits.logins = visits.logins.slice(-10);
  }
  current.end = null;
  if (!visits.days.includes(day(Date.now()))) visits.days = [...visits.days, day(Date.now())].slice(-400);
  store.set(KEY, visits);
  // the end of the visit, for the duration in last
  addEventListener('pagehide', () => { current.end = Date.now(); store.set(KEY, visits); });
}
export const currentLogin = () => current;

// days in a row, counting back from today
export function streak() {
  const set = new Set(visits.days);
  let n = 0;
  for (let d = new Date(); set.has(day(d)); d.setDate(d.getDate() - 1)) n++;
  return n;
}
