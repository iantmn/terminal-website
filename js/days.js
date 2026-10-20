// a message for today: special days first, otherwise one for the day of the week
import { cmd } from './core.js';

const dayOfYear = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;
// a new pick on every page load, but the same one for the whole visit, so the boot message and /etc/motd agree
const seed = Math.floor(Math.random() * 1e6);
const pickFor = (d, list) => list[seed % list.length];

// by getDay(): 0 is Sunday, unfortunately.
const WEEKDAYS = [
  [
    '😴 Sunday: idle mode. Wake-on-LAN at 08:00 Monday.',
    '📚 Sunday: catching up on reading. Speaking of which: ' + cmd('articles'),
    '🧘 Sunday. No tickets, no pages, no DNS. Probably.',
  ],
  [
    '☕ Monday. weekend.service has stopped. Next restart is scheduled for Friday 17:00.',
    '📉 Monday detected. The weekend has been successfully decommissioned. Coffee level raised to critical.',
    '🙃 It is Monday. Have you tried turning the week off and on again? It does not work, I checked.',
    '📬 Monday: 0 new ideas, 47 unread emails. Classic.',
  ],
  [
    "🌮 Tuesday: Monday's bugs, now with context.",
    '🔧 Tuesday. Patch Tuesday for some, coffee Tuesday for me.',
    '📈 Tuesday: the week has officially reached production.',
  ],
  [
    '🐪 Wednesday: halfway there. The weekend is now closer than last weekend.',
    '⚖️ Wednesday. Too late to blame Monday, too early to blame Friday.',
    '🛠️ Midweek maintenance window: tea instead of coffee. Just kidding.',
  ],
  [
    '🗓️ Thursday: the last day you can still deploy with a clean conscience.',
    "🧪 Thursday. Merge it today, or explain on Friday why you didn't.",
    "🍕 Thursday, also known as Friday's staging environment.",
  ],
  [
    "🚫 It's Friday: no deploys today. Read-only Friday is in effect.",
    "🍻 Friday! git commit -m 'weekend' and walk away slowly. Deploying is still not allowed.",
    '🧯 Friday. The best change is the one you make on Monday. Read-only Friday is in effect.',
  ],
  [
    '🛋️ Saturday. weekend.service is up and running, no SLA.',
    '🏡 Saturday: homelab day. The real one runs on Proxmox, not on deadlines.',
    '🚲 Saturday. Out on the bike. Unless the homelab needs me, which it always does.',
  ],
];

export function dayMessage(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), wd = d.getDay();
  // days that move: the nth weekday of a month (Sunday is 0), or the last Sunday of a month
  const nth = (n, weekday) => wd === weekday && Math.ceil(day / 7) === n;
  const lastSunday = () => wd === 0 && day > new Date(y, m, 0).getDate() - 7;
  const special = (() => {
    if (m === 1 && day === 1) return { msg: '🎆 Happy New Year! New year, same DNS problems.' };
    if (m === 1 && day === 28) return { msg: '🔒 Data Privacy Day. Curious what your browser tells every website you visit? ' + cmd('whoami') };
    if (m === 2 && day === 14) return { msg: "❤️ Happy Valentine's Day. Roses are #ff0000, violets are #0000ff, I wrote this in CSS and it still won’t center." };
    if (m === 2 && day === 29) return { msg: '🐸 Leap day! A day that only exists once every four years, just like a fully labelled server rack.' };
    if (m === 3 && day === 12) return { msg: `🌐 The World Wide Web turns ${y - 1989} today. This page is a tiny, slightly nerdy part of it.` };
    if (m === 3 && day === 14) return { msg: '🥧 Happy Pi Day! 3.14159... Close enough for a homelab.' };
    if (m === 3 && day === 31) return { msg: '💾 World Backup Day. A backup only counts once you restored it. When did you last test yours?' };
    // the clocks go forward on the last Sunday of March
    if (m === 3 && lastSunday()) return { msg: '⏰ The clocks went forward tonight. If your cron job at 02:30 did not run, now you know why.' };
    if (m === 4 && day === 1) return { msg: '🃏 April Fools! Today it is DNS. Even when it is not DNS.' };
    if (m === 4 && day === 4) return { msg: '🔍 4/04, Error 404 Day: the message for today could not be found.' };
    if (m === 4 && day === 27) return { theme: 'oranje', msg: "🧡 Happy King's Day! Everything is orange today." };
    // World Password Day: the first Thursday of May
    if (m === 5 && nth(1, 4)) return { msg: "🔑 World Password Day. 'Welkom01' is not a password, it is an invitation. Use a password manager and turn on 2FA." };
    if (m === 5 && day === 17) return { msg: '🌍 World Internet Day. Thank your router today, it works harder than you think.' };
    // SysAdmin Day: the last Friday of July
    if (m === 7 && wd === 5 && day > 24) return { msg: '🖥️ Happy SysAdmin Day! Thank whoever keeps your Wi-Fi alive. Today, that is me.' };
    if (m === 8 && day === 25) return { msg: `🐧 Happy birthday, Linux! ${y - 1991} years ago Linus called it "just a hobby". Today it runs most of the internet, my homelab and probably your router.` };
    // Programmers' Day: day 256 of the year, 0x100
    if (dayOfYear(d) === 256) return { msg: "👨‍💻 Day 256 of the year, Programmers' Day. 0x100 reasons to celebrate." };
    if (m === 9 && day === 19) return { msg: "🏴‍☠️ Talk Like a Pirate Day. Arr, " + cmd('ls') + " be listin' yer booty, matey." };
    if (m === 10 && day === 1) return { msg: '☕ International Coffee Day. coffee.service now runs at maximum priority: ' + cmd('coffee') };
    if (m === 10 && day === 4) return { msg: '🐾 Dierendag! The animals take over the terminal today: ' + cmd('cowsay -f kitty miauw') };
    if (m === 10 && day === 31) return { msg: '🎃 Happy Halloween. Something is lurking in /dev/null.' };
    // the clocks go back on the last Sunday of October
    if (m === 10 && lastSunday()) return { msg: '🕰️ The clocks went back tonight: one extra hour. Perfect for one more homelab project.' };
    if (m === 11 && day === 11) return { msg: '🏮 Sint-Maarten! Kids go door to door with lanterns tonight. In here, a lantern is ' + cmd('theme light') + '.' };
    // World Usability Day: the second Thursday of November
    if (m === 11 && nth(2, 4)) return { msg: '🧭 World Usability Day. Good design means nobody needs a manual. This terminal is the exception: ' + cmd('help') };
    if (m === 11 && day === 23) return { msg: "🎂 Today is Ian's birthday! uptime += 1 year. Feel free to say hi: " + cmd('contact') };
    if (m === 11 && day === 30) return { msg: '🔐 Computer Security Day. Your password is safe with me: I never asked for it. Now go turn on 2FA for that one account you keep putting off.' };
    if (m === 12 && day === 5) return { msg: '🎁 Happy Sinterklaas! Put your shoe by the terminal and try ' + cmd('fortune') + '.' };
    if (m === 12 && day >= 24 && day <= 26) return { msg: '🎄 Merry Christmas! The homelab is in a change freeze. The coffee is not.' };
    if (m === 12 && day === 31) return { msg: '🎇 Oudejaarsavond: oliebollen in one hand, a change freeze in the other.' };
    return null;
  })();
  if (special) return special;
  return { msg: pickFor(d, WEEKDAYS[wd]) };
}

export const SINTERKLAAS = [
  'Sinterklaas came by tonight, / he found the homelab running bright. / He left a gift beside the rack: / a label maker. No way back.',
  'The Sint looked at your terminal screen / and saw the cleanest config seen. / He only had one small remark: / "Why is DNS always dark?"',
];
