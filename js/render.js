// turns the content into terminal lines
import { track } from './achievements.js';
import { SITE, PROFILE, ABOUT, SKILLS, POSTS, EXPERIENCE, EDUCATION } from './content.js';
import { esc, span, cmd, link, absUrl, h2, bullet, tags, kv, slugify } from './core.js';

POSTS.forEach((p, i) => { p.n = i + 1; p.file = slugify(p.title) + '.md'; });

export const cvLines = () => [`The full CV lives at ${link(SITE + '/CV/')}`, `${span('m','Or explore here:')} ${cmd('experience')} ${cmd('education')} ${cmd('certs')} ${cmd('skills')}`];

export function relatedLines(at) {
  const rel = at ? POSTS.filter(p => p.at === at) : [];
  if (!rel.length) return [];
  const stack = [...new Set(rel.flatMap(p => p.stack || []))];
  return [
    '', h2('Write-ups from this time'),
    ...rel.map(p => `  ${span('m', p.date.slice(0, 7))}  ${p.icon} <a class="cmd" data-cmd="read ${p.n}">${esc(p.title)}</a>`),
    '', h2('Tools & techniques'), tags(stack),
  ];
}

export const fmtExp = e => [
  `${span('a b', '# ' + esc(e.role))}`,
  `${span('h', esc(e.org))} ${span('m', '- ' + esc(e.place) + ' · ' + esc(e.period))}`,
  e.blurb ? span('m', esc(e.blurb)) : null,
  '',
  esc(e.text),
  '', h2('Responsibilities'),
  ...e.bullets.map(bullet),
  ...(e.stack && !e.at ? ['', h2('Skills used'), tags(e.stack)] : []),
  ...relatedLines(e.at),
].filter(x => x !== null);

export const fmtEdu = e => [
  `${span('a b', '# ' + esc(e.title))}`,
  `${span('h', esc(e.org))} ${span('m', '- ' + esc(e.place) + ' · ' + esc(e.year))}`,
  '',
  esc(e.text),
  '', h2('Highlights'),
  ...e.bullets.map(bullet),
  ...relatedLines(e.at),
];

// a post by number or by name (read traefik, open proxmox backup): every word has to be in the title or file name.
// gives { post } for one hit, { list } for several, {} for none
export function findPost(args) {
  if (!args.length) return {};
  const n = parseInt(args[0], 10);
  if (String(n) === args[0]) { const post = POSTS.find(p => p.n === n); return post ? { post } : {}; }
  const words = args.map(w => w.toLowerCase());
  const list = POSTS.filter(p => words.every(w => `${p.title} ${p.file}`.toLowerCase().includes(w)));
  return list.length === 1 ? { post: list[0] } : list.length ? { list } : {};
}
export const postChoices = (list, verb) => [
  span('m', `${list.length} posts match, pick one:`),
  ...list.map(p => `  ${span('m', `[${String(p.n).padStart(2, ' ')}]`)} ${p.icon} <a class="cmd" data-cmd="${verb} ${p.n}">${esc(p.title)}</a>`),
];

export function fmtPost(p) {
  const guide = p.type === 'guide';
  const origin = p.at && [...EXPERIENCE, ...EDUCATION].find(x => x.at === p.at);
  const l = [
    `${span('a b', '# ' + p.icon + ' ' + esc(p.title))}`,
    span('m', `${p.date} · ${guide ? 'Guide' : 'Project'}${origin ? ' · ' + esc(origin.org) : ''}`),
    '',
  ];
  if (p.context) l.push(h2(guide ? 'Why' : 'The problem'), esc(p.context), '');
  l.push(h2(guide ? 'What it covers' : 'What I built'), esc(p.built || p.desc), '');
  if (p.points && p.points.length) l.push(h2('Highlights'), ...p.points.map(bullet), '');
  if (p.stack && p.stack.length) l.push(h2('Stack'), tags(p.stack), '');
  l.push(`→ ${link(absUrl(p.url), 'read the full ' + (guide ? 'article' : 'write-up'))}  ${span('m','or type')} ${cmd('open ' + p.n)}`);
  queueMicrotask(() => track('read', p.url, 5, 'reader'));
  return l;
}

// content renderers
export function aboutLines() {
  const l = [span('a b', '# ' + esc(PROFILE.name)), span('m', esc(PROFILE.role) + ' · ' + esc(PROFILE.location)), '', esc(ABOUT.intro), '', kv(ABOUT.facts)];
  for (const [title, paras] of ABOUT.sections) l.push('', h2(title), ...paras.flatMap((t, i) => i ? ['', esc(t)] : [esc(t)]));
  l.push('', span('m', 'Explore: ') + ['experience', 'education', 'skills', 'projects', 'articles', 'contact'].map(c => cmd(c)).join('  '));
  return l;
}
export function contactLines() {
  const l = [
    `<div class="tbl"><span>GitHub</span><span>${link(PROFILE.github)}</span><span>LinkedIn</span><span>${link(PROFILE.linkedin)}</span><span>Website</span><span>${link(SITE)}</span><span>RSS</span><span>${link(PROFILE.rss)}</span>${PROFILE.email ? `<span>Email</span><span>${link('mailto:' + PROFILE.email, PROFILE.email)}</span>` : ''}</div>`,
  ];
  l.push('', span('m', 'Shortcuts: ') + `${cmd('github')} ${cmd('linkedin')} ${cmd('gui')}${PROFILE.email ? ' ' + cmd('mail') : ''}`);
  return l;
}
export const fmtSkill = (g, i) => [span('a b', `${i + 1}. ${g.icon} ${esc(g.title)}`), kv(g.rows)];
// category names, cut off so each overview line stays on one row
const preview = g => {
  let out = '';
  for (const [c] of g.rows) { const next = out ? out + ' · ' + c : c; if (next.length + g.title.length > 70) return out + ' …'; out = next; }
  return out;
};
export function skillLines(n) {
  if (n === 'all') return SKILLS.flatMap((g, i) => [...fmtSkill(g, i), '']);
  if (SKILLS[n - 1]) return fmtSkill(SKILLS[n - 1], n - 1);
  return [
    ...SKILLS.map((g, i) => `${span('m', `[${String(i + 1).padStart(2, ' ')}]`)} ${g.icon} <a class="cmd" data-cmd="skills ${i + 1}">${esc(g.title)}</a>  ${span('m', esc(preview(g)))}`),
    '',
    span('m', 'Type ') + span('a2', 'skills &lt;n&gt;') + span('m', ' for details or ') + cmd('skills -a') + span('m', ' for everything.'),
  ];
}
