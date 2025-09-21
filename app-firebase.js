// app-firebase.js
import { app, db, onReadyAuth } from './firebase-config.js';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/***** Estado (igual UI) *****/
const estado = {
  corridaId: null,  // SABOR_FORMATO_YYYY-MM-DD
  sabor: '', formato: '', objetivoTotal: 0,
  parciales: []     // {id, tsMs, turno, operador, objetivoTurno (cajas), botellas}
};
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

/***** Helpers dominio *****/
// Envases por paquete según formato
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
    const bot = Number(p.botellas) || 0;           // botellas realizadas
    const cajasHechas = uxp > 0 ? bot / uxp : 0;   // botellas → cajas
    const cajasObj = Number(p.objetivoTurno) || 0; // objetivo en CAJAS
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

/***** Listeners Firestore *****/
let unsubCorrida = null;
let unsubParciales = null;

function stopListeners(){
  unsubCorrida && unsubCorrida(); unsubCorrida = null;
  unsubParciales && unsubParciales(); unsubParciales = null;
}

async function startListeners(){
  stopListeners();
  if (!estado.corridaId) { renderHeader(); renderResumen(); renderParciales(); return; }

  const corridaRef = doc(db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  // Doc principal
  unsubCorrida = (await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"))
    .onSnapshot(corridaRef, (snap) => {
      if (!snap.exists()) return; // eliminada
      const data = snap.data();
      estado.sabor = data.sabor || '';
      estado.formato = data.formato || '';
      estado.objetivoTotal = Number(data.objetivoTotal) || 0;
      renderHeader(); renderResumen();
    });

  // Subcolección en tiempo real (orden por tsMs)
  const q = query(parcialesRef, orderBy('tsMs','asc'));
  unsubParciales = (await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"))
    .onSnapshot(q, (qs) => {
      estado.parciales = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      renderResumen(); renderParciales();
    });
}

/***** Acciones (Firestore) *****/
async function guardarCorrida(){
  const sabor   = (saborEl.value||'').trim();
  const formato = (formatoEl.value||'').trim();
  const obj     = Number(objetivoTotalEl.value);

  if(!sabor || !formato || !(obj>0)){
    alert('Completá Sabor, Formato y un Objetivo total > 0.'); return;
  }
  const id = `${sabor.replace(/\s+/g,'')}_${formato.replace(/\s+/g,'')}_${hoyISO()}`;
  const corridaRef = doc(db, 'corridas', id);

  await setDoc(corridaRef, {
    sabor, formato, objetivoTotal: obj,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }, { merge: true });

  estado.corridaId = id;
  // limpiar UI
  objetivoTotalEl.value = '';
  startListeners();
}

async function agregarParcial(){
  if(!estado.corridaId){ alert('Primero guardá la corrida.'); return; }

  const turno = (turnoEl.value||'').trim();
  const operador = (operadorEl.value||'').trim();
  const objetivoTurno = Number(objetivoTurnoEl.value); // CAJAS pedidas
  const botellas = Number(botellasParcialEl.value);    // BOTELLAS realizadas

  if(!turno || !operador || !(objetivoTurno>0) || !(botellas>=0)){
    alert('Completá Turno, Operador, Objetivo de turno (>0, CAJAS) y Botellas (≥0).'); return;
  }

  const corridaRef = doc(db, 'corridas', estado.corridaId);
  const parcialesRef = collection(corridaRef, 'parciales');

  await addDoc(parcialesRef, {
    ts: serverTimestamp(),
    tsMs: Date.now(),          // orden estable inmediato
    turno, operador,
    objetivoTurno,             // CAJAS
    botellas                   // BOTELLAS
  });

  // limpiar inputs de parcial (mantené el turno si querés)
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

  // borrar subcolección por batch
  const snap = await getDocs(parcialesRef);
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();

  await deleteDoc(corridaRef);

  // limpiar estado/UI
  estado.corridaId = null;
  estado.sabor = ''; estado.formato=''; estado.objetivoTotal = 0; estado.parciales = [];
  saborEl.value = ''; formatoEl.value=''; objetivoTotalEl.value=''; turnoEl.value=''; operadorEl.value=''; objetivoTurnoEl.value=''; botellasParcialEl.value='';
  stopListeners();
  renderHeader(); renderResumen(); renderParciales();
}

/***** Eventos + Init *****/
document.getElementById('btnGuardarCorrida').addEventListener('click', guardarCorrida);
document.getElementById('btnAgregarParcial').addEventListener('click', agregarParcial);
document.getElementById('btnReiniciar')?.addEventListener('click', reiniciarCorrida);

// Esperar auth y luego iniciar listeners (por si ya tenías una corrida en chips)
onReadyAuth(() => {
  // si dejaste chips visibles por local UI, respetamos eso; si no, mostramos ayuda
  renderHeader(); renderResumen(); renderParciales();
  // No arrancamos listeners hasta que guardes una corrida nueva (o podés setear estado.corridaId aquí si querés reabrir una).
});
