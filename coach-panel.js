/**
 * @file coach-panel.js
 * @description Vista simplificada para entrenadores — Barsa Soacha Academy.
 *              Solo su agenda, asistencia y el listado de alumnos.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, getCollection, getGreeting, formatDate } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import { Timestamp, collection, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { renderNotificationBell, notify, waDirectUrl } from './notifications.js';

const PERF_CATEGORIES = ['Fortaleza', 'Por mejorar', 'Objetivo', 'Observación'];
const PAY_STATUS_LABEL = { paid: 'Al día', pending: 'Pendiente', overdue: 'Vencido' };
const PAY_DOT = { paid: '🟢', pending: '🟡', overdue: '🔴' };

const STATUSES = [
  { key: 'arrived', label: 'Presente', color: '#198754' },
  { key: 'late',    label: 'Tarde',    color: '#ffc107' },
  { key: 'absent',  label: 'Ausente',  color: '#dc3545' },
  { key: 'excused', label: 'Excusa',   color: '#0dcaf0' }
];
const STATUS_LABEL_ES = { arrived: 'Presente', late: 'Tarde', absent: 'Ausente', excused: 'Excusa' };
let allCategories = [];
let allStudents = [];
let coachProfile = null;

const init = async () => {
  const profile = await requireAuth('coach');
  if (!profile) return;
  coachProfile = profile;
  initShell();

  document.getElementById('coachGreeting').textContent = getGreeting(profile.displayName);
  document.getElementById('coachGreeting').dataset.name = profile.displayName || '';
  renderNotificationBell('coachNotifs', { role: 'coach', email: profile.email });

  const [categories, students, schedules] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.STUDENTS),
    getCollection(COLLECTIONS.SCHEDULES)
  ]);

  const [attendanceAll, paymentsAll] = await Promise.all([
    getCollection(COLLECTIONS.ATTENDANCE),
    getCollection(COLLECTIONS.PAYMENTS)
  ]);

  renderAgenda(schedules);
  renderStudents(students, categories, attendanceAll, paymentsAll);

  allCategories = categories;
  allStudents = students;
  const sel = document.getElementById('attCategorySelect');
  sel.innerHTML = `<option value="">Todas las categorías</option>` +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.getElementById('attDateInput').value = new Date().toISOString().slice(0, 10);
  document.getElementById('attLoadBtn').addEventListener('click', loadAttRoster);
  document.getElementById('attSaveBtn').addEventListener('click', saveAttRoster);
  document.getElementById('attAllPresentBtn').addEventListener('click', () => markAllAtt('arrived'));
  document.getElementById('attAllAbsentBtn').addEventListener('click', () => markAllAtt('absent'));
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

const markAllAtt = (statusKey) => {
  rosterStudents.forEach(s => {
    const input = document.querySelector(`input[name="coachAtt_${s.id}"][value="${statusKey}"]`);
    if (input) input.checked = true;
  });
  toast(`Marcados todos como "${STATUS_LABEL_ES[statusKey]}" — revisa y guarda`, 'info', 2500);
};

const saveAttRoster = async () => {
  const dateStr = document.getElementById('attDateInput').value;
  if (!dateStr) { toast('Elige una fecha', 'warning'); return; }
  let count = 0;
  const waList = [];
  const nowStr = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  for (const s of rosterStudents) {
    const checked = document.querySelector(`input[name="coachAtt_${s.id}"]:checked`);
    if (!checked) continue;
    await setDoc(doc(db, COLLECTIONS.ATTENDANCE, `${dateStr}_${s.id}`), {
      date: dateStr, studentId: s.id, studentName: s.displayName || '',
      status: checked.value, recordedBy: coachProfile?.displayName || coachProfile?.email || '',
      recordedAt: serverTimestamp(), recordedAtTime: nowStr, updatedAt: serverTimestamp()
    });
    count++;
    if (s.parentEmail) {
      notify({ parentEmail: s.parentEmail, title: `Asistencia de ${s.displayName}`, body: `${STATUS_LABEL_ES[checked.value]} el ${dateStr}` });
    }
    if (['arrived', 'late'].includes(checked.value) && s.parentPhone) {
      waList.push({ name: s.displayName, phone: s.parentPhone, status: checked.value });
    }
  }
  toast(`Asistencia guardada (${count} alumnos)`, 'success');
  const box = document.getElementById('coachWaNotify');
  if (box) {
    box.innerHTML = waList.length === 0 ? '' : `<div class="card-bara" style="padding:16px 18px;margin-top:12px">
      <p style="font-weight:700;font-size:13.5px;margin-bottom:10px"><i class="fab fa-whatsapp" style="color:#25D366"></i> Notificar llegada por WhatsApp</p>
      ${waList.map(w => `<a href="${waDirectUrl(w.phone, `Hola! Te informamos que ${w.name} llegó al entrenamiento del ${dateStr} (${STATUS_LABEL_ES[w.status]}). Barsa Soacha Academy.`)}" target="_blank" rel="noopener" class="btn-outline-bara" style="margin:0 8px 8px 0"><i class="fab fa-whatsapp" style="color:#25D366"></i> ${escapeHtml(w.name)}</a>`).join('')}
    </div>`;
  }
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

const renderStudents = (students, categories, attendanceAll, paymentsAll) => {
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

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  el.innerHTML = `<div class="card-bara" style="overflow-x:auto"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse;min-width:640px">
      <thead>
        <tr style="border-bottom:2px solid var(--border-color)">
          <th style="padding:10px 20px;text-align:left;font-size:11.5px;color:var(--text-muted);text-transform:uppercase">Jugador</th>
          <th style="padding:10px 20px;text-align:left;font-size:11.5px;color:var(--text-muted);text-transform:uppercase">% Asistencia (30d)</th>
          <th style="padding:10px 20px;text-align:left;font-size:11.5px;color:var(--text-muted);text-transform:uppercase">Estado de pago</th>
          <th style="padding:10px 20px;text-align:left;font-size:11.5px;color:var(--text-muted);text-transform:uppercase">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${active.map(s => {
          const att = attendanceAll.filter(a => a.studentId === s.id && a.date >= cutoffStr);
          const pct = att.length ? Math.round((att.filter(a => ['arrived', 'late'].includes(a.status)).length / att.length) * 100) : null;
          const pctColor = pct === null ? 'var(--text-muted)' : pct >= 80 ? '#198754' : pct >= 50 ? '#ffc107' : '#dc3545';
          const pay = paymentsAll.filter(p => p.studentId === s.id).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          const latest = pay[0]?.status;
          return `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px">
            <p style="font-weight:600;font-size:13.5px">${escapeHtml(s.displayName || '—')}</p>
            <p style="font-size:11.5px;color:var(--text-secondary)">${escapeHtml(catNames(s))}</p>
          </td>
          <td style="padding:12px 20px">
            ${pct === null ? '<span style="font-size:12.5px;color:var(--text-muted)">Sin registros</span>' : `<span style="font-weight:700;font-size:14px;color:${pctColor}">${pct}%</span>`}
          </td>
          <td style="padding:12px 20px">
            ${latest ? `<span style="font-size:13px">${PAY_DOT[latest] || ''} ${PAY_STATUS_LABEL[latest] || latest}</span>` : '<span style="font-size:12.5px;color:var(--text-muted)">Sin pagos</span>'}
          </td>
          <td style="padding:12px 20px;white-space:nowrap">
            <button class="btn-outline-bara" style="padding:5px 10px;margin-right:6px" data-rate="${s.id}"><i class="fas fa-star"></i> Calificar</button>
            <a href="./alumno-detalle.html?id=${s.id}" class="btn-outline-bara" style="padding:5px 10px"><i class="fas fa-id-card"></i></a>
          </td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-rate]').forEach(btn => btn.addEventListener('click', () => openRatingForm(active.find(s => s.id === btn.dataset.rate))));
};

const STAR_HTML = (n) => Array.from({ length: 5 }, (_, i) => `<i class="fa-star ${i < n ? 'fas' : 'far'}" data-star="${i + 1}" style="cursor:pointer;color:${i < n ? 'var(--color-gold)' : 'var(--text-muted)'};font-size:22px;margin-right:4px"></i>`).join('');

const openRatingForm = (student) => {
  if (!student) return;
  let rating = 0;
  Swal.fire({
    title: `Calificar a ${student.displayName}`,
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Calificación del entrenamiento de hoy</label>
        <div id="starPicker" style="margin:6px 0 14px">${STAR_HTML(0)}</div>
        <label class="form-label-bara">Categoría de la retroalimentación</label>
        <select id="perfCat" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${PERF_CATEGORIES.map(c => `<option>${c}</option>`).join('')}
        </select>
        <label class="form-label-bara">Retroalimentación para el padre/madre</label>
        <textarea id="perfText" class="form-control-bara swal2-textarea" style="margin:0" placeholder="Ej: Excelente actitud, mejoró el control del balón…"></textarea>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Publicar', cancelButtonText: 'Cancelar', confirmButtonColor: '#00C853',
    focusConfirm: false,
    didOpen: () => {
      document.getElementById('starPicker').querySelectorAll('[data-star]').forEach(star => {
        star.addEventListener('click', () => {
          rating = Number(star.dataset.star);
          document.getElementById('starPicker').innerHTML = STAR_HTML(rating);
          document.getElementById('starPicker').querySelectorAll('[data-star]').forEach(s2 => s2.addEventListener('click', () => star.click()));
        });
      });
    },
    preConfirm: () => {
      const text = document.getElementById('perfText').value.trim();
      if (!text) { Swal.showValidationMessage('Escribe una retroalimentación'); return false; }
      return { category: document.getElementById('perfCat').value, text, rating };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await addDoc(collection(db, 'performanceNotes'), {
      studentId: student.id, category: res.value.category, text: res.value.text,
      rating: res.value.rating, coachName: document.getElementById('coachGreeting').dataset.name || '',
      createdAt: serverTimestamp()
    });
    if (student.parentEmail) {
      const stars = res.value.rating ? ` ${'⭐'.repeat(res.value.rating)}` : '';
      await notify({ parentEmail: student.parentEmail, title: `Retroalimentación de ${student.displayName}${stars}`, body: `${res.value.category}: ${res.value.text}` });
    }
    toast('Calificación y retroalimentación publicadas', 'success');
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
