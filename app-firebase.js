/***** Estado + storage (TU VERSIÓN BASE) *****/
const LS_KEY = 'prodline_corrida_v1';
const estado = {
  corridaId: null,  // SABOR_FORMATO_YYYY-MM-DD
  sabor: '', formato: '', objetivoTotal: 0,
  parciales: []     // {id, ts, turno, operador, objetivoTurno, botellas}
};
const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat('es-AR').format(n);
const hoyISO = () => {
  const d = new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
function load(){ try{ Object.assign(estado, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }catch{} }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(estado)); }

/***** UI refs (TU VERSIÓN) *****/
const saborEl = $('#sabor'), formatoEl = $('#formato'), objetivoTotalEl = $('#objetivoTotal'), corridaInfoEl = $('#corridaInfo');
const turnoEl = $('#turno'), operadorEl = $('#operador'), objetivoTurnoEl = $('#objetivoTurno'), botellasParcialEl = $('#botellasParcial');
const barraEl = $('#barra'), vObjetivoEl = $('#vObjetivo'), vAcumuladoEl = $('#vAcumulado'), vRestanteEl = $('#vRestante'), listaParcialesEl = $('#listaParciales');

/***** Render (TU VERSIÓN) *****/
function renderHeader(){
  if(!estado.corridaId){
    corridaInfoEl.textContent = 'Definí Sabor, Formato y Objetivo total; luego “Guardar objetivo”.';
    return;
  }
  corridaInfoEl.innerHTML = `
    <span class="corrida-badge">Sabor: ${estado.sabor}</span>
    <span class="corrida-badge">Formato: ${estado.formato}</span>
    <span class="corrida-badge id">${estado.corridaId}</span>
  `;
}
function renderResumen(){
  const objetivo = Number(estado.objetivoTotal)||0;
  const acumulado = estado.parciales.reduce((a,p)=>a+Number(p.botellas||0),0);
  const restante = Math.max(objetivo - acumulado, 0);
  const pct = objetivo>0 ? Math.min(100, Math.round(acumulado*100/objetivo)) : 0;
  vObjetivoEl.textContent = objetivo?fmt(objetivo):'—';
  vAcumuladoEl.textContent = fmt(acumulado);
  vRestanteEl.textContent = fmt(restante);
  barraEl.style.width = pct+'%';
  barraEl.textContent = pct+'%';
}
function renderParciales(){
  listaParcialesEl.innerHTML = '';
  const uxp = envasesPorPaquete(estado.formato);
  const ordenados = [...estado.parciales].sort((a,b)=> a.ts - b.ts);
  for (const p of ordenados){
    const row = document.createElement('div');
    row.className = 'row';
    const fecha = new Date(p.ts).toLocaleString('es-AR',{hour12:false});
    const bot = Number(p.botellas) || 0;
    const cajasHechas = uxp > 0 ? bot / uxp : 0;
    const cajasObj = Number(p.objetivoTurno) || 0;
    const pctTurno = cajasObj > 0 ? Math.round((cajasHechas * 100) / cajasObj) : 0;
    const chipCls = (pctTurno >= 58) ? 'ok' : 'bad';
    const rowStateCls = (pctTurno >= 58) ? 'state-ok' : 'state-bad';
    row.classList.add(rowStateCls);
    row.innerHTML = `
      <span>${fecha}</span>
      <span>${p.turno}</span>
      <span>${p.operador}</span>
      <span>${fmt(cajasObj)}</span>
      <span>${fmt(bot)}</span>
      <span><span class="pct-chip ${chipCls}" title="${fmt(cajasHechas)} / ${fmt(cajasObj)} cajas">${pctTurno}%</span></span>
      <span><button class="btn warn" data-id="${p.id}">Borrar</button></span>
    `;
    row.querySelector('button').addEventListener('click', ()=> borrarParcial(p.id));
    listaParcialesEl.appendChild(row);
  }
}
function renderAll(){
  if(estado.sabor) saborEl.value = estado.sabor;
  if(estado.formato) formatoEl.value = estado.formato;
  if(estado.objetivoTotal) objetivoTotalEl.value = estado.objetivoTotal;
  renderHeader(); renderResumen(); renderParciales();
}

/***** Acciones (LOCAL por defecto) *****/
function guardarCorrida(){
  const sabor = (saborEl.value||'').trim();
  const formato = (formatoEl.value||'').trim();
  const obj = Number(objetivoTotalEl.value);
  if(!sabor || !formato || !(obj>0)){ alert('Completá Sabor, Formato y un Objetivo total > 0.'); return; }
  estado.corridaId = `${sabor.replace(/\s+/g,'')}_${formato.replace(/\s+/g,'')}_${hoyISO()}`;
  estado.sabor = sabor; estado.formato = formato; estado.objetivoTotal = obj;
  save(); renderAll();
  // publicar a cloud (si está disponible); se encola si aún no levantó
  cloudEnqueue(() => cloudGuardarCorrida().catch(()=>{}));
}
function agregarParcial(){
  if(!estado.corridaId){ alert('Primero guardá la corrida.'); return; }
  const turno = (turnoEl.value||'').trim();
  const operador = (operadorEl.value||'').trim();
  const objetivoTurno = Number(objetivoTurnoEl.value);
  const botellas = Number(botellasParcialEl.value);
  if(!turno || !operador || !(objetivoTurno>0) || !(botellas>=0)){
    alert('Completá Turno, Operador, Objetivo de turno (>0) y Botellas (≥0).'); return;
  }
  // LOCAL: siempre actualizo (respuesta inmediata)
  estado.parciales.push({ id: crypto.randomUUID(), ts: Date.now(), turno, operador, objetivoTurno, botellas });
  save();
  operadorEl.value=''; botellasParcialEl.value='';
  renderResumen(); renderParciales();
  // CLOUD: si está, también lo subo (el snapshot reemplazará la lista y evita duplicados)
  cloudEnqueue(() => cloudAgregarParcial({ turno, operador, objetivoTurno, botellas }).catch(()=>{}));
}
function borrarParcial(id){
  if(!confirm('¿Borrar este parcial?')) return;
  // LOCAL
  estado.parciales = estado.parciales.filter(x=>x.id!==id);
  save(); renderResumen(); renderParciales();
  // CLOUD
  cloudEnqueue(() => cloudBorrarParcial(id).catch(()=>{}));
}
function reiniciarCorrida(){
  if (!confirm('Esto borra Sabor, Formato, Objetivo y todos los parciales. ¿Continuar?')) return;
  // CLOUD primero (si está)
  cloudEnqueue(() => cloudReiniciarCorrida().catch(()=>{}));
  // LOCAL
  estado.corridaId = null; estado.sabor = ''; estado.formato = ''; estado.objetivoTotal = 0; estado.parciales = [];
  localStorage.removeItem(LS_KEY); localStorage.removeItem('ui_lastTurno');
  if (saborEl) saborEl.value = ''; if (formatoEl) formatoEl.value = ''; if (objetivoTotalEl) objetivoTotalEl.value = '';
  if (turnoEl) turnoEl.value = ''; if (operadorEl) operadorEl.value = ''; if (objetivoTurnoEl) objetivoTurnoEl.value = ''; if (botellasParcialEl) botellasParcialEl.value = '';
  renderAll();
}

/***** Dominio (TU VERSIÓN) *****/
function envasesPorPaquete(formato){
  const n = parseInt(String(formato || '').replace(/\D/g, ''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6;
}

/***** Eventos + Init (TU VERSIÓN) *****/
document.getElementById('btnReiniciar')?.addEventListener('click', reiniciarCorrida);
document.getElementById('btnGuardarCorrida').addEventListener('click', guardarCorrida);
document.getElementById('btnAgregarParcial').addEventListener('click', agregarParcial);
load(); renderAll();

/* ===================== CAPA CLOUD (FIRESTORE) ===================== */
/* Mejora progresiva + cola: si Firebase no está listo todavía, encolamos
   y cuando levante, ejecutamos todo (incluido publicar meta/actual). */

const cloud = {
  available: false,
  db: null,
  fns: null,
  unsubCorrida: null,
  unsubParciales: null,
  unsubMeta: null,
};
const cloudQueue = []; // funciones pendientes antes de que esté listo
function cloudEnqueue(fn){
  if (cloud.available) fn(); else cloudQueue.push(fn);
}

(async function bootCloud(){
  try{
    const cfg = await import('./firebase-config.js?v=13'); // debe existir y exportar db + onReadyAuth
    const f  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    cloud.db = cfg.db; cloud.fns = f; cloud.available = true;

    // Cuando haya usuario, arrancamos meta-listener
    cfg.onReadyAuth(async () => {
      startMetaListener();            // escucha meta/actual en tiempo real
      // Si no hay meta/actual pero sí hay corrida local, la publicamos
      await ensureMetaFromCloudOrLocal();
      // Flush de la cola (guardar corrida, parciales pendientes, etc.)
      while (cloudQueue.length) { const job = cloudQueue.shift(); try{ await job(); }catch{} }
    });
  }catch(e){
    console.info('Cloud no disponible, sigue local:', e?.message || e);
  }
})();

function stopCorridaListeners(){
  cloud.unsubCorrida && cloud.unsubCorrida(); cloud.unsubCorrida = null;
  cloud.unsubParciales && cloud.unsubParciales(); cloud.unsubParciales = null;
}
function startCorridaListeners(corridaId){
  stopCorridaListeners();
  if (!cloud.available || !corridaId) return;

  const { doc, onSnapshot, collection, query, orderBy } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  cloud.unsubCorrida = onSnapshot(corridaRef, (snap) => {
    if (!snap.exists()){
      // si borraron la corrida en la nube, no forcemos local
      return;
    }
    const data = snap.data();
    estado.corridaId = corridaId;
    estado.sabor = data.sabor || '';
    estado.formato = data.formato || '';
    estado.objetivoTotal = Number(data.objetivoTotal)||0;
    save(); renderHeader(); renderResumen();
  });

  const q = query(parcialesRef, orderBy('ts','asc'));
  cloud.unsubParciales = onSnapshot(q, (qs) => {
    estado.parciales = qs.docs.map(d => {
      const x = d.data();
      const tsMs = x.ts?.toMillis ? x.ts.toMillis() : (x.ts || Date.now());
      return { id: d.id, ...x, ts: tsMs };
    });
    save(); renderResumen(); renderParciales();
  });
}

function startMetaListener(){
  if (!cloud.available) return;
  const { doc, onSnapshot } = cloud.fns;
  const metaRef = doc(cloud.db, 'meta', 'actual');
  cloud.unsubMeta && cloud.unsubMeta();
  cloud.unsubMeta = onSnapshot(metaRef, (snap) => {
    const newId = snap.exists() ? (snap.data().corridaId || null) : null;
    if (newId) startCorridaListeners(newId);
  }, (e)=>console.error('meta/actual:', e));
}

async function ensureMetaFromCloudOrLocal(){
  if (!cloud.available) return;
  const { doc, getDoc } = cloud.fns;
  const metaRef = doc(cloud.db, 'meta', 'actual');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data().corridaId) {
    // ya hay puntero global, listo
    startCorridaListeners(metaSnap.data().corridaId);
  } else if (estado.corridaId) {
    // publicar corrida local como actual
    await cloudGuardarCorrida();
  }
}

/* ====== escrituras en cloud ====== */
async function cloudGuardarCorrida(){
  if (!cloud.available || !estado.corridaId) return;
  const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = cloud.fns;
  const id = estado.corridaId;
  const corridaRef = doc(cloud.db, 'corridas', id);
  const snap = await getDoc(corridaRef);
  if (snap.exists()){
    await updateDoc(corridaRef, {
      sabor: estado.sabor,
      formato: estado.formato,
      objetivoTotal: Number(estado.objetivoTotal)||0,
      updatedAt: serverTimestamp()
    });
  } else {
    await setDoc(corridaRef, {
      sabor: estado.sabor,
      formato: estado.formato,
      objetivoTotal: Number(estado.objetivoTotal)||0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  // puntero global
  await setDoc(doc(cloud.db, 'meta', 'actual'), {
    corridaId: id, updatedAt: serverTimestamp()
  }, { merge: true });
  // listeners (por si aún no llegaron por meta)
  startCorridaListeners(id);
}

async function cloudAgregarParcial({ turno, operador, objetivoTurno, botellas }){
  if (!cloud.available || !estado.corridaId) return;
  const { doc, collection, addDoc, serverTimestamp, updateDoc } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');
  await addDoc(parcialesRef, {
    ts: serverTimestamp(),
    turno, operador, objetivoTurno, botellas
  });
  await updateDoc(corridaRef, { updatedAt: serverTimestamp() });
}

async function cloudBorrarParcial(id){
  if (!cloud.available || !estado.corridaId) return;
  const { doc, deleteDoc } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  await deleteDoc(doc(corridaRef, 'parciales', id));
}

async function cloudReiniciarCorrida(){
  if (!cloud.available || !estado.corridaId) return;
  const { doc, collection, getDocs, writeBatch, deleteDoc, setDoc, serverTimestamp } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');
  const snap = await getDocs(parcialesRef);
  const batch = writeBatch(cloud.db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(corridaRef);
  await setDoc(doc(cloud.db, 'meta', 'actual'), { corridaId: '', updatedAt: serverTimestamp() }, { merge: true });
}

// ===== Toggle de tema global junto al título =====
(function(){
  const THEME_KEY = 'ui_theme'; // 'light' | 'dark' | null (seguir sistema)
  const root = document.documentElement;

  // Crea fila de título y botón “Claro/Oscuro” al lado del H1
  const wrap = document.querySelector('.wrap');
  const h1   = wrap?.querySelector('h1');
  if (!wrap || !h1) return;

  // Contenedor flex
  const row = document.createElement('div');
  row.className = 'title-row';
  h1.parentNode.insertBefore(row, h1); // insertar fila antes del h1
  row.appendChild(h1);
  // Evita que "Línea 1" se separe en dos líneas
  h1.innerHTML = h1.innerHTML.replace(/L[ií]nea 1/, m => m.replace(' ', '&nbsp;'));
                 // mover h1 dentro

  // Botón
  const btn = document.createElement('button');
  btn.id = 'themeToggleTop';
  btn.className = 'theme-btn';
  btn.type = 'button';
  btn.textContent = 'Claro'; // se actualiza luego
  row.appendChild(btn);

  function isDarkNow(mode){
    return mode ? (mode === 'dark')
                : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(mode){ // 'light' | 'dark' | null
    if(mode === 'dark'){
      root.setAttribute('data-theme','dark');
    }else if(mode === 'light'){
      root.setAttribute('data-theme','light');
    }else{
      root.removeAttribute('data-theme'); // seguir sistema
    }
    updateBtn(mode);
  }

  function updateBtn(mode){
    const dark = isDarkNow(mode);
    btn.textContent = dark ? 'Oscuro' : 'Claro';
    btn.setAttribute('aria-label', `Cambiar a ${dark ? 'claro' : 'oscuro'}`);
    btn.title = btn.getAttribute('aria-label');
  }

  // Init: preferencia guardada o sistema
  const saved = localStorage.getItem(THEME_KEY); // 'light' | 'dark' | null
  applyTheme(saved || null);

  // Si está en “auto” (sin preferencia guardada), reflejar cambios del sistema
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(null);
  });

  // Toggle manual: alterna entre claro/oscuro (si querés, luego agregamos un 3er estado “Auto”)
  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme'); // 'light' | 'dark' | null
    const next = (current === 'dark') ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
})();
