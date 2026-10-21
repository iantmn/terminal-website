// what is running on the homelab and the Proxmox host, for this visit. Small on purpose: status reads it
// without loading the machines themselves, which only load on the first ssh (homelab.js, pve.js)
export const STACKS = { terminal: ['traefik', 'terminal'], monitoring: ['prometheus', 'grafana', 'loki', 'alloy'], automation: ['n8n', 'postgres'] };
export const IMAGES = { traefik: 'traefik:v3.1', terminal: 'nginx:1.27-alpine', prometheus: 'prom/prometheus:v2.53.0', grafana: 'grafana/grafana:11.1.0', loki: 'grafana/loki:3.1.0', alloy: 'grafana/alloy:v1.2.0', n8n: 'n8nio/n8n:1.50.0', postgres: 'postgres:16-alpine' };
// one container outside any stack, stopped for years: the printer fix that never worked
export const PRINTER = { stack: null, svc: 'printer-fix', name: 'printer-fix', image: 'ian/printer-fix:latest' };
export const all = () => [...Object.entries(STACKS).flatMap(([stack, svcs]) => svcs.map(svc => ({ stack, svc, name: `${stack}-${svc}-1`, image: IMAGES[svc] }))), PRINTER];
// which containers run; what you stop stays stopped until you start it again (for this visit)
export const running = new Set(all().filter(c => c !== PRINTER).map(c => c.name));
export const stoppedAt = {};
// for status: is it up, since when is it down, and every outage of the site during this visit
export const downSince = name => running.has(name) ? null : stoppedAt[name] ?? Date.now();
export const INCIDENTS = [];

// what ps, df, ip and friends show on each machine behind ssh; homelab.js and pve.js fill it in when they load
export const HOSTS = {};

// ---- the restore puzzle: stacks/monitoring/prometheus.yml went at 22:14 last night, the 03:00 backup ran without it ----
export const RESTORE = { done: false };
export const PROMETHEUS_YML = [
  '# scraped every 15 seconds: the hosts, the Docker VM and the containers',
  'global:',
  '  scrape_interval: 15s',
  '',
  'scrape_configs:',
  '  - job_name: prometheus',
  '    static_configs: [{ targets: [localhost:9090] }]',
  '  - job_name: node',
  '    static_configs: [{ targets: [10.20.0.10:9100, 10.20.0.20:9100] }]',
  '  - job_name: pve',
  '    metrics_path: /pve',
  '    static_configs: [{ targets: [10.20.0.10:9221] }]',
  '  - job_name: traefik',
  '    static_configs: [{ targets: [terminal-traefik-1:8080] }]',
];

// ---- the live incident: once per visit, the Docker disk fills up and Grafana falls over ----
export const ALERT = { fired: false, full: false, resolved: false };

// ---- the guests on the Proxmox host ----
export const VMS = [
  { id: 101, name: 'homeassistant', mem: 4096, disk: 32, pid: 2101, cores: 2, note: 'The lights still work. The automations do not.' },
  { id: 102, name: 'homelab', mem: 16384, disk: 64, pid: 2204, cores: 4, data: 500 },
  { id: 103, name: 'pbs', mem: 4096, disk: 32, pid: 2307, cores: 2, note: 'Tonight\'s backup will have nowhere to go. Start it again before 03:00.' },
  { id: 104, name: 'win11-sandbox', mem: 8192, disk: 80, pid: 0, cores: 4, note: 'It wants to install updates first.' },
  { id: 9000, name: 'debian12-cloudinit', mem: 2048, disk: 8, pid: 0, cores: 2, template: true },
];
export const CTS = [
  { id: 200, name: 'adguard', mem: 512 },
  { id: 201, name: 'unifi', mem: 2048 },
  { id: 202, name: 'minecraft', mem: 4096, stopped: true },
];
export const stoppedSince = {};
export const up = new Set([...VMS.filter(v => v.pid).map(v => v.id), ...CTS.filter(c => !c.stopped).map(c => c.id)]);
export const guestDownSince = id => up.has(id) ? null : stoppedSince[id] ?? Date.now();
