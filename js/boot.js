import { unlocked, unlock, ACH } from './achievements.js';
import { PROFILE } from './content.js';
import { out, inrow, state, print, span, cmd, link, sleep, renderPrompt, focusInput, HOME } from './core.js';
import { season } from './season.js';
import { bootSound, soundOn, setSound, resumeAudio } from './sound.js';
import { banner } from './visuals.js';

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
  try {
    // give the power-on, fan and POST beep a moment before the boot lines start
    print(span('m', 'IanOS is starting...')); await sleep(900);
    for (const l of lines) { bootSound('tick'); print(l.replace('OK', span('a', 'OK')).replace(/^\[/, span('m','[')).replace(/^(<span class="m">\[<\/span>.*?)\]/, '$1' + span('m',']'))); await sleep(380); }
    await sleep(250);
  } catch {}
  const nightOwl = new Date().getHours() < 6;
  if (nightOwl) print(span('m', '[') + span('w', ' WARN ') + span('m', ']') + ' Night owl detected, brewing extra coffee');
  print('');
  banner();
  bootSound('done');
  print('');
  print(`Welcome! Type ${cmd('help')} or click one of the commands to get started.`);
  print(`Try: ${cmd('about')}  ${cmd('experience')}  ${cmd('projects')}  ${cmd('articles')}  ${cmd('skills')}  ${cmd('contact')}  ${cmd('ls')}`);
  print(span('m', 'Source code: ') + link(PROFILE.repo) + span('m', ' (') + cmd('repo') + span('m', ')'));
  const sn = season();
  if (sn) print(span('w', sn.msg));
  if (sn && sn.theme && document.body.dataset.theme === 'default') document.body.dataset.theme = sn.theme;
  if (unlocked.size) print(span('m', `Welcome back - you've found ${unlocked.size}/${Object.keys(ACH).length} `) + cmd('achievements') + span('m', '.'));
  print('');
  if (nightOwl) unlock('nightowl');
  state.busy = false; inrow.style.visibility = ''; renderPrompt(); focusInput();
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
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === 'keydown' && e.key.toLowerCase() === 'm') setSound(false);
      removeEventListener('keydown', go, true); removeEventListener('pointerdown', go, true);
      try { if (soundOn) resumeAudio(); } catch {}
      resolve();
    };
    addEventListener('keydown', go, true); addEventListener('pointerdown', go, true);
  });
}
