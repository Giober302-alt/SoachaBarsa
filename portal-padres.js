/**
 * @file portal-padres.js
 * @description Portal de padres — Barsa Soacha Academy.
 *              Resumen por hijo + enlace a la ficha completa (alumno-detalle.html).
 */
import { requireAuth, logout } from './auth.js';
import { getCollection, formatDate, formatCOP, getGreeting, applyTheme, AppState, toast, checkDataPolicyConsent } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { renderNotificationBell } from './notifications.js';

const STATUS_LABEL = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido', arrived: 'Presente', late: 'Tarde', absent: 'Ausente', excused: 'Excusa' };
const STATUS_BADGE = { paid: 'badge-paid', pending: 'badge-pending', overdue: 'badge-overdue', arrived: 'badge-arrived', late: 'badge-late', absent: 'badge-absent', excused: 'badge-excused' };
const PAY_DOT = { paid: '🟢', pending: '🟡', overdue: '🔴' };

const init = async () => {
  const profile = await requireAuth('parent');
  if (!profile) return;
  applyTheme(AppState.theme);
  checkDataPolicyConsent();

  document.getElementById('parentGreeting').textContent = getGreeting(profile.displayName);
  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });

  renderNotificationBell('notifBell', { role: 'parent', email: profile.email });
  renderUpcomingSchedules();

  const email = (profile.email || '').toLowerCase();
  let students = [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('parentEmail', '==', email)));
    students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[Portal Padres] Error consultando alumnos:', err);
    document.getElementById('childrenTabs').innerHTML = `
      <div class="empty-widget" style="color:#dc3545">
        <i class="fas fa-triangle-exclamation"></i>
        <p><strong>No se pudo cargar la información (${err.code || err.message}).</strong><br>
        Lo más común: las reglas de seguridad de Firestore aún no se han publicado con la versión
        más reciente de <code>firestore.rules</code>. Ve a Firebase Console → Firestore Database →
        pestaña "Reglas", pega el contenido actualizado y publica.</p>
      </div>`;
    return;
  }

  if (students.length === 0) {
    document.getElementById('noChildren').style.display = 'block';
    document.getElementById('childrenTabs').style.display = 'none';
    return;
  }

  const [categories, coaches] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.COACHES)
  ]);
  const catName = (id) => categories.find(c => c.id === id)?.name || '—';
  const catNamesFor = (s) => {
    const ids = (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);
    return ids.map(id => catName(id)).join(', ') || '—';
  };
  const coachName = (id) => coaches.find(c => c.id === id)?.displayName || 'Sin asignar';

  const studentIds = students.map(s => s.id);
  const [attendance, payments, announcements] = await Promise.all([
    fetchByStudentIds(COLLECTIONS.ATTENDANCE, studentIds),
    fetchByStudentIds(COLLECTIONS.PAYMENTS, studentIds),
    getCollection(COLLECTIONS.ANNOUNCEMENTS)
  ]);

  renderChildren(students, catName, coachName, attendance, payments);
  renderAnnouncements(announcements);
  renderTournaments(students, studentIds);
  renderPerformanceByStudent(students, studentIds);
};

const fetchByStudentIds = async (colName, ids) => {
  if (ids.length === 0) return [];
  const snap = await getDocs(query(collection(db, colName), where('studentId', 'in', ids.slice(0, 10))));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const UNIFORM_LABEL = { training: 'Entrenamiento', presentation: 'Presentación', goalkeeper: 'Arquero', tournament: 'Torneo', other: 'Otro' };
const UNIFORM_COLOR = { training: '#0dcaf0', presentation: 'var(--color-gold)', goalkeeper: '#9c27b0', tournament: '#8B0000', other: 'var(--text-muted)' };

const renderUpcomingSchedules = async () => {
  const el = document.getElementById('parentAgenda');
  const schedules = await getCollection(COLLECTIONS.SCHEDULES);
  const now = new Date();
  const upcoming = schedules
    .map(ev => ({ ...ev, d: ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime) }))
    .filter(ev => ev.d >= now)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  if (upcoming.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin eventos próximos.</p>`; return; }
  el.innerHTML = upcoming.map(ev => `
    <div class="event-item">
      <div class="event-date-badge">
        <span class="ev-dow">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][ev.d.getDay()]}</span>
        <span class="ev-day">${ev.d.getDate()}</span>
        <span class="ev-mon">${ev.d.toLocaleDateString('es-CO',{month:'short'})}</span>
      </div>
      <div class="event-details">
        <p class="ev-title">${ev.cancelled ? '<span style="text-decoration:line-through;color:var(--text-muted)">' + escapeHtml(ev.title || '') + '</span> — cancelado' : escapeHtml(ev.title || '')}</p>
        <span class="ev-meta"><i class="fas fa-clock"></i> ${ev.d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(ev.venue || ev.location || '')}${ev.court ? ' · Cancha ' + escapeHtml(ev.court) : ''}</span>
        ${ev.uniform ? `<div style="margin-top:6px"><span class="badge-status" style="background:${UNIFORM_COLOR[ev.uniform]}22;color:${UNIFORM_COLOR[ev.uniform]}"><i class="fas fa-tshirt"></i> ${UNIFORM_LABEL[ev.uniform] || ev.uniform}</span></div>` : ''}
        ${ev.notes ? `<p style="font-size:11.5px;color:var(--text-secondary);margin-top:6px"><i class="fas fa-circle-info"></i> ${escapeHtml(ev.notes)}</p>` : ''}
      </div>
    </div>`).join('');
};

const renderChildren = (students, catName, coachName, attendance, payments) => {
  const el = document.getElementById('childrenTabs');
  el.innerHTML = students.map(s => {
    const att = attendance.filter(a => a.studentId === s.id);
    const attRecent = [...att].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
    const attPct = att.length ? Math.round((att.filter(a => ['arrived','late'].includes(a.status)).length / att.length) * 100) : null;
    const pay = payments.filter(p => p.studentId === s.id);
    const latestStatus = pay[0]?.status;

    return `<div class="card-bara" style="padding:20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div class="avatar avatar-md" style="background:var(--color-primary);overflow:hidden">
          ${s.photoURL ? `<img src="${s.photoURL}" style="width:100%;height:100%;object-fit:cover">` : (s.displayName || '?').slice(0,2).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <p style="font-weight:700;font-size:16px">${escapeHtml(s.displayName || '—')}</p>
          <p style="font-size:12px;color:var(--text-muted)">${escapeHtml(catNamesFor(s))} · Entrenador: ${escapeHtml(coachName(s.coachId))}</p>
          <p style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${escapeHtml(s.documentType || '')} ${escapeHtml(s.documentNumber || '')}</p>
        </div>
        <a href="./alumno-detalle.html?id=${s.id}&tab=contact" class="btn-outline-bara" style="padding:7px 12px"><i class="fas fa-pen"></i> Editar información</a>
        <a href="./alumno-detalle.html?id=${s.id}" class="btn-outline-bara" style="padding:7px 12px"><i class="fas fa-id-card"></i> Ver ficha completa</a>
      </div>

      ${(s.medical?.bloodType || s.medical?.allergies || s.medical?.emergencyContact) ? `
      <div class="card-bara" style="padding:12px 14px;margin-bottom:16px;background:var(--color-primary-10);border-color:var(--color-primary-20)">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--color-primary);margin-bottom:6px"><i class="fas fa-notes-medical"></i> Información médica</p>
        <p style="font-size:12.5px;color:var(--text-secondary)">
          ${s.medical?.bloodType ? `Sangre: <strong>${escapeHtml(s.medical.bloodType)}</strong> · ` : ''}
          ${s.medical?.allergies ? `Alergias: ${escapeHtml(s.medical.allergies)} · ` : ''}
          ${s.medical?.emergencyContact ? `Emergencia: ${escapeHtml(s.medical.emergencyContact)} ${s.medical.emergencyPhone ? '(' + escapeHtml(s.medical.emergencyPhone) + ')' : ''}` : ''}
        </p>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
        <div class="card-bara" style="padding:14px;text-align:center">
          <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Asistencia</p>
          <p style="font-family:var(--font-display);font-size:26px">${attPct === null ? '—' : attPct + '%'}</p>
        </div>
        <div class="card-bara" style="padding:14px;text-align:center">
          <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Estado de pago</p>
          <p style="font-size:22px">${latestStatus ? PAY_DOT[latestStatus] : '—'} <span style="font-size:13px;font-weight:600">${latestStatus ? STATUS_LABEL[latestStatus] : 'Sin registros'}</span></p>
        </div>
      </div>

      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px">Asistencia reciente</p>
      ${attRecent.length === 0 ? `<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Sin registros todavía.</p>` :
        `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
          ${attRecent.map(a => `<span class="badge-status ${STATUS_BADGE[a.status] || 'badge-pending'}">${a.date} · ${STATUS_LABEL[a.status] || a.status}</span>`).join('')}
        </div>`}

      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px">Pagos</p>
      ${pay.length === 0 ? `<p style="font-size:13px;color:var(--text-muted)">Sin pagos registrados.</p>` :
        `<div style="display:flex;flex-direction:column;gap:8px">
          ${pay.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>${PAY_DOT[p.status] || ''} ${formatCOP(p.amount || 0)} · ${formatDate(p.createdAt)}${p.dueDate ? ' · vence ' + formatDate(p.dueDate) : ''}</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span class="badge-status ${STATUS_BADGE[p.status] || 'badge-pending'}">${STATUS_LABEL[p.status] || p.status}</span>
              ${p.receiptURL ? `<a href="${p.receiptURL}" target="_blank" rel="noopener" title="Ver comprobante"><i class="fas fa-receipt"></i></a>` : ''}
            </span>
          </div>`).join('')}
        </div>`}

      <div id="perf-${s.id}" style="margin-top:16px"></div>
    </div>`;
  }).join('');
};

const renderPerformanceByStudent = async (students, studentIds) => {
  if (studentIds.length === 0) return;
  const notes = await fetchByStudentIds('performanceNotes', studentIds);
  for (const s of students) {
    const el = document.getElementById(`perf-${s.id}`);
    if (!el) continue;
    const list = notes.filter(n => n.studentId === s.id).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 4);
    if (list.length === 0) continue;
    el.innerHTML = `
      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px"><i class="fas fa-chart-line"></i> Rendimiento y retroalimentación</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${list.map(n => `<div class="card-bara" style="padding:12px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <span class="badge-status badge-excused">${escapeHtml(n.category || 'Observación')}</span>
            ${n.rating ? `<span style="color:var(--color-gold);font-size:13px">${'★'.repeat(n.rating)}${'☆'.repeat(5 - n.rating)}</span>` : ''}
          </div>
          <p style="font-size:12.5px;margin-top:6px;white-space:pre-wrap">${escapeHtml(n.text || '')}</p>
          <p style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${escapeHtml(n.coachName || '')} · ${formatDate(n.createdAt)}</p>
        </div>`).join('')}
      </div>`;
  }
};

const renderAnnouncements = (list) => {
  const el = document.getElementById('parentAnnouncements');
  const sorted = list.sort((a, b) => (b.pinned === true) - (a.pinned === true));
  if (sorted.length === 0) {
    el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin comunicados por ahora.</p>`;
    return;
  }
  el.innerHTML = sorted.slice(0, 6).map(a => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border-color)">
      <p style="font-weight:600;font-size:13.5px">${a.pinned ? '<i class="fas fa-thumbtack" style="color:var(--color-gold);margin-right:6px"></i>' : ''}${escapeHtml(a.title || '')}</p>
      ${a.imageURL ? `<img src="${a.imageURL}" style="max-width:220px;border-radius:10px;margin:8px 0;display:block">` : ''}
      <p style="font-size:13px;color:var(--text-secondary);margin-top:4px;white-space:pre-wrap">${escapeHtml(a.body || '')}</p>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px">${formatDate(a.createdAt)}</p>
    </div>`).join('');
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const TSTATUS_LABEL = { pending: 'Pendiente', accepted: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado' };
const TSTATUS_BADGE = { pending: 'badge-pending', accepted: 'badge-paid', rejected: 'badge-overdue', cancelled: 'badge-excused' };

const renderTournaments = async (students, studentIds) => {
  const el = document.getElementById('parentTournaments');
  const [tournaments, regs, callUpDocs] = await Promise.all([
    getCollection(COLLECTIONS.TOURNAMENTS),
    fetchByStudentIds('tournamentRegistrations', studentIds),
    getCollection('callUps', [where('status', '==', 'approved')])
  ]);
  if (tournaments.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin torneos por ahora.</p>`; return; }

  const sorted = tournaments.sort((a, b) => toMillis(b.date) - toMillis(a.date));
  el.innerHTML = sorted.map(t => {
    const callUp = callUpDocs.find(c => c.tournamentId === t.id && c.status === 'approved');
    return `
    <div class="card-bara" style="padding:16px 20px;margin-bottom:12px">
      <p style="font-weight:700;font-size:14px"><i class="fas fa-trophy" style="color:var(--color-gold);margin-right:6px"></i>${escapeHtml(t.name || '')}</p>
      <p style="font-size:12px;color:var(--text-muted);margin:4px 0 6px">${formatDate(t.date)} · ${escapeHtml(t.venue || '')}${t.callTime ? ' · Convocatoria: ' + escapeHtml(t.callTime) : ''}</p>
      ${t.description ? `<p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:10px;white-space:pre-wrap">${escapeHtml(t.description)}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px">
        ${students.map(s => {
          const reg = regs.find(r => r.tournamentId === t.id && r.studentId === s.id);
          const called = callUp?.studentIds?.includes(s.id);
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;gap:8px;flex-wrap:wrap">
            <span>${escapeHtml(s.displayName)}</span>
            <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${called ? `<span class="badge-status badge-arrived"><i class="fas fa-star"></i> Convocado</span>` : ''}
              ${reg
                ? `<span style="display:flex;align-items:center;gap:8px">
                    <span class="badge-status ${TSTATUS_BADGE[reg.status] || 'badge-pending'}">${TSTATUS_LABEL[reg.status] || reg.status}</span>
                    ${['pending','accepted'].includes(reg.status) ? `<button class="btn-outline-bara" style="padding:4px 9px;font-size:11.5px;color:#dc3545;border-color:#dc3545" data-cancel="${reg.id}">Cancelar</button>` : ''}
                  </span>`
                : `<button class="btn-outline-bara" style="padding:5px 10px" data-register="${t.id}|${s.id}">Inscribir</button>`}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-register]').forEach(btn => btn.addEventListener('click', async () => {
    const [tournamentId, studentId] = btn.dataset.register.split('|');
    const student = students.find(s => s.id === studentId);
    await addDoc(collection(db, 'tournamentRegistrations'), {
      tournamentId, studentId, studentName: student?.displayName || '', parentEmail: (student?.parentEmail || '').toLowerCase(),
      status: 'pending', createdAt: serverTimestamp()
    });
    toast('Inscripción enviada. Queda pendiente de aceptación.', 'success');
    renderTournaments(students, studentIds);
  }));

  el.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', async () => {
    await updateDoc(doc(db, 'tournamentRegistrations', btn.dataset.cancel), { status: 'cancelled', updatedAt: serverTimestamp() });
    toast('Inscripción cancelada', 'success');
    renderTournaments(students, studentIds);
  }));
};

const toMillis = (ts) => (ts?.toDate ? ts.toDate() : new Date(ts || 0)).getTime();

document.addEventListener('DOMContentLoaded', init);
