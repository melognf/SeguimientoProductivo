// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 👇 REEMPLAZÁ con tu config pegada desde Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyAGo5Ws1IiIUuO7rENTW0ysKTQw2BSBbGU",
  authDomain: "seguimientoproductivo.firebaseapp.com",
  projectId: "seguimientoproductivo",
  storageBucket: "seguimientoproductivo.firebasestorage.app",
  messagingSenderId: "23972978729",
  appId: "1:23972978729:web:b999ef05f66a79a0acfc38"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Offline cache (si falla por multi-tabs, lo ignoramos sin romper)
enableIndexedDbPersistence(db).catch(()=>{});

// Login anónimo inmediato
signInAnonymously(auth);

// Helper para saber cuándo hay usuario
export function onReadyAuth(cb){
  onAuthStateChanged(auth, (user) => { if (user) cb(user); });
}

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
