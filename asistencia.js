/**
 * @file asistencia.js
 * @description Pasar lista de asistencia por categoría y fecha — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, hideLoader, showLoader, getCollection } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

let categories = [];
let students   = [];

const STATUSES = [
  { key: 'arrived', label: 'Presente', color: '#198754' },
  { key: 'late',    label: 'Tarde',    color: '#ffc107' },
  { key: 'absent',  label: 'Ausente',  color: '#dc3545' },
  { key: 'excused', label: 'Excusa',   color: '#0dcaf0' }
];

const init = async () => {
  showLoader('Cargando…');
  const profile = await requireAuth('coach');
  if (!profile) return;
  initShell();

  categories = await getCollection(COLLECTIONS.CATEGORIES);
  const sel = document.getElementById('categorySelect');
  sel.innerHTML = `<option value="">Todas las categorías</option>` +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  document.getElementById('dateInput').value = new Date().toISOString().slice(0, 10);
  document.getElementById('loadBtn').addEventListener('click', loadRoster);
  document.getElementById('saveBtn').addEventListener('click', saveAttendance);

  hideLoader();
  await loadRoster();
};

const loadRoster = async () => {
  showLoader('Cargando alumnos…');
  const catId = document.getElementById('categorySelect').value;
  const dateStr = document.getElementById('dateInput').value;

  const all = await getCollection(COLLECTIONS.STUDENTS, [where('active', '==', true)]);
  students = catId ? all.filter(s => s.categoryId === catId) : all;

  // Marcas ya guardadas para esta fecha
  const existingSnap = await getDocs(query(collection(db, COLLECTIONS.ATTENDANCE), where('date', '==', dateStr)));
  const existing = {};
  existingSnap.forEach(d => { existing[d.data().studentId] = d.data().status; });

  renderRoster(existing);
  hideLoader();
};

const renderRoster = (existing) => {
  const el = document.getElementById('rosterContainer');
  if (!el) return;
  if (students.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-users"></i><p>Sin alumnos activos en esta categoría.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${students.map(s => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px;width:40%">${escapeHtml(s.displayName || '—')}</td>
          <td style="padding:12px 20px">
            <div style="display:flex;gap:6px;flex-wrap:wrap" data-student="${s.id}">
              ${STATUSES.map(st => `
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;padding:5px 10px;border:1.5px solid var(--border-color);border-radius:999px;cursor:pointer">
                  <input type="radio" name="att_${s.id}" value="${st.key}" ${existing[s.id] === st.key ? 'checked' : ''} style="accent-color:${st.color}">
                  ${st.label}
                </label>`).join('')}
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;
};

const saveAttendance = async () => {
  const dateStr = document.getElementById('dateInput').value;
  if (!dateStr) { toast('Elige una fecha', 'warning'); return; }
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  let count = 0;
  for (const s of students) {
    const checked = document.querySelector(`input[name="att_${s.id}"]:checked`);
    if (!checked) continue;
    await setDoc(doc(db, COLLECTIONS.ATTENDANCE, `${dateStr}_${s.id}`), {
      date: dateStr, studentId: s.id, studentName: s.displayName || '',
      status: checked.value, updatedAt: serverTimestamp()
    });
    count++;
  }
  btn.disabled = false;
  toast(`Asistencia guardada (${count} alumnos)`, 'success');
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
