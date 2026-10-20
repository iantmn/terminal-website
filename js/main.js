// the entry point: load every command, build the filesystem, then boot
import { store, state, fromHash } from './core.js';
import { C } from './registry.js';
import { unlock } from './achievements.js';
import { initRoot } from './filesystem.js';
import { startFeed } from './feed.js';
import { recordVisit } from './visits.js';
import { startGlitch, defaultTheme } from './themes.js';
import { powerScreen, boot } from './boot.js';
import { run } from './input.js';
// command modules only register themselves; the order sets the order within each help section
import './commands/system.js';
import './commands/me.js';
import './commands/nav.js';
import './commands/fun.js';
import './commands/linux.js';
import './commands/python.js';
import './commands/qr.js';
import './commands/guestbook.js';

// after every command is defined, so /usr/bin can list them
initRoot();

document.body.dataset.theme = store.get('theme', defaultTheme());
if (document.body.dataset.theme === 'corrupt') startGlitch();
if (store.get('crt', false)) document.body.classList.add('crt');
startFeed();
recordVisit();

// #ls+-la runs ls -la. Older links used - and _ for spaces (#cowsay-hi); those still work when the first word is no command
function linkedCommand() {
  let c = fromHash(location.hash);
  const first = s => s.split(' ')[0].toLowerCase();
  if (c && !C[first(c)] && C[c.split(/[-_]/)[0].toLowerCase()]) c = c.replace(/[-_]/g, ' ');
  return c;
}
const runLinked = () => { const c = linkedCommand(); if (c && !state.busy) { unlock('deeplink'); run(c); } };

powerScreen().then(boot).then(() => {
  runLinked();
  // a new hash typed in the address bar runs too
  addEventListener('hashchange', runLinked);
});
