/**
 * @file coach-panel.js
 * @description Vista simplificada para entrenadores — Barsa Soacha Academy.
 *              Solo su agenda, asistencia y el listado de alumnos.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, getCollection, getGreeting } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import { Timestamp, collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { renderNotificationBell, notify } from './notifications.js';

const STATUSES = [
  { key: 'arrived', label: 'Presente', color: '#198754' },
  { key: 'late',    label: 'Tarde',    color: '#ffc107' },
  { key: 'absent',  label: 'Ausente',  color: '#dc3545' },
  { key: 'excused', label: 'Excusa',   color: '#0dcaf0' }
];
const STATUS_LABEL_ES = { arrived: 'Presente', late: 'Tarde', absent: 'Ausente', excused: 'Excusa' };
let allCategories = [];
let allStudents = [];

const init = async () => {
  const profile = await requireAuth('coach');
  if (!profile) return;
  initShell();

  document.getElementById('coachGreeting').textContent = getGreeting(profile.displayName);
  renderNotificationBell('coachNotifs', { role: 'coach', email: profile.email });

  const [categories, students, schedules] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.STUDENTS),
    getCollection(COLLECTIONS.SCHEDULES)
  ]);

  renderAgenda(schedules);
  renderStudents(students, categories);

  allCategories = categories;
  allStudents = students;
  const sel = document.getElementById('attCategorySelect');
  sel.innerHTML = `<option value="">Todas las categorías</option>` +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('attDateInput').value = new Date().toISOString().slice(0, 10);
  document.getElementById('attLoadBtn').addEventListener('click', loadAttRoster);
  document.getElementById('attSaveBtn').addEventListener('click', saveAttRoster);
  await loadAttRoster();
};

let rosterStudents = [];

const loadAttRoster = async () => {
  const catId = document.getElementById('attCategorySelect').value;
  const dateStr = document.getElementById('attDateInput').value;
  const inCat = (s) => (s.categoryIds && s.categoryIds.length) ? s.categoryIds.includes(catId) : s.categoryId === catId;
  rosterStudents = allStudents.filter(s => s.active !== false && (!catId || inCat(s)));

  const existingSnap = await getDocs(query(collection(db, COLLECTIONS.ATTENDANCE), where('date', '==', dateStr)));
  const existing = {};
  existingSnap.forEach(d => { existing[d.data().studentId] = d.data().status; });

  const el = document.getElementById('attRoster');
  if (rosterStudents.length === 0) { el.innerHTML = `<div class="empty-widget"><i class="fas fa-users"></i><p>Sin alumnos en esta categoría.</p></div>`; return; }
  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0"><table style="width:100%;border-collapse:collapse"><tbody>
    ${rosterStudents.map(s => `
    <tr style="border-bottom:1px solid var(--border-color)">
      <td style="padding:10px 16px;font-weight:600;font-size:13px;width:35%">${escapeHtml(s.displayName || '—')}</td>
      <td style="padding:10px 16px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${STATUSES.map(st => `<label style="display:flex;align-items:center;gap:5px;font-size:11.5px;padding:4px 9px;border:1.5px solid var(--border-color);border-radius:999px;cursor:pointer">
            <input type="radio" name="coachAtt_${s.id}" value="${st.key}" ${existing[s.id] === st.key ? 'checked' : ''} style="accent-color:${st.color}"> ${st.label}
          </label>`).join('')}
        </div>
      </td>
    </tr>`).join('')}
  </tbody></table></div></div>`;
};

const saveAttRoster = async () => {
  const dateStr = document.getElementById('attDateInput').value;
  if (!dateStr) { toast('Elige una fecha', 'warning'); return; }
  let count = 0;
  for (const s of rosterStudents) {
    const checked = document.querySelector(`input[name="coachAtt_${s.id}"]:checked`);
    if (!checked) continue;
    await setDoc(doc(db, COLLECTIONS.ATTENDANCE, `${dateStr}_${s.id}`), {
      date: dateStr, studentId: s.id, studentName: s.displayName || '',
      status: checked.value, updatedAt: serverTimestamp()
    });
    count++;
    if (s.parentEmail) {
      notify({ parentEmail: s.parentEmail, title: `Asistencia de ${s.displayName}`, body: `${STATUS_LABEL_ES[checked.value]} el ${dateStr}` });
    }
  }
  toast(`Asistencia guardada (${count} alumnos)`, 'success');
};

const renderAgenda = (schedules) => {
  const el = document.getElementById('coachAgenda');
  const now = new Date();
  const upcoming = schedules
    .map(ev => ({ ...ev, d: ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime) }))
    .filter(ev => ev.d >= now)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  if (upcoming.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-calendar-alt"></i><p>Sin eventos próximos.</p></div>`;
    return;
  }
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
      </div>
    </div>`).join('');
};

const renderStudents = (students, categories) => {
  const el = document.getElementById('coachStudents');
  const catNames = (s) => {
    const ids = (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);
    return ids.map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join(', ') || '—';
  };
  const active = students.filter(s => s.active !== false);
  if (active.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-users"></i><p>Sin alumnos registrados todavía.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${active.map(s => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px">${escapeHtml(s.displayName || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(catNames(s))}</td>
          <td style="padding:12px 20px;white-space:nowrap"><a href="./alumno-detalle.html?id=${s.id}" class="btn-outline-bara" style="padding:5px 10px"><i class="fas fa-id-card"></i></a></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
