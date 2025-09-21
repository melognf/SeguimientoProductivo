// pdf-export.js — NO modifica tu app. Solo lee el DOM y genera/compartir PDF.

/* ----------------- helpers genéricos ----------------- */
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
  // UMD globals: window.jspdf.jsPDF y doc.autoTable
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  if (!window.Chart) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js');
  }
  return window.jspdf.jsPDF;
}

// Limpia números estilo es-AR ("95.754" -> 95754; "1.234,5" -> 1234.5)
function toNumber(str){
  if (str == null) return 0;
  const s = String(str).trim().replace(/\./g,'').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Logo (dataURL) — no rompe CORS
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

// Envases por paquete según formato
function envasesPorPaquete(formato){
  const n = parseInt(String(formato||'').replace(/\D/g,''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6;
}

/* ----------------- tomar datos desde la UI (DOM) ----------------- */
function collectFromDOM(){
  // Sabor/Formato desde selects (si existen) o vacíos
  const sabor = document.querySelector('#sabor')?.value || '';
  const formato = document.querySelector('#formato')?.value || '';

  // Totales desde el resumen (ya formateados)
  const objetivo = toNumber(document.querySelector('#vObjetivo')?.textContent || '0');
  const acumulado = toNumber(document.querySelector('#vAcumulado')?.textContent || '0');
  const restante = toNumber(document.querySelector('#vRestante')?.textContent || '0');

  // Parciales desde la tabla
  const rows = [...document.querySelectorAll('#listaParciales .row')];
  const parciales = rows.map(r => {
    const c = r.querySelectorAll('span'); // orden: fecha, turno, operador, obj cajas, botellas, %chip, botón
    return {
      fechaTxt: c[0]?.textContent?.trim() || '',
      turno:    c[1]?.textContent?.trim() || '',
      operador: c[2]?.textContent?.trim() || '',
      objCajas: toNumber(c[3]?.textContent || '0'),
      botellas: toNumber(c[4]?.textContent || '0'),
      pctTxt:   c[5]?.textContent?.trim() || '' // "92%"
    };
  });

  // ID de corrida visible en chips (si está)
  // Tomo el último chip que parezca un id (tiene guiones y números)
  let corridaId = '';
  const chips = [...document.querySelectorAll('#corridaInfo .corrida-badge.id, #corridaInfo span')];
  for (const ch of chips) {
    const t = ch.textContent?.trim() || '';
    if (/_\d{4}-\d{2}-\d{2}$/.test(t)) { corridaId = t; break; }
  }

  return { sabor, formato, objetivo, acumulado, restante, parciales, corridaId };
}

/* ----------------- gráfico como imagen ----------------- */
function makeAvanceChartImage(parciales){
  if (!parciales.length) return null;
  const cvs = document.createElement('canvas');
  cvs.width = 900; cvs.height = 420;
  const ctx = cvs.getContext('2d');

  let acum = 0;
  const labels = [];
  const data = parciales.map(p => {
    labels.push(p.fechaTxt || '');
    acum += Number(p.botellas || 0);
    return acum;
  });

  const chart = new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Acumulado (botellas)', data, tension: 0.3 }] },
    options: {
      responsive: false,
      plugins: { legend: { display: true }, title: { display: true, text: 'Avance de producción' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const url = cvs.toDataURL('image/png');
  chart.destroy();
  return url;
}

/* ----------------- generar y compartir/descargar ----------------- */
async function descargarOCompartir(doc, filename){
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try{
      await navigator.share({
        files: [file],
        title: 'L1 Producción',
        text: 'Reporte de producción'
      });
      return;
    }catch(e){
      // si cancela, caemos al download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ----------------- acción principal ----------------- */
async function generarPDF(){
  try{
    const jsPDF = await ensurePDFLibs();
    const doc = new jsPDF({ unit:'mm', format:'a4', compress:true });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const fmtAR = (n)=> new Intl.NumberFormat('es-AR').format(n);

    // Datos desde la UI (no tocamos el estado interno de tu app)
    const data = collectFromDOM();

    // Encabezado + logo
    try{
      const logo = await getLogoDataURL();
      doc.addImage(logo, 'PNG', pageW - marginX - 18, 10, 18, 18, undefined, 'FAST');
    }catch{}
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('Control de Producción — Línea 1', marginX, 18);

    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    const resumenY = 28;
    const idTxt = data.corridaId ? data.corridaId : '(sin ID visible)';
    doc.text(`Corrida: ${idTxt}`, marginX, resumenY);
    doc.text(`Sabor: ${data.sabor || '—'}`, marginX, resumenY+6);
    doc.text(`Formato: ${data.formato || '—'}`, marginX, resumenY+12);

    const pct = (data.objetivo>0) ? Math.min(100, Math.round(data.acumulado*100/data.objetivo)) : 0;
    doc.text(`Objetivo (botellas): ${fmtAR(data.objetivo)}`, 110, resumenY);
    doc.text(`Acumulado (botellas): ${fmtAR(data.acumulado)}`, 110, resumenY+6);
    doc.text(`Restante (botellas): ${fmtAR(data.restante)}  —  Progreso: ${pct}%`, 110, resumenY+12);

    let y = resumenY + 20;

    // Gráfico (si hay parciales)
    const chartImg = makeAvanceChartImage(data.parciales);
    if (chartImg){
      doc.addImage(chartImg, 'PNG', marginX, y, pageW - marginX*2, 70);
      y += 76;
    }

    // Tabla de parciales
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
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [17,112,214] },
        theme: 'grid',
        margin: { left: marginX, right: marginX }
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // Pie
    doc.setFontSize(9); doc.setTextColor(140);
    doc.text('Exportado desde la app — Cliente (jsPDF).', marginX, y);

    const nombre = `produccion_${(data.corridaId||'sin-id')}.pdf`;
    await descargarOCompartir(doc, nombre);
  }catch(e){
    console.error('Error generando PDF:', e);
    alert('No se pudo generar el PDF. Revisá la consola para más detalle.');
  }
}

/* ----------------- botón ----------------- */
document.getElementById('btnPDF')?.addEventListener('click', generarPDF);
