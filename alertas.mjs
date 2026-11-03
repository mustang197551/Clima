// alertas.mjs — "vigilante" que corre cada hora en GitHub Actions.
// Revisa el pronóstico de la ciudad de config.js y, si aparece una alerta nueva
// (o sube de nivel), manda una notificación al canal de ntfy.
import fs from "node:fs";
import vm from "node:vm";

vm.runInThisContext(fs.readFileSync(new URL("./config.js", import.meta.url), "utf8"));
vm.runInThisContext(fs.readFileSync(new URL("./core.js", import.meta.url), "utf8"));
const { CONFIG, Core } = globalThis;
const { computeAlerts, alertUrls } = Core;

const ESTADO = new URL("./enviados.json", import.meta.url);
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NIV = { 1: "🟡", 2: "🟠", 3: "🔴" };
const PRIORIDAD = { 1: 3, 2: 4, 3: 5 }; // ntfy: 3 normal, 4 alta, 5 urgente

const getJSON = async (u, opcional = false) => {
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (opcional) return null;
    throw new Error(`No se pudo leer ${u}: ${e.message}`);
  }
};

// 1) Ubicar la ciudad
const [nombre, prov] = CONFIG.ciudad.split(",").map(s => s.trim());
const geo = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=10&language=es`);
const lugar = (geo.results || []).find(r => !prov || (r.admin1 || "").toLowerCase().includes(prov.toLowerCase())) || (geo.results || [])[0];
if (!lugar) throw new Error(`No encontré la ciudad "${CONFIG.ciudad}". Revisá config.js`);
console.log(`Revisando ${lugar.name}, ${lugar.admin1 || ""} (${lugar.latitude}, ${lugar.longitude})`);

// 2) Pronóstico y alertas (misma lógica que la app)
const U = alertUrls(lugar.latitude, lugar.longitude);
const [b, cape, flood] = await Promise.all([getJSON(U.models), getJSON(U.cape, true), getJSON(U.flood, true)]);
const alertas = computeAlerts(b, cape, flood).filter(a => a.lvl >= (CONFIG.nivelMinimo || 1));
const hoy = b.daily.time[0];

// 3) Ver cuáles son nuevas o subieron de nivel
let estado = { enviados: {} };
try { estado = JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch {}
const env = estado.enviados || {};
for (const k of Object.keys(env)) if (k.slice(0, 10) < hoy) delete env[k]; // olvidar días pasados

const nuevas = alertas.filter(a => (env[`${a.fecha}|${a.tipo}`] || 0) < a.lvl);
console.log(`${alertas.length} alertas vigentes, ${nuevas.length} nuevas.`);

// 4) Notificar (una sola notificación con todas las novedades)
if (nuevas.length) {
  const peor = Math.max(...nuevas.map(a => a.lvl));
  const linea = a => {
    const d = new Date(a.fecha + "T12:00");
    const cuando = a.fecha === hoy ? "Hoy" : `${DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()}`;
    return `${NIV[a.lvl]} ${cuando} · ${a.icon} ${a.tipo}: ${a.txt}`;
  };
  const cuerpo = {
    topic: CONFIG.ntfyTema,
    title: `⚠️ ${nuevas.length === 1 ? nuevas[0].tipo : nuevas.length + " alertas"} en ${lugar.name}`,
    message: nuevas.map(linea).join("\n") + "\n\nEstimación automática. Alertas oficiales: smn.gob.ar/alertas",
    priority: PRIORIDAD[peor],
    tags: ["warning"],
  };
  if (process.env.APP_URL) cuerpo.click = process.env.APP_URL;
  const r = await fetch("https://ntfy.sh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`ntfy respondió ${r.status}: ${await r.text()}`);
  for (const a of nuevas) env[`${a.fecha}|${a.tipo}`] = a.lvl;
  console.log("Notificación enviada:\n" + cuerpo.message);
}

// 5) Guardar estado (la fecha de revisión cambia una vez por día y mantiene activo el repositorio)
fs.writeFileSync(ESTADO, JSON.stringify({ revisado: hoy, ciudad: lugar.name, enviados: env }, null, 2) + "\n");
