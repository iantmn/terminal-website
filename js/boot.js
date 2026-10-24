import { unlocked, unlock, ACH, activeSeasonal } from './achievements.js';
import { PROFILE } from './content.js';
import { out, inrow, state, store, print, span, esc, cmd, link, sleep, renderPrompt, focusInput, HOME } from './core.js';
import { visits } from './visits.js';
import { dayMessage } from './days.js';
import { bootSound, soundOn, setSound, resumeAudio } from './sound.js';
import { banner } from './visuals.js';
import { defaultTheme, applyTheme } from './themes.js';
import { runBashrc } from './commands/tools.js';

// ---- boot ----
export async function boot() {
  out.innerHTML = ''; state.cwd = [...HOME]; renderPrompt();
  state.busy = true; inrow.style.visibility = 'hidden';
  // the boot lines always show, so they match the startup sound (browsers often allow it again after a reload)
  bootSound('start');
  const lines = [
    '[  OK  ] Started coffee.service',
    '[  OK  ] Mounted /home/guest/experience',
    '[  OK  ] Reached target curiosity.target',
    '[  OK  ] Started terminal.iantiemann.nl',
  ];
  // the whole show the first time; a returning visitor, or a link that runs a command, gets it quicker. A key or a
  // tap skips the rest
  const quick = visits.count > 1 || !!location.hash, pace = quick ? 0.35 : 1;
  let skip = null;
  const skipped = new Promise(r => { skip = r; });
  const onSkip = e => { if (!e.key || !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) skip(); };
  addEventListener('keydown', onSkip); addEventListener('pointerdown', onSkip);
  // a skipped wait still finishes in the background: Ctrl+C there should not become an error nobody catches
  const wait = ms => Promise.race([sleep(ms * pace).catch(() => {}), skipped]);
  try {
    // give the power-on, fan and POST beep a moment before the boot lines start
    print(span('m', 'IanOS is starting...')); await wait(900);
    for (const l of lines) { bootSound('tick'); print(l.replace('OK', span('a', 'OK')).replace(/^\[/, span('m','[')).replace(/^(<span class="m">\[<\/span>.*?)\]/, '$1' + span('m',']'))); await wait(380); }
    await wait(250);
  } catch {}
  removeEventListener('keydown', onSkip); removeEventListener('pointerdown', onSkip);
  const nightOwl = new Date().getHours() < 6;
  if (nightOwl) print(span('m', '[') + span('w', ' WARN ') + span('m', ']') + ' Night owl detected, brewing extra coffee');
  print('');
  banner();
  bootSound('done');
  print('');
  print(`Welcome! Type ${cmd('help')} or click one of the commands to get started.`);
  print(`Try: ${cmd('about')}  ${cmd('experience')}  ${cmd('projects')}  ${cmd('articles')}  ${cmd('skills')}  ${cmd('contact')}  ${cmd('ls')}`);
  print(span('m', 'Source code: ') + link(PROFILE.repo) + span('m', ' (') + cmd('repo') + span('m', ')'));
  if (!navigator.onLine) print(span('w', 'You are offline.') + span('m', ' The terminal runs from its cache; the feed, read -f and changelog need the internet.'));
  // the first visit: a hand for people who never used a terminal
  if (visits.count <= 1 && !store.get('learn', {}).done) print(span('w', 'New to terminals? ') + cmd('learn') + span('w', ' gives you a two-minute tour.'));
  const sn = dayMessage();
  // today's message and the achievement count get their own block
  if (sn || unlocked.size || activeSeasonal().length) print('');
  if (sn) print(span('w', sn.msg));
  if (sn && sn.theme && document.body.dataset.theme === defaultTheme()) applyTheme(sn.theme);
  if (unlocked.size) print(span('m', `Welcome back - you've found ${unlocked.size}/${Object.keys(ACH).length} `) + cmd('achievements') + span('m', '.'));
  seasonalNotice();
  print('');
  if (nightOwl) unlock('nightowl');
  state.busy = false; inrow.style.visibility = ''; renderPrompt(); focusInput();
  // and then whatever you put in ~/.bashrc
  await runBashrc();
}

// a seasonal achievement that can only be found today: the boot says so, with its hint (never the answer)
export function seasonalNotice() {
  for (const id of activeSeasonal()) {
    if (unlocked.has(id)) print(span('m', `🎁 Today's seasonal achievement, ${ACH[id][0]}: you already have it.`));
    else print(span('w', `🎁 Only today: a seasonal achievement. `) + span('m', esc(ACH[id][1]) + ' ') + cmd('achievements'));
  }
}

// browsers only allow sound after a click or key press, so ask for one before the first boot
export function powerScreen() {
  const allowed = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (!soundOn || allowed) return Promise.resolve();
  state.busy = true; inrow.style.visibility = 'hidden';
  out.innerHTML = '';
  print(`<div class="power">
    <span class="banner">IanOS</span>
    <span class="m">terminal.iantiemann.nl</span>
    <button type="button">Press any key to power on</button>
    <span class="m">or tap anywhere · press M to start without sound</span>
  </div>`);
  return new Promise(resolve => {
    const go = e => {
      // modifier keys, browser shortcuts (Ctrl+Shift+I, Ctrl+R) and F keys do not power on
      if (e.type === 'keydown' && (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key))) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === 'keydown' && e.key.toLowerCase() === 'm') setSound(false);
      removeEventListener('keydown', go, true); removeEventListener('pointerdown', go, true);
      try { if (soundOn) resumeAudio(); } catch {}
      resolve();
    };
    addEventListener('keydown', go, true); addEventListener('pointerdown', go, true);
  });
}
