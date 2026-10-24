// a reload is not a reboot: the folder you are in, /tmp, your variables and the machine you are logged in to
// come back. In sessionStorage, so it is only this tab; reboot (and the site going down) starts clean
import { state, print, span, inrow, renderPrompt, focusInput } from './core.js';
import { resolve, exportTmp, importTmp, clearTmp } from './filesystem.js';
import { vars } from './shell.js';
import { exportLab, importLab } from './commands/labstate.js';

const KEY = 'iterm.session';
// the homelab and the cluster have a key of their own: rebooting this terminal does not reset those machines
const LAB_KEY = 'iterm.lab';
let resuming = false;
export function saveSession() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ host: state.host, cwd: state.cwd, tmp: exportTmp(), vars })); } catch {}
  try { sessionStorage.setItem(LAB_KEY, JSON.stringify(exportLab())); } catch {}
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
  try { importLab(JSON.parse(sessionStorage.getItem(LAB_KEY) || 'null')); } catch {}
  if (!s || resuming) return;
  resuming = true;
  importTmp(s.tmp);
  if (s.vars && typeof s.vars === 'object') for (const [k, v] of Object.entries(s.vars)) if (/^[A-Za-z_]\w*$/.test(k) && typeof v === 'string') vars[k] = v;
  const cwd = Array.isArray(s.cwd) && s.cwd.every(x => typeof x === 'string') ? s.cwd : null;
  if (!['homelab', 'pve1', 'pve2', 'pve3', 'pbs'].includes(s.host)) {
    if (cwd && !resolve('/' + cwd.join('/')).error) { state.cwd = cwd; renderPrompt(); }
    return;
  }
  // you were on the homelab, or further on the cluster or pbs: log back in, and stand where you stood
  print(span('m', `Reloaded. Reconnecting to ${s.host} ...`));
  const { labSession } = await import('./commands/homelab.js');
  await labSession({ host: s.host, cwd });
  state.busy = false; inrow.style.visibility = ''; renderPrompt(); focusInput();
}
