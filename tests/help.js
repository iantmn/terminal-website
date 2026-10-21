// the help texts agree with each other: every command has a description in the same style, its flags are written
// the same way, and --help, man and tldr show the same description and flags. Runs in the page (tests/run.mjs)
import { run } from '/js/input.js';
import { state } from '/js/core.js';
import { C } from '/js/registry.js';
import { helpLines, htmlToText } from '/js/shell.js';

const out = async c => { const b = document.querySelectorAll('#out .ln').length; await run(c); return [...document.querySelectorAll('#out .ln')].slice(b + 1).map(l => l.innerText).filter(l => !l.startsWith('★ achievement unlocked')).join('\n'); };
// commands that only exist on one machine; their man and tldr are checked there, not here
const elsewhere = c => c.hosts && !c.hosts.includes(state.host);

export async function runHelp(onResult = () => {}) {
  const results = [];
  const check = (name, problems) => { const r = { name, ok: !problems.length, info: problems.join('; ') }; results.push(r); onResult(r); };
  await run('cd ~');
  const commands = [...new Set(Object.values(C).filter(c => !c.alias))].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of commands) {
    const p = [];
    // a description: a short phrase in lowercase style, no full stop. Secrets may keep theirs empty
    if (!c.desc) { if (c.group) p.push('no description'); }
    else {
      // a sentence that ends, not the .. of a path
      if (/[a-z)]\.$/i.test(c.desc)) p.push('description ends with a full stop');
      if (c.desc.length > 70) p.push(`description is ${c.desc.length} characters (70 at most)`);
      if (/^[A-Z][a-z]/.test(c.desc) && !/^(WireGuard|Ansible|Proxmox|Docker|Kubernetes|Uptime|ZFS|LXC|Ian|Ian's)\b/.test(c.desc)) p.push('description starts with a capital');
    }
    // flags: [what you type, what it does], both filled in, the description without a full stop
    for (const f of c.flags || []) {
      if (!Array.isArray(f) || f.length !== 2 || !f[0] || !f[1]) { p.push(`flag ${JSON.stringify(f)} is not [flag, description]`); continue; }
      if (/[a-z)]\.$/i.test(f[1])) p.push(`flag ${f[0]}: description ends with a full stop`);
      // -x, --long, -x value, a lone - (cd -), and single-dash words like find -name or ip -br
      if (/^-/.test(f[0]) && !/^(-[\w?]+|--[\w-]+|-)([ =]\S+)?(, (-[\w?]+|--[\w-]+)([ =]\S+)?)*$/.test(f[0])) p.push(`flag ${f[0]} is not written like -x, --long or -x value`);
    }
    // --help shows the description and every flag
    const help = htmlToText(helpLines(c)).join('\n');
    if (c.desc && !help.toLowerCase().includes(c.desc.toLowerCase())) p.push('--help leaves out the description');
    for (const [f] of c.flags || []) if (f && !help.includes(f)) p.push(`--help leaves out ${f}`);
    // man and tldr say the same, for the commands of this machine that have a description
    if (c.desc && !elsewhere(c)) {
      const man = await out(`man -P cat ${c.name}`);
      if (!man.includes(c.desc)) p.push('man leaves out the description');
      for (const [f] of c.flags || []) if (f && !man.includes(f)) p.push(`man leaves out ${f}`);
      if (c.group) {
        const tldr = await out(`tldr ${c.name}`);
        if (!tldr.includes(c.desc)) p.push('tldr leaves out the description');
      }
    }
    check(c.name, p);
  }
  return results;
}
