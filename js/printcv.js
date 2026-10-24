// cv --print: a plain CV on paper (or a PDF), built from the same content as the terminal. It goes into #printcv,
// which css/style.css only shows when printing, and everything else is hidden then. Gone again after printing
import { SITE, PROFILE, ABOUT, EXPERIENCE, EDUCATION, CERTS, SKILLS } from './content.js';
import { esc } from './core.js';

const url = u => `<a href="${esc(u)}">${esc(u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`;

export function printCv() {
  document.getElementById('printcv')?.remove();
  const el = document.createElement('div');
  el.id = 'printcv';
  el.innerHTML = `
    <header><h1>${esc(PROFILE.name)}</h1><p class="role">${esc(PROFILE.role)} · ${esc(PROFILE.location)}</p>
      <p class="links">${[SITE, PROFILE.linkedin, PROFILE.github].map(url).join(' · ')}${PROFILE.email ? ' · ' + esc(PROFILE.email) : ''}</p></header>
    <p class="intro">${esc(ABOUT.intro)}</p>
    <h2>Experience</h2>
    ${EXPERIENCE.map(e => `<section><div class="row"><b>${esc(e.role)}</b>, ${esc(e.org)}<span>${esc(e.place)} · ${esc(e.period)}</span></div>
      <ul>${e.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul></section>`).join('')}
    <h2>Education</h2>
    ${EDUCATION.map(e => `<section><div class="row"><b>${esc(e.title)}</b>, ${esc(e.org)}<span>${esc(e.place)} · ${esc(e.year)}</span></div></section>`).join('')}
    <h2>Courses &amp; certificates</h2>
    <ul class="certs">${CERTS.map(([y, c]) => `<li><span>${esc(y)}</span> ${esc(c)}</li>`).join('')}</ul>
    <h2>Skills</h2>
    <dl>${SKILLS.map(g => `<dt>${esc(g.title)}</dt><dd>${esc(g.rows.map(([k]) => k).join(' · '))}</dd>`).join('')}</dl>
    <footer>Printed from ${url('https://terminal.iantiemann.nl/')} on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</footer>`;
  document.body.appendChild(el);
  addEventListener('afterprint', () => el.remove(), { once: true });
  // the dialog a moment later, once the CV is in the page (print lays it out itself)
  setTimeout(() => window.print(), 30);
}
