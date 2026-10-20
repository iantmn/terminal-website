// every command, by name. def() adds one plus its aliases
export const C = {};
export const def = (names, group, desc, run, extra = {}) => {
  const [name, ...aliases] = [].concat(names);
  C[name] = { name, group, desc, run, aliases, ...extra };
  aliases.forEach(a => C[a] = { ...C[name], alias: true });
};
// Tab completion for a command's arguments: fn(args before the word, the word) gives the candidates, or null for paths
export const completes = (name, fn) => { for (const c of Object.values(C)) if (c.name === name) c.complete = fn; };
