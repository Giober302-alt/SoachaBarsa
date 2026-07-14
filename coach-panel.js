/**
 * @file coach-panel.js
 * @description Vista simplificada para entrenadores — Barsa Soacha Academy.
 *              Solo su agenda, asistencia y el listado de alumnos.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, getCollection, getGreeting } from './app.js';
import { COLLECTIONS } from './firebase-config.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const init = async () => {
  const profile = await requireAuth('coach');
  if (!profile) return;
  initShell();

  document.getElementById('coachGreeting').textContent = getGreeting(profile.displayName);

  const [categories, students, schedules] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.STUDENTS),
    getCollection(COLLECTIONS.SCHEDULES)
  ]);

  renderAgenda(schedules);
  renderStudents(students, categories);
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
        <p class="ev-title">${escapeHtml(ev.title || '')}</p>
        <span class="ev-meta"><i class="fas fa-clock"></i> ${ev.d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(ev.location || '')}</span>
      </div>
    </div>`).join('');
};

const renderStudents = (students, categories) => {
  const el = document.getElementById('coachStudents');
  const catName = (id) => categories.find(c => c.id === id)?.name || '—';
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
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(catName(s.categoryId))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
