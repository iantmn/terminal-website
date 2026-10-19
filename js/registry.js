// every command, by name. def() adds one plus its aliases
export const C = {};
export const def = (names, group, desc, run, extra = {}) => {
  const [name, ...aliases] = [].concat(names);
  C[name] = { name, group, desc, run, aliases, ...extra };
  aliases.forEach(a => C[a] = { ...C[name], alias: true });
};
