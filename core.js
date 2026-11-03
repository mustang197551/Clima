/* core.js — lógica compartida entre la app (navegador) y el vigilante de alertas (GitHub Actions). */
const MODELS = {
  ecmwf_ifs025: "Modelo A",
  gfs_seamless: "Modelo B",
  icon_seamless: "Modelo C",
  meteofrance_seamless: "Modelo D",
  ukmo_seamless: "Modelo E"
};
const median = a => { const s=[...a].sort((x,y)=>x-y), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };

/* ---------- ALERTAS ----------
   Niveles: 1 = amarilla, 2 = naranja, 3 = roja.
   Umbrales genéricos inspirados en los criterios del SMN; no reemplazan las alertas oficiales. */
const NIVEL = {1:{n:"Amarilla",c:"#facc15",bg:"#713f12"},2:{n:"Naranja",c:"#fb923c",bg:"#7c2d12"},3:{n:"Roja",c:"#f87171",bg:"#7f1d1d"}};
function computeAlerts(b,cape,flood){
  const out=[], d=b.daily, keys=Object.keys(MODELS);
  const vals=(v,i)=>keys.map(m=>d[`${v}_${m}`]?.[i]).filter(x=>x!=null);
  const med=(v,i)=>{ const a=vals(v,i); return a.length?median(a):null; };
  const add=(i,lvl,icon,tipo,txt)=>{ if(lvl>0) out.push({i,fecha:d.time[i],lvl,icon,tipo,txt}); };
  const lvlUp=(x,t)=> x==null?0 : x>=t[2]?3 : x>=t[1]?2 : x>=t[0]?1 : 0;
  const lvlDown=(x,t)=> x==null?0 : x<=t[2]?3 : x<=t[1]?2 : x<=t[0]?1 : 0;

  // CAPE (energía para tormentas) y lluvia horaria máxima por día
  const capeDia={}, lluviaHoraMax={};
  if(cape?.hourly){
    cape.hourly.time.forEach((t,k)=>{ const f=t.slice(0,10);
      capeDia[f]=Math.max(capeDia[f]??0, cape.hourly.cape?.[k]??0);
      lluviaHoraMax[f]=Math.max(lluviaHoraMax[f]??0, cape.hourly.precipitation?.[k]??0); });
  }

  // Horas con tormenta eléctrica por día (pronóstico hora a hora)
  const hrsTorm={};
  if(cape?.hourly?.weather_code){
    cape.hourly.time.forEach((t,k)=>{ if((cape.hourly.weather_code[k]??0)>=95){ const f=t.slice(0,10);
      (hrsTorm[f]=hrsTorm[f]||[]).push(+t.slice(11,13)); } });
  }

  const lluvias=d.time.map((_,i)=>med("precipitation_sum",i)??0);
  d.time.forEach((f,i)=>{
    const n=vals("temperature_2m_max",i).length||1;
    // Viento
    const raf=med("wind_gusts_10m_max",i), vel=med("wind_speed_10m_max",i);
    const lv=Math.max(lvlUp(raf,[60,80,100]), lvlUp(vel,[45,60,75]));
    add(i,lv,"💨","Vientos fuertes",`Ráfagas de hasta ${Math.round(raf??0)} km/h${vel?` (viento sostenido ${Math.round(vel)} km/h)`:""}.`);
    // Tormentas y granizo
    const codes=vals("weather_code",i), torm=codes.filter(c=>c>=95).length, gran=codes.filter(c=>c===96||c===99).length;
    const cp=capeDia[f]??0, lluviaH=lluviaHoraMax[f]??0;
    let lt = torm/n>=0.4 ? 1 : 0;
    if(lt && (cp>=2000 || (raf??0)>=70 || lluviaH>=20)) lt=2;
    if(lt && cp>=3000 && ((raf??0)>=90 || lluviaH>=40)) lt=3;
    add(i,lt,"⛈️","Tormentas severas",`Tormentas probables${lt>=2?" con actividad eléctrica intensa, ráfagas y lluvia fuerte en poco tiempo":""}.`);
    // Rayos (actividad eléctrica)
    const hs=hrsTorm[f]||[];
    let lr = (hs.length>0 || torm/n>=0.4) ? 1 : 0;
    if(lr && (hs.length>=3 || cp>=2000)) lr=2;
    if(lr && hs.length>=4 && cp>=3000) lr=3;
    const franja = hs.length ? ` entre las ${Math.min(...hs)} y las ${Math.max(...hs)+1} h` : "";
    add(i,lr,"⚡","Rayos",`Probable actividad eléctrica${franja}${lr>=2?", con caída de rayos frecuente":""}.`);
    let lg = gran>=2 ? 2 : (gran>=1 || (torm>=2 && cp>=2500)) ? 1 : 0;
    if(lg && cp>=3500) lg=Math.min(lg+1,3);
    add(i,lg,"🧊","Granizo","Condiciones favorables para caída de granizo.");
    // Lluvia intensa (en el día) y abundante (acumulada 3 días)
    const ll=lluvias[i];
    const li=Math.max(lvlUp(ll,[30,60,100]), lvlUp(lluviaH,[20,35,50]));
    add(i,li,"🌧️","Lluvias intensas",`Se esperan unos ${Math.round(ll)} mm en el día${lluviaH>=20?`, con picos de ${Math.round(lluviaH)} mm en una hora`:""}.`);
    const acu3=lluvias.slice(Math.max(0,i-2),i+1).reduce((s,x)=>s+x,0);
    const la=lvlUp(acu3,[70,110,150]), prevA=out.filter(o=>o.tipo==="Lluvias abundantes").pop();
    if(i>=2 && ll>=10 && !(prevA && prevA.i===i-1 && prevA.lvl>=la)) add(i,la,"🌊","Lluvias abundantes",`Acumulado de ${Math.round(acu3)} mm en 3 días.`);
    // Inundación (anegamientos por lluvia)
    const lf = Math.max(ll>=100||acu3>=150?2:0, ll>=60||acu3>=110?1:0, ll>=150||acu3>=200?3:0);
    add(i,lf,"🏠","Riesgo de inundaciones","Posibles anegamientos en zonas bajas y calles por la cantidad de lluvia.");
    // Temperaturas extremas
    const tmax=med("temperature_2m_max",i), tmin=med("temperature_2m_min",i);
    add(i,lvlUp(tmax,[35,38,41]),"🥵","Calor extremo",`Máxima de ${Math.round(tmax)}°.`);
    add(i,lvlDown(tmin,[0,-5,-10]),"🥶","Frío extremo",`Mínima de ${Math.round(tmin)}°${tmin<=0?" (heladas)":""}.`);
  });

  // Crecida de ríos (modelo hidrológico GloFAS): compara el caudal pronosticado con los últimos 3 meses
  if(flood?.daily?.river_discharge){
    const hoy=d.time[0], ft=flood.daily.time, q=flood.daily.river_discharge;
    const pasado=q.filter((x,k)=>ft[k]<hoy && x!=null), fut=ft.map((t,k)=>({t,x:q[k]})).filter(o=>o.t>=hoy && o.x!=null);
    if(pasado.length>20 && fut.length){
      const base=median(pasado), p90=[...pasado].sort((a,b)=>a-b)[Math.floor(pasado.length*0.9)];
      const pico=fut.reduce((m,o)=>o.x>m.x?o:m);
      if(pico.x>5){
        const lr = pico.x>=base*6 ? 3 : pico.x>=base*4 ? 2 : (pico.x>=base*2.5 && pico.x>p90*1.3) ? 1 : 0;
        const idx=Math.max(0,d.time.indexOf(pico.t));
        add(idx,lr,"🏞️","Crecida de ríos",`El caudal del río cercano podría llegar a ${Math.round(pico.x)} m³/s (lo habitual en los últimos meses: ${Math.round(base)} m³/s).`);
      }
    }
  }
  return out.sort((a,b)=>a.i-b.i || b.lvl-a.lvl);
}

/* Direcciones de los datos que usan las alertas (compartidas por la app y el vigilante) */
function alertUrls(lat,lon){
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto`;
  return {
    models: base + "&forecast_days=7&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_gusts_10m_max,wind_speed_10m_max&models=" + Object.keys(MODELS).join(","),
    cape:   base + "&forecast_days=7&hourly=cape,precipitation,weather_code",
    flood:  `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&past_days=92&forecast_days=7`
  };
}

globalThis.Core = { MODELS, NIVEL, median, computeAlerts, alertUrls };
