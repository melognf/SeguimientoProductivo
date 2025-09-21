// app-firebase.js
import { db, onReadyAuth } from './firebase-config.js';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, writeBatch, serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/***** Estado *****/
const estado = {
  corridaId: null,  // SABOR_FORMATO_YYYY-MM-DD
  sabor: '', formato: '', objetivoTotal: 0,
  parciales: []     // {id, tsMs, turno, operador, objetivoTurno (cajas), botellas}
};
// expongo el estado para futuros módulos (PDF, etc.)
window.__estado = estado;

const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat('es-AR').format(n);
const hoyISO = () => {
  const d = new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

/***** UI refs *****/
const saborEl = $('#sabor'), formatoEl = $('#formato'), objetivoTotalEl = $('#objetivoTotal'), corridaInfoEl = $('#corridaInfo');
const turnoEl = $('#turno'), operadorEl = $('#operador'), objetivoTurnoEl = $('#objetivoTurno'), botellasParcialEl = $('#botellasParcial');
const barraEl = $('#barra'), vObjetivoEl = $('#vObjetivo'), vAcumuladoEl = $('#vAcumulado'), vRestanteEl = $('#vRestante'), listaParcialesEl = $('#listaParciales');

/***** Dominio *****/
function envasesPorPaquete(formato){
  const n = parseInt(String(formato || '').replace(/\D/g,''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6; // default
}

/***** Render *****/
function renderHeader(){
  if(!estado.corridaId){
    corridaInfoEl.textContent = 'Definí Sabor, Formato y Objetivo total; luego “Guardar objetivo”.';
    return;
  }
  const uxp = envasesPorPaquete(estado.formato);
  corridaInfoEl.innerHTML = `
    <span class="corrida-badge">Sabor: ${estado.sabor}</span>
    <span class="corrida-badge">Formato: ${estado.formato}</span>
    <span class="corrida-badge">Env/paquete: ${uxp}</span>
    <span class="corrida-badge id">${estado.corridaId}</span>
  `;
}

function renderResumen(){
  const objetivo = Number(estado.objetivoTotal)||0;
  const acumulado = estado.parciales.reduce((a,p)=> a + Number(p.botellas||0), 0);
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
  const ordenados = [...estado.parciales].sort((a,b)=> (a.tsMs||0) - (b.tsMs||0));

  for (const p of ordenados){
    const row = document.createElement('div');
    row.className = 'row';

    const fecha = new Date(p.tsMs || Date.now()).toLocaleString('es-AR',{hour12:false});
    const bot = Number(p.botellas) || 0;
    const cajasHechas = uxp > 0 ? bot / uxp : 0;
    const cajasObj = Number(p.objetivoTurno) || 0;
    const pctTurno = cajasObj > 0 ? Math.round((cajasHechas * 100) / cajasObj) : 0;

    const chipCls   = (pctTurno >= 58) ? 'ok' : 'bad';
    const rowState  = (pctTurno >= 58) ? 'state-ok' : 'state-bad';
    row.classList.add(rowState);

    row.innerHTML = `
      <span>${fecha}</span>
      <span>${p.turno}</span>
      <span>${p.operador}</span>
      <span>${fmt(cajasObj)}</span>
      <span>${fmt(bot)}</span>
      <span><span class="pct-chip ${chipCls}" title="${fmt(cajasHechas)} / ${fmt(cajasObj)} cajas">${pctTurno}%</span></span>
      <span><button class="btn warn" data-id="${p.id}">Borrar</button></span>
    `;
    row.querySelector('button').addEventListener('click', () => borrarParcial(p.id));
    listaParcialesEl.appendChild(row);
  }
}

/***** Listeners Firestore (corrida y parciales) *****/
let unsubCorrida = null;
let unsubParciales = null;
let unsubMeta = null;

function stopCorridaListeners(){
  unsubCorrida && unsubCorrida(); unsubCorrida = null;
  unsubParciales && unsubParciales(); unsubParciales = null;
}

function startCorridaListeners(corridaId){
  stopCorridaListeners();
  estado.corridaId = corridaId || null;

  if (!estado.corridaId){
    estado.sabor=''; estado.formato=''; estado.objetivoTotal=0; estado.parciales=[];
    renderHeader(); renderResumen(); renderParciales();
    return;
  }

  const corridaRef = doc(db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  // Doc principal
  unsubCorrida = onSnapshot(corridaRef, (snap) => {
    if (!snap.exists()) {
      // si borraron la corrida, limpiamos
      startCorridaListeners(null);
      return;
    }
    const data = snap.data();
    estado.sabor = data.sabor || '';
    estado.formato = data.formato || '';
    estado.objetivoTotal = Number(data.objetivoTotal) || 0;
    renderHeader(); renderResumen();
  });

  // Subcolección en tiempo real
  const q = query(parcialesRef, orderBy('tsMs','asc'));
  unsubParciales = onSnapshot(q, (qs) => {
    estado.parciales = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    renderResumen(); renderParciales();
  });
}

/***** Listener del puntero global meta/actual (multi-dispositivo) *****/
function startMetaListener(){
  // Escuchamos cambios en meta/actual: si cambia la corrida en un equipo, se abre sola en los demás
  const metaRef = doc(db, 'meta', 'actual');
  unsubMeta && unsubMeta(); // por las dudas
  unsubMeta = onSnapshot(metaRef, (snap) => {
    const newId = snap.exists() ? (snap.data().corridaId || null) : null;
    if (newId !== estado.corridaId) {
      startCorridaListeners(newId);
    }
    // si no existe el doc → quedamos sin corrida abierta
    if (!snap.exists()) {
      startCorridaListeners(null);
    }
  }, (err) => {
    console.error('onSnapshot meta/actual:', err);
    // si falla por reglas, al menos dejamos la UI limpia
    startCorridaListeners(null);
  });
}

/***** Acciones (Firestore) *****/
async function guardarCorrida(){
  const sabor   = (saborEl.value||'').trim();
  const formato = (formatoEl.value||'').trim();
  const obj     = Number(objetivoTotalEl.value);

  if(!sabor || !formato || !(obj>0)){
    alert('Completá Sabor, Formato y un Objetivo total > 0.');
    return;
  }

  const id = `${sabor.replace(/\s+/g,'')}_${formato.replace(/\s+/g,'')}_${hoyISO()}`;
  const corridaRef = doc(db, 'corridas', id);

  try{
    const snap = await getDoc(corridaRef);
    if (snap.exists()) {
      await updateDoc(corridaRef, { sabor, formato, objetivoTotal: obj, updatedAt: serverTimestamp() });
    } else {
      await setDoc(corridaRef, { sabor, formato, objetivoTotal: obj, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }

    // actualizamos el puntero global (esto sincroniza a todos los dispositivos)
    await setDoc(doc(db, 'meta', 'actual'), { corridaId: id, updatedAt: serverTimestamp() }, { merge: true });

    // No llamamos a startCorridaListeners acá: el meta-listener lo hará en todos los equipos
    objetivoTotalEl.value = '';
  }catch(err){
    console.error('Error guardando corrida:', err);
    alert('No se pudo guardar el objetivo. Revisá Reglas/AppCheck/Dominios autorizados.');
  }
}

async function agregarParcial(){
  if(!estado.corridaId){ alert('Primero guardá la corrida.'); return; }

  const turno = (turnoEl.value||'').trim();
  const operador = (operadorEl.value||'').trim();
  const objetivoTurno = Number(objetivoTurnoEl.value);
  const botellas = Number(botellasParcialEl.value);

  if(!turno || !operador || !(objetivoTurno>0) || !(botellas>=0)){
    alert('Completá Turno, Operador, Objetivo de turno (>0, CAJAS) y Botellas (≥0).'); return;
  }

  const corridaRef = doc(db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  await addDoc(parcialesRef, {
    ts: serverTimestamp(),
    tsMs: Date.now(),
    turno, operador,
    objetivoTurno,
    botellas
  });

  // toque para “despertar” listas recientes si las usás
  await updateDoc(corridaRef, { updatedAt: serverTimestamp() });

  operadorEl.value = '';
  botellasParcialEl.value = '';
}

async function borrarParcial(parcialId){
  if(!confirm('¿Borrar este parcial?')) return;
  const corridaRef = doc(db, 'corridas', estado.corridaId);
  await deleteDoc(doc(corridaRef, 'parciales', parcialId));
}

async function reiniciarCorrida(){
  if (!estado.corridaId) return;
  const ok = confirm('Esto borra Sabor, Formato, Objetivo y TODOS los parciales en Firestore. ¿Continuar?');
  if (!ok) return;

  const corridaRef = doc(db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  const snap = await getDocs(parcialesRef);
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(corridaRef);

  // puntero a “sin corrida”
  await setDoc(doc(db, 'meta', 'actual'), { corridaId: '', updatedAt: serverTimestamp() }, { merge: true });
}

/***** Eventos + Init *****/
document.getElementById('btnGuardarCorrida').addEventListener('click', guardarCorrida);
document.getElementById('btnAgregarParcial').addEventListener('click', agregarParcial);
document.getElementById('btnReiniciar')?.addEventListener('click', reiniciarCorrida);

// Al tener auth, arrancamos el listener del puntero global
onReadyAuth(() => { startMetaListener(); });

// Render inicial (por si no hay corrida aún)
renderHeader(); renderResumen(); renderParciales();
