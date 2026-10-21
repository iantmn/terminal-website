// a reload is not a reboot: the folder you are in, /tmp, your variables and the machine you are logged in to
// come back. In sessionStorage, so it is only this tab; reboot (and the site going down) starts clean
import { state, print, span, inrow, renderPrompt, focusInput } from './core.js';
import { resolve, exportTmp, importTmp, clearTmp } from './filesystem.js';
import { vars } from './shell.js';

const KEY = 'iterm.session';
let resuming = false;
export function saveSession() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ host: state.host, cwd: state.cwd, tmp: exportTmp(), vars })); } catch {}
}
// a reboot: the tab forgets the session and /tmp is empty again
export function forgetSession() {
  clearTmp();
  for (const k of Object.keys(vars)) delete vars[k];
  try { sessionStorage.removeItem(KEY); } catch {}
}
function saved() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch { return null; }
}
export async function resumeSession() {
  const s = saved();
  addEventListener('pagehide', saveSession);
  if (!s || resuming) return;
  resuming = true;
  importTmp(s.tmp);
  if (s.vars && typeof s.vars === 'object') for (const [k, v] of Object.entries(s.vars)) if (/^[A-Za-z_]\w*$/.test(k) && typeof v === 'string') vars[k] = v;
  const cwd = Array.isArray(s.cwd) && s.cwd.every(x => typeof x === 'string') ? s.cwd : null;
  if (s.host !== 'homelab' && s.host !== 'pve1') {
    if (cwd && !resolve('/' + cwd.join('/')).error) { state.cwd = cwd; renderPrompt(); }
    return;
  }
  // you were on the homelab, or one further on pve: log back in, and stand where you stood
  print(span('m', `Reloaded. Reconnecting to ${s.host} ...`));
  const { labSession } = await import('./commands/homelab.js');
  await labSession({ host: s.host, cwd });
  state.busy = false; inrow.style.visibility = ''; renderPrompt(); focusInput();
}
