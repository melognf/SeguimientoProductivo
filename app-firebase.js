// app-firebase.js
import { app, db, onReadyAuth } from './firebase-config.js';
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
  unsubCorrida = onSnapshot(corridaRef, (snap) => {
    if (!snap.exists()) return; // eliminada
    const data = snap.data();
    estado.sabor = data.sabor || '';
    estado.formato = data.formato || '';
    estado.objetivoTotal = Number(data.objetivoTotal) || 0;
    renderHeader(); renderResumen();
  });

  // Subcolección en tiempo real (orden por tsMs)
  const q = query(parcialesRef, orderBy('tsMs','asc'));
  unsubParciales = onSnapshot(q, (qs) => {
    estado.parciales = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    renderResumen(); renderParciales();
  });
}

/***** Puntero global a corrida actual *****/
async function abrirCorridaActual(){
  try{
    const metaRef = doc(db, 'meta', 'actual');
    const snap = await getDoc(metaRef);
    if (snap.exists()){
      const { corridaId } = snap.data();
      estado.corridaId = corridaId || null;
    } else {
      estado.corridaId = null;
    }
  }catch(e){
    console.error('No se pudo leer meta/actual:', e);
    estado.corridaId = null;
  }
  startListeners();
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
      // UPDATE (no tocamos createdAt)
      await updateDoc(corridaRef, {
        sabor, formato, objetivoTotal: obj,
        updatedAt: serverTimestamp()
      });
    } else {
      // CREATE (con createdAt)
      await setDoc(corridaRef, {
        sabor, formato, objetivoTotal: obj,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // Puntero global a la corrida actual (para abrirla en otros dispositivos)
    await setDoc(doc(db, 'meta', 'actual'), {
      corridaId: id,
      updatedAt: serverTimestamp()
    }, { merge: true });

    estado.corridaId = id;
    objetivoTotalEl.value = '';   // limpiar input si querés
    startListeners();             // engancha listeners en tiempo real
  }catch(err){
    console.error('Error guardando corrida:', err);
    alert(
      'No se pudo guardar el objetivo.\n' +
      'Posibles causas:\n' +
      '• Reglas de Firestore\n' +
      '• App Check en “Aplicar/Enforce” sin configurar claves\n' +
      '• Dominio no autorizado en Authentication → Settings → Authorized domains'
    );
  }
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

  // mantener "reciente" la corrida
  await updateDoc(corridaRef, { updatedAt: serverTimestamp() });

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

  // actualizar puntero global a "sin corrida"
  await setDoc(doc(db, 'meta', 'actual'), {
    corridaId: '',  // vacío → abrirá nada
    updatedAt: serverTimestamp()
  }, { merge: true });

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

// Al tener auth, abrimos automáticamente la corrida actual (si existe)
onReadyAuth(() => {
  abrirCorridaActual();
});

/************** PDF: libs on-demand + generación + compartir **************/
async function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar: ' + src));
    document.head.appendChild(s);
  });
}

async function ensurePDFLibs(){
  // UMD globals: window.jspdf.jsPDF y doc.autoTable
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  if (!window.Chart) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js');
  }
  return window.jspdf.jsPDF;
}

// === LOGO ===
// Cambiá esta ruta si tu carpeta se llama "licons"
const LOGO_PATH = 'icons/l1-logo-512.png';

let _logoDataURL = null;
async function getLogoDataURL(){
  if (_logoDataURL) return _logoDataURL;
  // Traemos el PNG y lo convertimos a dataURL (evita problemas de CORS)
  const res = await fetch(LOGO_PATH, { cache: 'force-cache' });
  if (!res.ok) throw new Error('No se pudo cargar el logo en ' + LOGO_PATH);
  const blob = await res.blob();
  _logoDataURL = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
  return _logoDataURL;
}

function makeAvanceChartImage(parcialesOrdenados){
  const cvs = document.createElement('canvas');
  cvs.width = 900; cvs.height = 420;
  const ctx = cvs.getContext('2d');

  let acum = 0;
  const labels = [];
  const data = parcialesOrdenados.map(p => {
    labels.push(new Date(p.tsMs || Date.now()).toLocaleString('es-AR', { hour12:false }));
    acum += Number(p.botellas || 0);
    return acum;
  });

  const chart = new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Acumulado (botellas)', data, tension: 0.3 }] },
    options: {
      responsive: false,
      plugins: { legend: { display: true }, title: { display: true, text: 'Avance de producción (acumulado)' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const url = cvs.toDataURL('image/png');
  chart.destroy();
  return url;
}

function asCajas(botellas, formato){
  const n = parseInt(String(formato || '').replace(/\D/g,''), 10);
  const uxp = (n === 1500) ? 4 : 6;   // 300/500/995 → 6 ; 1500 → 4
  return (uxp > 0) ? botellas / uxp : 0;
}

async function generarPDF(){
  const jsPDF = await ensurePDFLibs();
  const doc = new jsPDF({ unit:'mm', format:'a4', compress:true });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // === Encabezado con LOGO ===
  try{
    const logo = await getLogoDataURL();
    const w = 18; // ancho del logo en mm
    const h = 18;
    doc.addImage(logo, 'PNG', pageW - marginX - w, 10, w, h, undefined, 'FAST');
  }catch(e){
    console.warn('Logo no disponible:', e);
  }

  // Título
  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('Control de Producción — Línea 1', marginX, 18);

  // Datos de corrida
  doc.setFontSize(11);
  doc.setFont('helvetica','normal');
  if(!estado.corridaId){
    doc.text('Sin corrida activa: definí Sabor/Formato/Objetivo y guardá.', marginX, 26);
    return descargarOCompartir(doc, 'produccion_sin_corrida.pdf');
  }

  const resumenY = 28;
  doc.text(`Corrida: ${estado.corridaId}`, marginX, resumenY);
  doc.text(`Sabor: ${estado.sabor}`, marginX, resumenY+6);
  doc.text(`Formato: ${estado.formato}`, marginX, resumenY+12);

  // Resumen numérico
  const objetivo = Number(estado.objetivoTotal)||0;
  const acumuladoBot = estado.parciales.reduce((a,p)=>a+Number(p.botellas||0),0);
  const restante = Math.max(objetivo - acumuladoBot, 0);
  const pct = objetivo>0 ? Math.min(100, Math.round(acumuladoBot*100/objetivo)) : 0;

  const fmtAR = (n)=> new Intl.NumberFormat('es-AR').format(n);
  doc.text(`Objetivo total (botellas): ${fmtAR(objetivo)}`, 110, resumenY);
  doc.text(`Acumulado (botellas): ${fmtAR(acumuladoBot)}`, 110, resumenY+6);
  doc.text(`Restante (botellas): ${fmtAR(restante)}  —  Progreso: ${pct}%`, 110, resumenY+12);

  let y = resumenY + 20;

  // Gráfico
  const ordenados = [...estado.parciales].sort((a,b)=> (a.tsMs||0)-(b.tsMs||0));
  if (ordenados.length > 0){
    const chartImg = makeAvanceChartImage(ordenados);
    const imgW = pageW - marginX*2;
    const imgH = 70;
    doc.addImage(chartImg, 'PNG', marginX, y, imgW, imgH);
    y += imgH + 6;
  }

  // Tabla
  const body = ordenados.map(p => {
    const bot = Number(p.botellas)||0;
    const cajasHechas = asCajas(bot, estado.formato);
    const cajasObj = Number(p.objetivoTurno)||0;
    const pctTurno = cajasObj>0 ? Math.round((cajasHechas*100)/cajasObj) : 0;
    return [
      new Date(p.tsMs||Date.now()).toLocaleString('es-AR',{hour12:false}),
      p.turno||'',
      p.operador||'',
      fmtAR(cajasObj),
      fmtAR(bot),
      fmtAR(Math.round(cajasHechas)),
      `${pctTurno}%`
    ];
  });

  if (body.length > 0){
    doc.autoTable({
      startY: y,
      head: [['Fecha/Hora','Turno','Operador','Obj. (cajas)','Botellas','Cajas','% Cumpl.']],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [17,112,214] },
      theme: 'grid',
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Pie
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('Exportado desde la app — Cliente (jsPDF).', marginX, y);

  const nombre = `produccion_${estado.corridaId}.pdf`;
  await descargarOCompartir(doc, nombre);
}

// Compartir si el navegador lo permite; si no, descargar
async function descargarOCompartir(doc, filename){
  // jsPDF → Blob
  const blob = doc.output('blob');

  // Web Share API (solo en https/localhost y en móviles/desktop nuevos)
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try{
      await navigator.share({
        files: [file],
        title: 'L1 Producción',
        text: 'Reporte de producción'
      });
      return; // listo
    }catch(e){
      // Si cancela o falla, seguimos al fallback
      console.warn('Share cancelado/falló, descargando...', e);
    }
  }

  // Fallback: descarga
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Listener del botón
document.getElementById('btnPDF')?.addEventListener('click', generarPDF);
