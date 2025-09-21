/***** Estado + storage (SAME que tu versión) *****/
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

/***** UI refs (SAME) *****/
const saborEl = $('#sabor'), formatoEl = $('#formato'), objetivoTotalEl = $('#objetivoTotal'), corridaInfoEl = $('#corridaInfo');
const turnoEl = $('#turno'), operadorEl = $('#operador'), objetivoTurnoEl = $('#objetivoTurno'), botellasParcialEl = $('#botellasParcial');
const barraEl = $('#barra'), vObjetivoEl = $('#vObjetivo'), vAcumuladoEl = $('#vAcumulado'), vRestanteEl = $('#vRestante'), listaParcialesEl = $('#listaParciales');

/***** Render (SAME) *****/
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
  const uxp = envasesPorPaquete(estado.formato); // envases por paquete de la corrida actual
  const ordenados = [...estado.parciales].sort((a,b)=> a.ts - b.ts);

  for (const p of ordenados){
    const row = document.createElement('div');
    row.className = 'row';

    const fecha = new Date(p.ts).toLocaleString('es-AR',{hour12:false});
    const bot = Number(p.botellas) || 0;          // botellas realizadas
    const cajasHechas = uxp > 0 ? bot / uxp : 0;  // botellas → cajas
    const cajasObj = Number(p.objetivoTurno) || 0; // objetivo del turno en CAJAS
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
      <span>
        <span class="pct-chip ${chipCls}" title="${fmt(cajasHechas)} / ${fmt(cajasObj)} cajas">
          ${pctTurno}%
        </span>
      </span>
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

  // si cloud está disponible, también guarda y publica puntero global
  cloudGuardarCorrida().catch(()=>{}); // no rompe si falla
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

  // si cloud está activo, solo escribimos en cloud (el snapshot actualizará la UI)
  if (cloud.enabled) {
    cloudAgregarParcial({ turno, operador, objetivoTurno, botellas }).catch(()=>{});
  } else {
    // local solamente
    estado.parciales.push({ id: crypto.randomUUID(), ts: Date.now(), turno, operador, objetivoTurno, botellas });
    save();
    operadorEl.value=''; botellasParcialEl.value='';
    renderResumen(); renderParciales();
  }
}

function borrarParcial(id){
  if(!confirm('¿Borrar este parcial?')) return;

  if (cloud.enabled) {
    cloudBorrarParcial(id).catch(()=>{});
  } else {
    estado.parciales = estado.parciales.filter(x=>x.id!==id);
    save(); renderResumen(); renderParciales();
  }
}

function reiniciarCorrida(){
  if (!confirm('Esto borra Sabor, Formato, Objetivo y todos los parciales. ¿Continuar?')) return;

  if (cloud.enabled) {
    cloudReiniciarCorrida().catch(()=>{});
  }

  // local: limpiar estado
  estado.corridaId = null;
  estado.sabor = '';
  estado.formato = '';
  estado.objetivoTotal = 0;
  estado.parciales = [];
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem('ui_lastTurno');

  if (saborEl) saborEl.value = '';
  if (formatoEl) formatoEl.value = '';
  if (objetivoTotalEl) objetivoTotalEl.value = '';
  if (turnoEl) turnoEl.value = '';
  if (operadorEl) operadorEl.value = '';
  if (objetivoTurnoEl) objetivoTurnoEl.value = '';
  if (botellasParcialEl) botellasParcialEl.value = '';

  renderAll();
}

/***** Dominio *****/
function envasesPorPaquete(formato){
  const n = parseInt(String(formato || '').replace(/\D/g, ''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6; // default seguro
}

/***** Eventos + Init (SAME) *****/
document.getElementById('btnReiniciar')?.addEventListener('click', reiniciarCorrida);
document.getElementById('btnGuardarCorrida').addEventListener('click', guardarCorrida);
document.getElementById('btnAgregarParcial').addEventListener('click', agregarParcial);
load(); renderAll();

/* ===================== CAPA CLOUD (Firestore) ===================== */
/*  Mejora progresiva: si firebase-config.js está y las reglas lo permiten,
    sincroniza en tiempo real entre dispositivos. Si falla, la app sigue local. */

const cloud = {
  available: false,    // hay Firebase disponible
  enabled:   false,    // tenemos listeners activos sobre una corrida
  db: null,
  // funciones de firestore
  fns: null,
  // unsub
  unsubCorrida: null,
  unsubParciales: null,
  unsubMeta: null,
};

async function bootCloud(){
  try{
    // traemos config (tu archivo) y las funciones de Firestore
    const cfg = await import('./firebase-config.js');
    const f  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    cloud.db  = cfg.db;
    cloud.fns = f;
    cloud.available = true;

    // cuando hay auth, escuchamos el puntero global meta/actual
    cfg.onReadyAuth(() => {
      startMetaListener();
    });
  }catch(e){
    console.info('Cloud deshabilitado (sigue local):', e?.message || e);
  }
}

function stopCorridaListeners(){
  cloud.unsubCorrida && cloud.unsubCorrida(); cloud.unsubCorrida = null;
  cloud.unsubParciales && cloud.unsubParciales(); cloud.unsubParciales = null;
  cloud.enabled = false;
}

function startCorridaListeners(corridaId){
  stopCorridaListeners();

  if (!corridaId){
    cloud.enabled = false;
    return;
  }

  const { doc, onSnapshot, collection, query, orderBy } = cloud.fns;

  const corridaRef   = doc(cloud.db, 'corridas', corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  // doc principal
  cloud.unsubCorrida = onSnapshot(corridaRef, (snap) => {
    if (!snap.exists()){
      // corrida borrada en otro equipo
      estado.corridaId = null; estado.sabor=''; estado.formato=''; estado.objetivoTotal=0; estado.parciales=[];
      save(); renderAll();
      return;
    }
    const data = snap.data();
    estado.corridaId   = corridaId;
    estado.sabor       = data.sabor || '';
    estado.formato     = data.formato || '';
    estado.objetivoTotal = Number(data.objetivoTotal) || 0;
    save(); renderHeader(); renderResumen();
  }, console.error);

  // subcolección
  const q = query(parcialesRef, orderBy('ts','asc'));
  cloud.unsubParciales = onSnapshot(q, (qs) => {
    estado.parciales = qs.docs.map(d => {
      const x = d.data();
      // normalizamos ts para que tu UI siga usando 'ts' en ms (no rompe nada)
      return { id: d.id, ...x, ts: x.ts?.toMillis ? x.ts.toMillis() : (x.ts || Date.now()) };
    });
    save(); renderResumen(); renderParciales();
  }, console.error);

  cloud.enabled = true;
}

function startMetaListener(){
  const { doc, onSnapshot } = cloud.fns;
  const metaRef = doc(cloud.db, 'meta', 'actual');
  cloud.unsubMeta && cloud.unsubMeta();
  cloud.unsubMeta = onSnapshot(metaRef, (snap) => {
    const newId = snap.exists() ? (snap.data().corridaId || null) : null;
    if (newId !== estado.corridaId){
      startCorridaListeners(newId);
    }
  }, (e)=>console.error('meta/actual', e));
}

/* ====== escrituras en cloud (no rompen si falla) ====== */
async function cloudGuardarCorrida(){
  if (!cloud.available) return;

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
  }else{
    await setDoc(corridaRef, {
      sabor: estado.sabor,
      formato: estado.formato,
      objetivoTotal: Number(estado.objetivoTotal)||0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  // publicar puntero global
  await setDoc(doc(cloud.db, 'meta', 'actual'), {
    corridaId: id,
    updatedAt: serverTimestamp()
  }, { merge: true });

  // activamos listeners (el meta listener lo hace también, pero por si tarda)
  startCorridaListeners(id);
}

async function cloudAgregarParcial({ turno, operador, objetivoTurno, botellas }){
  const { doc, collection, addDoc, serverTimestamp, updateDoc } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');
  await addDoc(parcialesRef, {
    ts: serverTimestamp(),
    turno, operador,
    objetivoTurno, botellas
  });
  await updateDoc(corridaRef, { updatedAt: serverTimestamp() });
  operadorEl.value=''; botellasParcialEl.value='';
}

async function cloudBorrarParcial(id){
  const { doc, deleteDoc } = cloud.fns;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  await deleteDoc(doc(corridaRef, 'parciales', id));
}

async function cloudReiniciarCorrida(){
  const { doc, collection, getDocs, writeBatch, deleteDoc, setDoc, serverTimestamp } = cloud.fns;
  if (!estado.corridaId) return;
  const corridaRef = doc(cloud.db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');
  const snap = await getDocs(parcialesRef);
  const batch = writeBatch(cloud.db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(corridaRef);
  await setDoc(doc(cloud.db, 'meta', 'actual'), { corridaId: '', updatedAt: serverTimestamp() }, { merge: true });
}

/* ====== levantar capa cloud al final (si existe firebase-config.js) ====== */
bootCloud();
