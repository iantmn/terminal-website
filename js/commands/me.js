// about Ian: experience, education, skills, posts
import { unlock } from '../achievements.js';
import { EXPERIENCE, EDUCATION, CERTS, POSTS, PROFILE } from '../content.js';
import { print, printLines, span, esc, cmd, pad, kv, sleep, state } from '../core.js';
import { refreshFeed, feedReady } from '../feed.js';
import { def } from '../registry.js';
import { aboutLines, fmtExp, fmtEdu, skillLines, fmtPost, cvLines, contactLines, findPost, postChoices } from '../render.js';

function parseUA() {
  const u = navigator.userAgent;
  const browsers = [['Edge', /Edg(?:iOS|A)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]];
  const oses = [['iOS', /iPhone|iPod/], ['iPadOS', /iPad/], ['Android', /Android/], ['Windows', /Windows/],
    ['ChromeOS', /CrOS/], ['macOS', /Mac OS X/], ['Linux', /Linux/]];
  let browser = 'Unknown', os = 'Unknown';
  for (const [n, re] of browsers) { const m = re.exec(u); if (m) { browser = `${n} ${m[1]}`; break; } }
  for (const [n, re] of oses) if (re.test(u)) { os = n; break; }
  if (os === 'macOS' && navigator.maxTouchPoints > 1) os = 'iPadOS';
  const device = /Mobi/.test(u) ? 'mobile' : navigator.maxTouchPoints > 0 ? 'touch device' : 'desktop';
  return { browser, os, device };
}

def('whoami', 'me', 'what I can see about you', () => {
  if (state.asRoot) return print('root' + span('m', ' (just for this command)'));
  unlock('whoami');
  const ua = parseUA(), conn = navigator.connection;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const off = -new Date().getTimezoneOffset();
  const utc = `UTC${off >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`;

  print(span('u', 'guest') + span('m', ', this is what your browser tells me:'));
  print('');
  print(span('w b', 'Your browser'));
  print(kv([
    ['Browser', ua.browser],
    ['OS', `${ua.os} (${ua.device})`],
    ['Languages', (navigator.languages || [navigator.language]).join(', ')],
    ['Timezone', `${tz} (${utc})`],
    ['Local time', new Date().toLocaleString()],
    ['Screen', `${screen.width}×${screen.height} @${devicePixelRatio}x · window ${innerWidth}×${innerHeight}`],
    ['Colour scheme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'],
    navigator.hardwareConcurrency ? ['CPU cores', String(navigator.hardwareConcurrency)] : null,
    navigator.deviceMemory ? ['Memory', `≥ ${navigator.deviceMemory} GB`] : null,
    conn && conn.effectiveType ? ['Network', conn.effectiveType + (conn.downlink ? ` · ~${conn.downlink} Mbps` : '')] : null,
    ['Do Not Track', navigator.doNotTrack === '1' || navigator.globalPrivacyControl ? 'on' : 'off'],
    ['Referrer', document.referrer || '(direct visit)'],
  ].filter(Boolean)));

  print('');
  print(span('m', 'This is what your browser tells every website you visit.'));
  print(span('m', `And me? I'm Ian → `) + cmd('about'));
});

def(['about', 'ian', 'bio'], 'me', 'who is Ian?', () => printLines(aboutLines()));

def(['experience', 'exp', 'work', 'jobs'], 'me', 'work experience', args => {
  const n = parseInt(args[0], 10);
  if (n && EXPERIENCE[n - 1]) return printLines(fmtExp(EXPERIENCE[n - 1]));
  print(span('m', `${new Date().getFullYear() - 2016}+ years in IT, from support engineer to project engineer.`));
  print('');
  EXPERIENCE.forEach((e, i) => {
    print(`${span('m', pad(e.period, 12))} ${span('a b', esc(e.role))} ${span('m','@')} ${span('h', esc(e.org))} ${span('m', '· ' + esc(e.place))}`);
    print(`${' '.repeat(13)}${span('m', esc(e.text.length > 110 ? e.text.slice(0, 107) + '...' : e.text))} ${cmd('exp ' + (i + 1), '[more]')}`);
  });
}, { usage: '[n]', flags: [['n', 'the full story of job n']] });

def(['education', 'edu', 'school'], 'me', 'education', args => {
  const n = parseInt(args[0], 10);
  if (n && EDUCATION[n - 1]) return printLines(fmtEdu(EDUCATION[n - 1]));
  EDUCATION.forEach((e, i) => {
    print(`${span('m', pad(e.year, 6))} ${span('a b', esc(e.title))}`);
    print(`${' '.repeat(7)}${span('h', esc(e.org))} ${span('m', '· ' + esc(e.place))} ${cmd('edu ' + (i + 1), '[more]')}`);
  });
  print('');
  print(span('m', 'Also see ') + cmd('certs') + span('m', ' for courses and certificates.'));
}, { usage: '[n]', flags: [['n', 'the details of study n']] });

def(['certs', 'courses'], 'me', 'courses & certificates', () =>
  CERTS.forEach(([y, t]) => print(`${span('m', y)}  ${esc(t)}`)));

def('skills', 'me', 'skills & tools', args =>
  printLines(skillLines(/^(-a|--all)$/.test(args[0] || '') ? 'all' : parseInt(args[0], 10))), { usage: '[n|-a]', flags: [['n', 'one category in detail'], ['-a, --all', 'every category']] });

const listPosts = type => {
  const list = POSTS.filter(p => p.type === type);
  list.forEach(p => print(`${span('m', `[${String(p.n).padStart(2, ' ')}]`)} ${span('m', p.date)}  ${p.icon} <a class="cmd" data-cmd="read ${p.n}">${esc(p.title)}</a>`));
  print('');
  print(span('m', 'Type ') + span('a2', 'read &lt;n&gt;') + span('m', ' for a summary or ') + span('a2', 'open &lt;n&gt;') + span('m', ' to open the full post.'));
};
def(['articles', 'blog', 'guides', 'posts'], 'me', 'technical guides I wrote', async args => {
  if (args[0] === '--refresh') {
    print(span('m', 'fetching ' + PROFILE.rss + ' ...'));
    const n = await refreshFeed();
    print(n < 0 ? span('e', 'feed unreachable - showing built-in list') : span('a', `${n} new post(s) loaded`));
  }
  await feedReady;
  listPosts('guide');
}, { flags: [['--refresh', 'fetch new posts from the RSS feed first']] });
def(['projects', 'portfolio'], 'me', 'projects I worked on', async () => { await feedReady; listPosts('project'); });

def(['read', 'summary'], 'me', 'summary of a post', async args => {
  await feedReady;
  const { post, list } = findPost(args);
  if (list) return printLines(postChoices(list, 'read'));
  if (!post) return print(span('e', args.length ? `read: no post matches '${esc(args.join(' '))}'` : 'usage: read &lt;n|name&gt;') + span('m', '  (see ') + cmd('articles') + span('m', ' or ') + cmd('projects') + span('m', ')'));
  printLines(fmtPost(post));
}, { usage: '<n|name>', flags: [['n', 'the number from articles or projects'], ['name', 'words from the title, like read traefik']] });

def(['cv', 'resume'], 'me', 'my CV', () => printLines(cvLines()));
def(['contact', 'socials', 'social'], 'me', 'how to reach me', () => printLines(contactLines()));
def(['talk', 'hire', 'chat'], null, '', () => {
  unlock('talk');
  printLines([
    "I'm not really looking for a new job right now, but I'm always happy to talk.",
    'Tech, projects, homelabs, ideas, or just a coffee. Send me a message:',
    '',
    `  ${cmd('linkedin')}   ${cmd('contact')}`,
  ]);
});

def('cloudmodule', 'me', 'peek at the product I work on', async () => {
  print(span('a b', 'CloudModule') + span('m', ' · status page · illustrative demo data, not a live feed'));
  print(span('m', 'A networking appliance that gives businesses secure connectivity and cloud services. I lead its product development at NetW.'));
  print('');
  ['Secure connectivity', 'Cloud services', 'Remote management', 'Monitoring', 'Updates'].forEach(c => {
    const bar = Array.from({ length: 30 }, () => Math.random() < .04 ? span('w', '▮') : span('a', '▮')).join('');
    print(`${span('a', '●')} ${esc(pad(c, 20))} ${bar}  ${span('m', 'operational')}`);
  });
  print(span('m', `${' '.repeat(23)}30 days ago${' '.repeat(13)}today`));
  print('');
  print(span('w b', 'Live log'));
  const events = ['heartbeat ok', 'tunnel re-keyed', 'config backup stored', 'health check passed', 'update channel: stable, nothing to install', 'metrics shipped to monitoring'];
  for (let i = 0; i < 6; i++) {
    await sleep(450);
    print(`${span('m', new Date().toLocaleTimeString())}  module-${Math.floor(Math.random() * 90 + 10)}  ${esc(events[Math.floor(Math.random() * events.length)])}`);
  }
  print('');
  print(span('m', 'More about this role: ') + cmd('exp 1'));
});
