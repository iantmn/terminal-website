// the entry point: load every command, build the filesystem, then boot
import { store } from './core.js';
import { unlock } from './achievements.js';
import { initRoot } from './filesystem.js';
import { startFeed } from './feed.js';
import { startGlitch } from './themes.js';
import { powerScreen, boot } from './boot.js';
import { run } from './input.js';
// command modules only register themselves; the order sets the order within each help section
import './commands/system.js';
import './commands/me.js';
import './commands/nav.js';
import './commands/fun.js';
import './commands/linux.js';

// after every command is defined, so /usr/bin can list them
initRoot();

document.body.dataset.theme = store.get('theme', 'default');
if (document.body.dataset.theme === 'corrupt') startGlitch();
if (store.get('crt', false)) document.body.classList.add('crt');
startFeed();

powerScreen().then(boot).then(() => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h) { unlock('deeplink'); run(h.replace(/[-_+]/g, ' ')); }
});
