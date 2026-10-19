import { cmd } from './core.js';

// something special on certain days
export function season(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 4 && day === 27) return { theme: 'oranje', msg: "🧡 Happy King's Day! Everything is orange today. Lang leve de koning." };
  if (m === 12 && day === 5) return { msg: '🎁 Happy Sinterklaas! Put your shoe by the terminal and try ' + cmd('fortune') + '.' };
  if (m === 12 && day >= 24 && day <= 26) return { msg: '🎄 Merry Christmas! The homelab is in a change freeze. The coffee is not.' };
  if (m === 1 && day === 1) return { msg: '🎆 Happy New Year! New year, same DNS problems.' };
  if (m === 10 && day === 31) return { msg: '🎃 Happy Halloween. Something is lurking in /dev/null.' };
  if (d.getDay() === 5) return { friday: true, msg: "🚫 It's Friday: no deploys today. Read-only Friday is in effect." };
  return null;
}
export const SINTERKLAAS = [
  'Sinterklaas came by tonight, / he found the homelab running bright. / He left a gift beside the rack: / a label maker. No way back.',
  'The Sint looked at your terminal screen / and saw the cleanest config seen. / He only had one small remark: / "Why is DNS always dark?"',
];
