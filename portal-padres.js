/**
 * @file portal-padres.js
 * @description Portal de padres — Barsa Soacha Academy.
 *              Muestra solo la información de los hijos vinculados por correo.
 */
import { requireAuth, logout } from './auth.js';
import { getCollection, formatDate, formatCOP, getGreeting, toast } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const STATUS_LABEL = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido', arrived: 'Presente', late: 'Tarde', absent: 'Ausente', excused: 'Excusa' };
const STATUS_BADGE = { paid: 'badge-paid', pending: 'badge-pending', overdue: 'badge-overdue', arrived: 'badge-arrived', late: 'badge-late', absent: 'badge-absent', excused: 'badge-excused' };

const init = async () => {
  const profile = await requireAuth('parent');
  if (!profile) return;

  document.getElementById('parentGreeting').textContent = getGreeting(profile.displayName);
  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });

  const email = (profile.email || '').toLowerCase();
  const students = await getCollection(COLLECTIONS.STUDENTS, [where('parentEmail', '==', email)]);

  if (students.length === 0) {
    document.getElementById('noChildren').style.display = 'block';
    document.getElementById('childrenTabs').style.display = 'none';
    return;
  }

  const categories = await getCollection(COLLECTIONS.CATEGORIES);
  const catName = (id) => categories.find(c => c.id === id)?.name || '—';

  const studentIds = students.map(s => s.id);
  const [attendance, payments, announcements] = await Promise.all([
    fetchByStudentIds(COLLECTIONS.ATTENDANCE, studentIds),
    fetchByStudentIds(COLLECTIONS.PAYMENTS, studentIds),
    getCollection(COLLECTIONS.ANNOUNCEMENTS)
  ]);

  renderChildren(students, catName, attendance, payments);
  renderAnnouncements(announcements);
};

const fetchByStudentIds = async (colName, ids) => {
  if (ids.length === 0) return [];
  const snap = await getDocs(query(collection(db, colName), where('studentId', 'in', ids.slice(0, 10))));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const renderChildren = (students, catName, attendance, payments) => {
  const el = document.getElementById('childrenTabs');
  el.innerHTML = students.map(s => {
    const att = attendance.filter(a => a.studentId === s.id).slice(0, 8);
    const pay = payments.filter(p => p.studentId === s.id);

    return `<div class="card-bara" style="padding:20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div class="avatar avatar-md" style="background:var(--color-primary)">${(s.displayName || '?').slice(0,2).toUpperCase()}</div>
        <div>
          <p style="font-weight:700;font-size:16px">${escapeHtml(s.displayName || '—')}</p>
          <p style="font-size:12px;color:var(--text-muted)">${escapeHtml(catName(s.categoryId))}</p>
        </div>
      </div>

      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px">Asistencia reciente</p>
      ${att.length === 0 ? `<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Sin registros todavía.</p>` :
        `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
          ${att.map(a => `<span class="badge-status ${STATUS_BADGE[a.status] || 'badge-pending'}">${a.date} · ${STATUS_LABEL[a.status] || a.status}</span>`).join('')}
        </div>`}

      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:8px">Pagos</p>
      ${pay.length === 0 ? `<p style="font-size:13px;color:var(--text-muted)">Sin pagos registrados.</p>` :
        `<div style="display:flex;flex-direction:column;gap:8px">
          ${pay.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>${formatCOP(p.amount || 0)} · ${formatDate(p.createdAt)}</span>
            <span class="badge-status ${STATUS_BADGE[p.status] || 'badge-pending'}">${STATUS_LABEL[p.status] || p.status}</span>
          </div>`).join('')}
        </div>`}
    </div>`;
  }).join('');
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
      <p style="font-size:13px;color:var(--text-secondary);margin-top:4px;white-space:pre-wrap">${escapeHtml(a.body || '')}</p>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px">${formatDate(a.createdAt)}</p>
    </div>`).join('');
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
