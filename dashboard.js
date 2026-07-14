/**
 * @file dashboard.js
 * @description Dashboard de Barsa Soacha Academy.
 *              ESTRUCTURA PLANA: importa desde la raíz, sin carpetas.
 * @module Dashboard
 * @version 1.1.0
 */

// ─── RUTAS CORREGIDAS: raíz del repositorio ──────────────────────────────────
import { requireAuth, getCurrentProfile } from './auth.js';
import { db, COLLECTIONS }               from './firebase-config.js';

import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

import {
  initShell, toast, showSkeleton, hideLoader, showLoader,
  formatDate, formatCOP, getInitials, stringToColor, truncate, getGreeting
} from './app.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let chartAttendance = null;
let chartPayments   = null;
let chartCategories = null;
const unsubs        = [];   // Funciones de cancelación de Firestore listeners

// ─── Entrada principal ────────────────────────────────────────────────────────
export const initDashboard = async () => {
  showLoader('Cargando panel…');

  const profile = await requireAuth();
  if (!profile) return;

  initShell();
  renderGreeting(profile);
  showSkeleton('statsContainer', 5, 'stat');

  // Datos en tiempo real
  unsubs.push(
    subscribeStats(),
    subscribeSchedules(),
    subscribeAnnouncements()
  );

  // Gráficas (carga única)
  await loadCharts();
  hideLoader();
  startClock();
};

// ─── Saludo ───────────────────────────────────────────────────────────────────
const renderGreeting = (profile) => {
  const el = document.getElementById('dashGreeting');
  if (el) el.textContent = getGreeting(profile.displayName);

  const dateEl = document.getElementById('dashDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('es-CO', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });
  }
};

// ─── Indicadores en tiempo real ───────────────────────────────────────────────
const subscribeStats = () => {
  const todayStr = new Date().toISOString().split('T')[0];

  const studQ = query(
    collection(db, COLLECTIONS.STUDENTS),
    where('active', '==', true)
  );

  return onSnapshot(studQ, async (studSnap) => {
    const totalStudents = studSnap.size;
    const birthdays     = studSnap.docs.filter(d => {
      const bd = d.data().birthDate;
      if (!bd) return false;
      const bDate = bd.toDate ? bd.toDate() : new Date(bd);
      return bDate.getMonth() === new Date().getMonth();
    }).length;

    // Asistencia de hoy
    const attSnap = await getDocs(
      query(collection(db, COLLECTIONS.ATTENDANCE), where('date','==', todayStr))
    );
    const arrived = attSnap.docs.filter(d => ['arrived','late'].includes(d.data().status)).length;
    const pct     = totalStudents > 0 ? Math.round((arrived / totalStudents) * 100) : 0;

    // Pagos pendientes
    const paySnap = await getDocs(
      query(collection(db, COLLECTIONS.PAYMENTS), where('status','in',['pending','overdue']))
    );

    // Próximos torneos
    const torSnap = await getDocs(
      query(collection(db, COLLECTIONS.TOURNAMENTS),
        where('date','>=', Timestamp.now()), orderBy('date'), limit(3))
    );

    renderStats({ totalStudents, arrived, pct,
      pendingPayments: paySnap.size, nextTournaments: torSnap.size, birthdays });

  }, (err) => {
    console.error('[Dashboard] subscribeStats:', err);
    toast('Error al cargar indicadores', 'error');
  });
};

// ─── Stat cards ───────────────────────────────────────────────────────────────
const renderStats = (s) => {
  const container = document.getElementById('statsContainer');
  if (!container) return;

  const cards = [
    { id:'statStudents',    label:'Total alumnos',         value:s.totalStudents,    icon:'fas fa-users',           color:'var(--color-primary)', bg:'var(--color-primary-10)' },
    { id:'statAttendance',  label:'Asistencia hoy',        value:s.arrived,          icon:'fas fa-clipboard-check', color:'#198754', bg:'#19875415', suffix:`(${s.pct}%)`, trend: s.pct >= 80 ? 'up' : 'down' },
    { id:'statPending',     label:'Pagos pendientes',      value:s.pendingPayments,  icon:'fas fa-exclamation-circle', color: s.pendingPayments > 5 ? '#dc3545':'#ffc107', bg: s.pendingPayments > 5 ? '#dc354515':'#ffc10715', trend:'neutral' },
    { id:'statTournaments', label:'Próximos torneos',      value:s.nextTournaments,  icon:'fas fa-trophy',          color:'var(--color-gold)', bg:'var(--color-gold-10)' },
    { id:'statBirthdays',   label:'Cumpleaños este mes',   value:s.birthdays,        icon:'fas fa-birthday-cake',   color:'#9c27b0', bg:'#9c27b015' }
  ];

  container.innerHTML = cards.map(c => `
    <div class="stat-card" id="${c.id}">
      <div class="stat-icon" style="background:${c.bg};color:${c.color}">
        <i class="${c.icon}"></i>
      </div>
      <div class="stat-body">
        <div class="stat-value" data-target="${c.value}">0</div>
        <div class="stat-label">${c.label}</div>
        ${c.suffix ? `<span class="stat-suffix">${c.suffix}</span>` : ''}
      </div>
      ${c.trend ? `<div class="stat-trend trend-${c.trend}"><i class="fas fa-arrow-${c.trend === 'up' ? 'up' : c.trend === 'down' ? 'down' : 'right'}"></i></div>` : ''}
    </div>`).join('');

  container.querySelectorAll('.stat-value[data-target]').forEach(el => {
    animateCounter(el, parseInt(el.dataset.target));
  });

  container.querySelectorAll('.stat-card').forEach((card, i) => {
    card.style.cssText = 'opacity:0;transform:translateY(16px)';
    setTimeout(() => {
      card.style.cssText = 'transition:all .45s cubic-bezier(.16,1,.3,1);opacity:1;transform:translateY(0)';
    }, i * 70);
  });
};

const animateCounter = (el, target) => {
  let current = 0;
  if (target === 0) { el.textContent = '0'; return; }
  const step  = Math.max(1, Math.ceil(target / 25));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 35);
};

// ─── Gráficas ─────────────────────────────────────────────────────────────────
const loadCharts = async () => {
  await Promise.all([renderAttendanceChart(), renderPaymentsChart(), renderCategoriesChart()]);
};

const renderAttendanceChart = async () => {
  const canvas = document.getElementById('chartAttendance');
  if (!canvas || !window.Chart) return;
  if (chartAttendance) { chartAttendance.destroy(); chartAttendance = null; }

  const labels = [], data = [];
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    labels.push(dias[d.getDay()]);
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where('date','==', dateStr),
      where('status','in',['arrived','late'])
    ));
    data.push(snap.size);
  }

  chartAttendance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{
      label: 'Asistentes', data,
      backgroundColor: 'rgba(139,0,0,0.75)', borderColor: '#8B0000',
      borderWidth: 2, borderRadius: 8, borderSkipped: false
    }]},
    options: barOptions()
  });
};

const renderPaymentsChart = async () => {
  const canvas = document.getElementById('chartPayments');
  if (!canvas || !window.Chart) return;
  if (chartPayments) { chartPayments.destroy(); chartPayments = null; }

  const counts = { paid:0, pending:0, overdue:0 };
  const snap   = await getDocs(collection(db, COLLECTIONS.PAYMENTS));
  snap.forEach(d => { const s = d.data().status; if (s in counts) counts[s]++; });

  chartPayments = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Pagado','Pendiente','Vencido'],
      datasets: [{
        data: [counts.paid, counts.pending, counts.overdue],
        backgroundColor: ['#198754','#ffc107','#dc3545'],
        borderWidth: 0, hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: {
        legend: { position:'bottom', labels:{ color: cssVar('--text-secondary'), padding:16, font:{size:12} } }
      }
    }
  });
};

const renderCategoriesChart = async () => {
  const canvas = document.getElementById('chartCategories');
  if (!canvas || !window.Chart) return;
  if (chartCategories) { chartCategories.destroy(); chartCategories = null; }

  const [catsSnap, studsSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.CATEGORIES)),
    getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('active','==',true)))
  ]);

  const cats   = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const studs  = studsSnap.docs.map(d => d.data());
  const labels = cats.map(c => c.name);
  const data   = cats.map(c => studs.filter(s => s.categoryId === c.id).length);
  const colors = cats.map(c => c.color || '#8B0000');

  chartCategories = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{
      label: 'Alumnos', data,
      backgroundColor: colors.map(c => c+'CC'),
      borderColor: colors, borderWidth: 2, borderRadius: 8
    }]},
    options: { ...barOptions(), indexAxis: 'y' }
  });
};

const barOptions = () => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor:'rgba(13,27,62,.95)', titleColor:'#F0C040',
               bodyColor:'#fff', borderColor:'#8B0000', borderWidth:1, padding:10 }
  },
  scales: {
    x: { grid:{ color: cssVar('--border-color')+'33' }, ticks:{ color: cssVar('--text-secondary'), font:{size:11} } },
    y: { grid:{ color: cssVar('--border-color')+'33' }, ticks:{ color: cssVar('--text-secondary'), font:{size:11} }, beginAtZero: true }
  }
});

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ─── Próximos eventos ─────────────────────────────────────────────────────────
const subscribeSchedules = () => {
  const q = query(
    collection(db, COLLECTIONS.SCHEDULES),
    where('startTime','>=', Timestamp.now()),
    orderBy('startTime'), limit(5)
  );
  return onSnapshot(q, snap => {
    renderUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

const renderUpcomingEvents = (events) => {
  const el = document.getElementById('upcomingEvents');
  if (!el) return;
  if (events.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-calendar-times"></i><p>Sin eventos próximos</p></div>`;
    return;
  }
  const dias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  el.innerHTML = events.map(ev => {
    const d = ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime);
    return `<div class="event-item">
      <div class="event-date-badge">
        <span class="ev-dow">${dias[d.getDay()]}</span>
        <span class="ev-day">${d.getDate()}</span>
        <span class="ev-mon">${meses[d.getMonth()]}</span>
      </div>
      <div class="event-details">
        <p class="ev-title">${ev.title}</p>
        <span class="ev-meta"><i class="fas fa-clock"></i> ${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} · ${truncate(ev.location||'',22)}</span>
      </div>
      <span class="ev-type-badge type-${(ev.type||'training').toLowerCase()}">${ev.type||'Entrenamiento'}</span>
    </div>`;
  }).join('');
};

// ─── Comunicados ──────────────────────────────────────────────────────────────
const subscribeAnnouncements = () => {
  const q = query(collection(db, COLLECTIONS.ANNOUNCEMENTS), orderBy('createdAt','desc'), limit(4));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const el = document.getElementById('recentAnnouncements');
    if (!el) return;
    el.innerHTML = items.length === 0
      ? `<div class="empty-widget"><i class="fas fa-bullhorn"></i><p>Sin comunicados</p></div>`
      : items.map(item => `<div class="announcement-item ${item.pinned?'pinned':''}">
          <div class="ann-icon"><i class="fas fa-bullhorn"></i></div>
          <div class="ann-content">
            <p class="ann-title">${truncate(item.title,40)}</p>
            <span class="ann-date">${formatDate(item.createdAt)}</span>
          </div>
        </div>`).join('');
  });
};

// ─── Reloj ────────────────────────────────────────────────────────────────────
const startClock = () => {
  const tick = () => {
    const el = document.getElementById('liveClock');
    if (el) el.textContent = new Date().toLocaleTimeString('es-CO',
      { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };
  tick();
  setInterval(tick, 1000);
};

// ─── Cleanup ──────────────────────────────────────────────────────────────────
export const destroyDashboard = () => {
  unsubs.forEach(fn => typeof fn === 'function' && fn());
  [chartAttendance, chartPayments, chartCategories].forEach(c => c?.destroy());
};

// ─── Auto-inicializar ─────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
