/***** Estado + storage *****/
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

/***** UI refs *****/
const saborEl = $('#sabor'), formatoEl = $('#formato'), objetivoTotalEl = $('#objetivoTotal'), corridaInfoEl = $('#corridaInfo');
const turnoEl = $('#turno'), operadorEl = $('#operador'), objetivoTurnoEl = $('#objetivoTurno'), botellasParcialEl = $('#botellasParcial');
const barraEl = $('#barra'), vObjetivoEl = $('#vObjetivo'), vAcumuladoEl = $('#vAcumulado'), vRestanteEl = $('#vRestante'), listaParcialesEl = $('#listaParciales');

/***** Render *****/
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
      <span>${fmt(cajasObj)}</span>          <!-- Objetivo del turno (cajas) -->
      <span>${fmt(bot)}</span>               <!-- Botellas realizadas -->
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

/***** Acciones *****/
function guardarCorrida(){
  const sabor = (saborEl.value||'').trim();
  const formato = (formatoEl.value||'').trim();
  const obj = Number(objetivoTotalEl.value);
  if(!sabor || !formato || !(obj>0)){ alert('Completá Sabor, Formato y un Objetivo total > 0.'); return; }
  estado.corridaId = `${sabor.replace(/\s+/g,'')}_${formato.replace(/\s+/g,'')}_${hoyISO()}`;
  estado.sabor = sabor; estado.formato = formato; estado.objetivoTotal = obj;
  save(); renderAll();
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
  estado.parciales.push({ id: crypto.randomUUID(), ts: Date.now(), turno, operador, objetivoTurno, botellas });
  save();
  // limpiar
  operadorEl.value=''; botellasParcialEl.value='';
  renderResumen(); renderParciales();
}
function borrarParcial(id){
  if(!confirm('¿Borrar este parcial?')) return;
  estado.parciales = estado.parciales.filter(x=>x.id!==id);
  save(); renderResumen(); renderParciales();
}

function reiniciarCorrida(){
  if (!confirm('Esto borra Sabor, Formato, Objetivo y todos los parciales. ¿Continuar?')) return;

  // limpiar estado en memoria
  estado.corridaId = null;
  estado.sabor = '';
  estado.formato = '';
  estado.objetivoTotal = 0;
  estado.parciales = [];

  // limpiar storage
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem('ui_lastTurno'); // si usás el recordatorio de turno

  // limpiar UI (inputs/selects)
  if (saborEl) saborEl.value = '';
  if (formatoEl) formatoEl.value = '';
  if (objetivoTotalEl) objetivoTotalEl.value = '';
  if (turnoEl) turnoEl.value = '';
  if (operadorEl) operadorEl.value = '';
  if (objetivoTurnoEl) objetivoTurnoEl.value = '';
  if (botellasParcialEl) botellasParcialEl.value = '';

  // re-render
  renderAll();
}

// Envases por paquete según formato seleccionado en la corrida
function envasesPorPaquete(formato){
  const n = parseInt(String(formato || '').replace(/\D/g, ''), 10);
  if (n === 1500) return 4;
  if (n === 300 || n === 500 || n === 995) return 6;
  return 6; // default seguro
}


// listener del botón
document.getElementById('btnReiniciar')?.addEventListener('click', reiniciarCorrida);

/***** Eventos + Init *****/
document.getElementById('btnGuardarCorrida').addEventListener('click', guardarCorrida);
document.getElementById('btnAgregarParcial').addEventListener('click', agregarParcial);
load(); renderAll();
