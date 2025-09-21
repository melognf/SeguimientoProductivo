// pdf-export.js — SOLO lee el DOM y genera/compartir PDF.
// Fix: Chart.js con animation:false (render inmediato) y línea de objetivo correcta.

function loadScriptOnce(src){
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
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  if (!window.Chart) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js');
  }
  return window.jspdf.jsPDF;
}

function toNumber(str){
  if (str == null) return 0;
  const s = String(str).trim().replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// === Logo ===
const LOGO_PATH = 'icons/l1-logo-512.png';
let _logoDataURL = null;
async function getLogoDataURL(){
  if (_logoDataURL) return _logoDataURL;
  const res = await fetch(LOGO_PATH, { cache:'force-cache' });
  if (!res.ok) throw new Error('No se pudo cargar el logo');
  const blob = await res.blob();
  _logoDataURL = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
  return _logoDataURL;
}

function envasesPorPaquete(formato){
  const n = parseInt(String(formato||'').replace(/\D/g,''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6;
}

/* ---------- tomar datos desde el DOM ---------- */
function collectFromDOM(){
  const sabor = document.querySelector('#sabor')?.value || '';
  const formato = document.querySelector('#formato')?.value || '';

  const objetivo = toNumber(document.querySelector('#vObjetivo')?.textContent || '0');
  const acumulado = toNumber(document.querySelector('#vAcumulado')?.textContent || '0');
  const restante = toNumber(document.querySelector('#vRestante')?.textContent || '0');

  const rows = [...document.querySelectorAll('#listaParciales .row')];
  const parciales = rows.map(r => {
    const c = r.querySelectorAll('span'); // fecha, turno, operador, objCajas, botellas, chip, botón
    return {
      fechaTxt: c[0]?.textContent?.trim() || '',
      turno:    c[1]?.textContent?.trim() || '',
      operador: c[2]?.textContent?.trim() || '',
      objCajas: toNumber(c[3]?.textContent || '0'),
      botellas: toNumber(c[4]?.textContent || '0'),
      pctTxt:   c[5]?.textContent?.trim() || ''
    };
  });

  let corridaId = '';
  const chips = [...document.querySelectorAll('#corridaInfo .corrida-badge.id, #corridaInfo span')];
  for (const ch of chips) {
    const t = ch.textContent?.trim() || '';
    if (/_\d{4}-\d{2}-\d{2}$/.test(t)) { corridaId = t; break; }
  }

  return { sabor, formato, objetivo, acumulado, restante, parciales, corridaId };
}

/* ---------- gráfico 1: acumulado ---------- */
/* ---------- gráfico 1: acumulado + línea de objetivo ---------- */
/* ---------- gráfico 1: acumulado + línea de objetivo (colores & nitidez) ---------- */
function makeAvanceChartImage(parciales, objetivoTotalBotellas){
  if (!parciales.length) return null;

  // Canvas más grande para mejor definición (Chart lo renderiza a 2x DPI)
  const cvs = document.createElement('canvas');
  cvs.width  = 1200;
  cvs.height = 560;
  const ctx = cvs.getContext('2d');

  // Paleta
  const C_LINE   = '#0b5fc0';            // azul línea acumulado
  const C_FILL   = 'rgba(17,112,214,.12)'; // relleno suave
  const C_AXIS   = '#334155';            // texto ejes
  const C_GRID   = '#e5e7eb';            // grilla
  const C_TITLE  = '#111827';
  const C_OBJ    = '#dc2626';            // rojo objetivo

  // Serie acumulada
  let acum = 0;
  const labels   = [];
  const dataAcum = parciales.map(p => {
    labels.push(p.fechaTxt || '');
    acum += Number(p.botellas || 0);
    return acum;
  });

  // Que el objetivo entre en el eje Y
  const maxY = Math.max(...dataAcum, Number(objetivoTotalBotellas||0));
  const suggestedMax = Math.ceil(maxY * 1.1);

  // Etiqueta del último punto (para lectura rápida)
  const endLabelPlugin = {
    id: 'endLabel',
    afterDatasetsDraw(chart) {
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const last = meta.data[meta.data.length - 1];
      const val  = dataAcum[dataAcum.length - 1] || 0;
      ctx.save();
      ctx.fillStyle = C_LINE;
      ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
      ctx.fillText(val.toLocaleString('es-AR') + ' bot.', last.x + 8, last.y - 8);
      ctx.restore();
    }
  };

  const chart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Acumulado (botellas)',
          data: dataAcum,
          tension: 0.3,
          borderColor: C_LINE,
          backgroundColor: C_FILL,
          borderWidth: 3,
          pointRadius: 3,
          pointBackgroundColor: C_LINE,
          pointBorderColor: C_LINE,
          fill: true
        },
        {
          label: 'Objetivo (botellas)',
          data: labels.map(() => Number(objetivoTotalBotellas||0)),
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [8, 5],
          borderColor: C_OBJ
        }
      ]
    },
    options: {
      responsive: false,
      animation: false,
      events: [],
      devicePixelRatio: 2,   // más nitidez en la imagen exportada
      plugins: {
        legend: {
          display: true,
          labels: { color: C_AXIS, usePointStyle: true, boxWidth: 12 }
        },
        title: {
          display: true,
          text: 'Avance de producción (acumulado)',
          color: C_TITLE,
          font: { weight: 'bold', size: 14 }
        }
      },
      scales: {
        x: {
          ticks: { color: C_AXIS, font: { size: 11 } },
          grid:  { color: C_GRID }
        },
        y: {
          beginAtZero: true,
          suggestedMax,
          ticks: { color: C_AXIS, font: { size: 11 } },
          grid:  { color: C_GRID }
        }
      }
    },
    plugins: [endLabelPlugin]
  });

  const url = cvs.toDataURL('image/png');
  chart.destroy();
  return url;
}



/* ---------- gráfico 2: barras por turno + línea objetivo ---------- */
function makeTurnosObjetivoChartImage(parciales, formato){
  if (!parciales.length) return null;

  const uxp = envasesPorPaquete(formato);
  const sumBotellas = new Map();
  const objBotellas = new Map(); // guardo el mayor objetivo en botellas por turno

  for (const p of parciales){
    const t = (p.turno || '').trim();
    if (!t) continue;
    sumBotellas.set(t, (sumBotellas.get(t) || 0) + (Number(p.botellas)||0));
    const obj = (Number(p.objCajas)||0) * uxp;
    if (obj > 0) objBotellas.set(t, Math.max(objBotellas.get(t)||0, obj));
  }
  if (sumBotellas.size === 0) return null;

  const orden = ['A','B','C','D','Mañana','Tarde','Noche'];
  const labels = [...sumBotellas.keys()].sort((a,b)=>{
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });

  const dataProducido = labels.map(t => sumBotellas.get(t) || 0);
  const dataObjetivo  = labels.map(t => objBotellas.get(t) || 0);

  const cvs = document.createElement('canvas');
  cvs.width = 900; cvs.height = Math.max(320, 90 + labels.length * 50);
  const ctx = cvs.getContext('2d');

  const objetivoPlugin = {
    id: 'objetivoLine',
    afterDatasetsDraw(chart){
      const {ctx, scales, chartArea} = chart;
      const xS = scales.x;
      ctx.save();
      ctx.strokeStyle = 'rgba(220,0,0,0.9)';
      ctx.setLineDash([6,4]);
      ctx.lineWidth = 2;
      dataObjetivo.forEach((v)=>{
        if (!v) return;
        const x = xS.getPixelForValue(v);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  const chart = new window.Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Producido (botellas)', data: dataProducido }] },
    options: {
      responsive: false,
      animation: false,       // <- clave
      events: [],
      indexAxis: 'y',
      plugins: {
        legend: { display: true },
        title: { display: true, text: 'Progreso por turno (X=botellas, Y=turnos). Línea roja = objetivo' },
        tooltip: {
          callbacks: {
            afterBody(items){
              const i = items[0].dataIndex;
              const obj = dataObjetivo[i] || 0;
              return `Objetivo: ${obj.toLocaleString('es-AR')} botellas`;
            }
          }
        }
      },
      scales: { x: { beginAtZero: true } }
    },
    plugins: [objetivoPlugin]
  });

  const url = cvs.toDataURL('image/png');
  chart.destroy();
  return url;
}

/* ---------- compartir/descargar ---------- */
async function descargarOCompartir(doc, filename){
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try{
      await navigator.share({ files: [file], title: 'L1 Producción', text: 'Reporte de producción' });
      return;
    }catch(e){}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- acción principal ---------- */
async function generarPDF(){
  try{
    const jsPDF = await ensurePDFLibs();
    const doc = new jsPDF({ unit:'mm', format:'a4', compress:true });

    // --- Layout / espacios ---
    const pageW    = doc.internal.pageSize.getWidth();
    const marginX  = 14;           // margen lateral
    const GAP      = 10;           // separación vertical entre secciones
    const HR_GAP   = 6;            // respiro tras una línea divisoria
    const fmtAR    = (n)=> new Intl.NumberFormat('es-AR').format(n);

    const hr = (y) => {            // regla horizontal sutil
      doc.setDrawColor(220);
      doc.setLineWidth(0.3);
      doc.line(marginX, y, pageW - marginX, y);
      return y + HR_GAP;
    };

    const data = collectFromDOM();

    // --- Logo ---
    try{
      const logo = await getLogoDataURL();
      doc.addImage(logo, 'PNG', pageW - marginX - 18, 10, 18, 18, undefined, 'FAST');
    }catch{}

    // --- Título ---
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('Control de Producción — Línea 1', marginX, 18);

    // --- Resumen (dos columnas) ---
    doc.setFont('helvetica','normal'); doc.setFontSize(12);
    const resumenY = 30;         // más abajo para dar aire
    const colR = 110;

    const idTxt = data.corridaId ? data.corridaId : '(sin ID visible)';
    doc.text(`Corrida: ${idTxt}`,   marginX, resumenY);
    doc.text(`Sabor: ${data.sabor || '—'}`,   marginX, resumenY+6);
    doc.text(`Formato: ${data.formato || '—'}`, marginX, resumenY+12);

    const objetivo   = Number(data.objetivo)||0;
    const acumulado  = Number(data.acumulado)||0;
    const restante   = Number(data.restante)||0;
    const pct        = objetivo>0 ? Math.min(100, Math.round(acumulado*100/objetivo)) : 0;

    doc.text(`Objetivo (botellas): ${fmtAR(objetivo)}`, colR, resumenY);
    doc.text(`Acumulado (botellas): ${fmtAR(acumulado)}`, colR, resumenY+6);
    doc.text(`Restante (botellas): ${fmtAR(restante)}  —  Progreso: ${pct}%`, colR, resumenY+12);

    let y = resumenY + 16;
    y = hr(y);                    // separador

    // --- Gráfico 1 (acumulado + objetivo) ---
    const img1 = makeAvanceChartImage(data.parciales, data.objetivo);
    if (img1){
      const imgH = 85;           // un poco más alto que antes
      doc.addImage(img1, 'PNG', marginX, y, pageW - marginX*2, imgH);
      y += imgH + GAP;
      y = hr(y);
    }

    // --- Tabla de parciales ---
    if (data.parciales.length){
      const uxp = envasesPorPaquete(data.formato);
      const body = data.parciales.map(p => {
        const cajasHechas = uxp>0 ? (Number(p.botellas||0)/uxp) : 0;
        const pctTurno = (p.objCajas>0) ? Math.round(cajasHechas*100/p.objCajas) : 0;
        return [
          p.fechaTxt,
          p.turno || '',
          p.operador || '',
          fmtAR(p.objCajas),
          fmtAR(p.botellas),
          fmtAR(Math.round(cajasHechas)),
          `${pctTurno}%`
        ];
      });

      doc.autoTable({
        startY: y,
        head: [['Fecha/Hora','Turno','Operador','Obj. (cajas)','Botellas','Cajas','% Cumpl.']],
        body,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3, lineWidth: 0.1, lineColor: [220,220,220] },
        headStyles: { fillColor: [17,112,214], textColor: 255, lineWidth: 0.1 },
        alternateRowStyles: { fillColor: [248,250,252] }, // leve zebra
      });
      y = doc.lastAutoTable.finalY + GAP;
    }

    // --- Pie ---
    doc.setFontSize(9); doc.setTextColor(140);
    doc.text('Exportado desde la app — Cliente (jsPDF).', marginX, y);

    const nombre = `produccion_${(data.corridaId||'sin-id')}.pdf`;
    await descargarOCompartir(doc, nombre);
  }catch(e){
    console.error('Error generando PDF:', e);
    alert('No se pudo generar el PDF. Revisá la consola.');
  }
}

/* ---------- botón ---------- */
const btnPDF = document.getElementById('btnPDF');
if (btnPDF) {
  btnPDF.addEventListener('click', async () => {
    // bloqueamos el botón y mostramos spinner
    btnPDF.classList.add('loading');
    btnPDF.disabled = true;

    try {
      // tu función actual de PDF es async, así que la esperamos
      await generarPDF();
    } catch (e) {
      console.error('Error generando PDF:', e);
      // si querés, podés mostrar un alert acá
    } finally {
      // restauramos el botón sí o sí
      btnPDF.classList.remove('loading');
      btnPDF.disabled = false;
    }
  });
}

