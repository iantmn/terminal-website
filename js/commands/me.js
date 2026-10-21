// about Ian: experience, education, skills, posts
import { unlock } from '../achievements.js';
import { ABOUT, EXPERIENCE, EDUCATION, CERTS, POSTS, PROFILE, SKILLS } from '../content.js';
import { print, printLines, span, esc, cmd, pad, kv, sleep, ask, state, inrow, charsPerLine } from '../core.js';
import { refreshFeed, feedReady } from '../feed.js';
import { C, def, completes } from '../registry.js';
import { found } from '../shell.js';
import { DESK, DESK_NOTES } from '../desk.js';
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
  if (state.host !== 'iantiemann') return print(state.user);
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
// tldr: me on one screen, for people with ten minutes and forty tabs. Everything comes from content.js.
// tldr <command> is what the real tldr does: the short version of a command
def('tldr', 'me', 'me in thirty seconds (or tldr <command>)', args => {
  if (args[0]) {
    const c = C[args[0].toLowerCase()];
    if (!c || (!c.group && !found.has(c.name))) { state.failed = true; return print(span('e', `tldr: page not found: ${esc(args[0])}`) + span('m', ' Try ') + cmd('help')); }
    return printLines([span('w b', esc(c.name)), '', span('m', '> ' + esc(c.desc || 'no description, some things you have to try')), '',
      ...[[c.name + (c.usage ? ' ' + c.usage : ''), 'the usage'], ...(c.flags || []).slice(0, 4).map(([f, d]) => [`${c.name} ${f.split(',')[0]}`, d])].flatMap(([ex, d]) => [span('a', '- ') + esc(d[0].toUpperCase() + d.slice(1)) + ':', '  ' + span('a2', esc(ex)), ''])]);
  }
  const fact = k => ABOUT.facts.find(([n]) => n === k)?.[1];
  const goal = ABOUT.sections.find(([t]) => t === 'Where I want to go')?.[1][0] || '';
  const guides = POSTS.filter(p => p.type === 'guide');
  // like kv(), but the values may hold links
  const table = rows => `<div class="tbl">${rows.map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>`;
  printLines([
    span('w b', PROFILE.name) + span('m', ` · ${esc(PROFILE.role)} · ${esc(PROFILE.location)}`), '',
    table([
      ['Now', esc(fact('Now') || PROFILE.role)],
      ['Before', EXPERIENCE.slice(1, 3).map(e => esc(`${e.role} @ ${e.org} (${e.period})`)).join(span('m', ', '))],
      ['In IT since', esc(fact('In IT since') || '')],
      ['Studied', EDUCATION.map(e => esc(`${e.title}, ${e.org}`)).join(span('m', '; '))],
      ['Strong in', SKILLS.slice(0, 6).map(s => esc(s.title)).join(span('m', ', '))],
      ['Next', esc(goal.split(':')[0])],
      ['Writes', `${guides.length} guides, the latest: ` + (guides[0] ? cmd('read ' + guides[0].n, guides[0].title) : '')],
    ]), '',
    span('m', 'The long versions: ') + [cmd('about'), cmd('experience'), cmd('skills'), cmd('cv')].join(span('m', ', ')) + span('m', '. Interested? ') + cmd('contact'),
  ]);
}, { usage: '[command]', flags: [['command', 'the short version of a command, like tldr grep']] });
def(['desk', 'photo'], 'me', 'where the homelab lives (a drawing)', () => {
  // one block, so it can scale down as a whole on a narrow screen instead of wrapping
  print(`<div class="desk">${DESK().join('\n')}</div>`);
  printLines(['', ...DESK_NOTES(), span('m', 'How it all connects: ') + cmd('netmap')]);
});
// interview: five questions, and after each one what Ian would answer. His answers come from the site itself
const section = title => ABOUT.sections.find(([t]) => t === title)?.[1] || [];
const INTERVIEW = [
  ['A client wants a new feature by next week. What do you do first?',
    ['Start building, the deadline is tight', 'Find out what problem it has to solve, and for whom', 'Explain why it cannot be done'], 1,
    () => section('How I work')[0]],
  ['The developers, the designers and the client all want something different.',
    ['Go with whoever is the loudest', 'Get them together and translate between them', 'Write a very long email'], 1,
    () => section('How I work')[1]],
  ['Production goes down at three in the morning.',
    ['Restart everything and hope', 'Read the logs, then fix the cause', 'Blame DNS'], 1,
    () => 'Read the logs first, then fix what caused it, then write down how to stop it happening again. (And yes, sometimes it really is DNS.)'],
  ['Everyone is talking about a new technology.',
    ['Roll it out to every client tomorrow', 'Try it at home first, write it down, then decide', 'Ignore it until it goes away'], 1,
    () => 'Try it in the homelab first and write down what I learn: that is where the guides on my site come from.'],
  ['Where do you want to be in five years?',
    ['Leading a team, R&D or IT', 'Exactly where I am now', 'On a beach, far from any pager'], 0,
    () => section('Where I want to go')[0]],
];
def('interview', 'me', 'five questions, and how Ian would answer them', async () => {
  if (state.capture) return print(span('e', 'interview: that needs answers, not a pipe'));
  printLines([span('w b', '🎤 INTERVIEW') + span('m', ' - five questions. Type a number, q to stop. There are no wrong answers, only mine.'), '']);
  let same = 0;
  for (const [i, [q, opts, ian, why]] of INTERVIEW.entries()) {
    printLines([span('a2', `${i + 1}/${INTERVIEW.length}`) + ' ' + esc(q), ...opts.map((o, j) => `      ${span('a', j + 1 + ')')} ${esc(o)}`)]);
    state.busy = false; inrow.style.visibility = '';
    let pick = null;
    while (pick === null) {
      const a = await ask(span('w', `answer 1-${opts.length} > `));
      if (!a || /^q/i.test(a)) return print(span('m', 'Interview over, early. Fair enough: ') + cmd('contact') + span('m', ' works any time.'));
      const n = parseInt(a, 10) - 1;
      if (opts[n]) pick = n;
    }
    if (pick === ian) same++;
    printLines([(pick === ian ? span('a', '  Same as me. ') : span('m', `  I would pick ${ian + 1}. `)) + span('m', esc(why())), ...(i === 3 ? ['  ' + cmd('articles')] : []), '']);
  }
  printLines([span('w b', `We agree on ${same} of ${INTERVIEW.length}.`) + span('m', same >= 4 ? ' We should talk.' : same >= 2 ? ' Interesting. We should talk about the rest.' : ' Now I am curious why. Tell me.'),
    span('m', 'The real interview is a message away: ') + cmd('contact')]);
}, { usage: '', flags: [['1-3', 'your answer'], ['q', 'stop early']] });
def(['talk', 'hire', 'chat'], null, '', () => {
  unlock('talk');
  printLines([
    "I'm not really looking for a new job right now, but I'm always happy to talk.",
    'Tech, projects, homelabs, ideas, or just a coffee. Send me a message:',
    '',
    `  ${cmd('linkedin')}   ${cmd('contact')}`,
  ]);
});

// my years side by side: jobs as bars, studies as ◆ in the year I finished
def(['timeline', 'career'], 'me', 'my career over the years', () => {
  const now = new Date().getFullYear(), first = 2016, years = now - first + 1;
  // a narrower label column on phones, so the years still fit
  const labelW = charsPerLine() < 60 ? 15 : 26;
  // as wide as the screen allows, 2 to 5 characters per year
  const w = Math.max(2, Math.min(5, Math.floor((charsPerLine() - labelW - 2) / years)));
  const col = y => (y - first) * w;
  const label = (text, command) => cmd(command, text.length > labelW - 1 ? text.slice(0, labelW - 2) + '…' : text) + ' '.repeat(Math.max(1, labelW - text.length));
  // 2016 when there is room, 16 when it is narrow, and on a phone only every other year
  const axis = Array.from({ length: years }, (_, i) => (w < 3 && i % 2 ? '' : String(first + i).slice(w >= 4 ? 0 : 2)).padEnd(w)).join('');
  const lines = [span('m', ' '.repeat(labelW) + axis), span('w b', 'Work')];
  // oldest first; "IT specialist, software engineer & project manager" shows as its first part
  const years_ = e => e.period.split(/\s*-\s*/).map(s => /now/i.test(s) ? now : parseInt(s, 10));
  [...EXPERIENCE].sort((a, b) => years_(a)[0] - years_(b)[0]).forEach(e => {
    const [from, to] = years_(e);
    const bar = ' '.repeat(col(from)) + '█'.repeat((to - from + 1) * w - 1);
    lines.push(label(`${e.org} · ${e.role.split(',')[0]}`, 'exp ' + (EXPERIENCE.indexOf(e) + 1)) + span('a', bar));
  });
  lines.push('', span('w b', 'Study'));
  [...EDUCATION].sort((a, b) => a.year - b.year).forEach(e => {
    const y = parseInt(e.year, 10);
    lines.push(label(`${e.org} · ${e.title.replace(/^(BSc|HBO) /, '')}`, 'edu ' + (EDUCATION.indexOf(e) + 1)) + ' '.repeat(col(y)) + span('w', '◆'));
  });
  printLines(lines);
  print(span('m', 'Click a line for the full story.'));
}, { usage: '', flags: [] });

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

// Tab completion for the arguments: numbers, and for posts the words of their titles
const titleWords = () => [...new Set(POSTS.flatMap(p => p.title.toLowerCase().match(/[a-z0-9]{4,}/g) || []))];
completes('experience', () => EXPERIENCE.map((_, i) => i + 1));
completes('education', () => EDUCATION.map((_, i) => i + 1));
completes('skills', () => ['-a', ...SKILLS.map((_, i) => i + 1)]);
completes('read', args => args.length ? titleWords() : [...POSTS.map(p => p.n), ...titleWords()]);
