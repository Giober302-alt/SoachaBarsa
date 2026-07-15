/**
 * @file reportes.js
 * @description Reportes de asistencia, pagos y alumnos por categoría — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, hideLoader, showLoader, getCollection, formatCOP } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const PAY_STATUS_LABEL = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido' };
const STATUS_LABEL_ES = { arrived: 'Presente', late: 'Tarde', absent: 'Ausente', excused: 'Excusa' };

let students = [], categories = [];
let attendanceRows = [], paymentsRows = [];

const init = async () => {
  showLoader('Cargando reportes…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 30);
  document.getElementById('reportFrom').value = from.toISOString().slice(0, 10);
  document.getElementById('reportTo').value = to.toISOString().slice(0, 10);
  document.getElementById('btnApplyRange').addEventListener('click', loadAll);
  document.getElementById('btnExportAttendance').addEventListener('click', () => exportCsv(attendanceCsvRows(), 'asistencia.csv'));
  document.getElementById('btnExportPayments').addEventListener('click', () => exportCsv(paymentsCsvRows(), 'pagos.csv'));

  [students, categories] = await Promise.all([
    getCollection(COLLECTIONS.STUDENTS),
    getCollection(COLLECTIONS.CATEGORIES)
  ]);

  await loadAll();
  hideLoader();
};

const studentName = (id) => students.find(s => s.id === id)?.displayName || '—';
const catNamesFor = (s) => {
  const ids = (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);
  return ids.map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join(', ') || '—';
};

const loadAll = async () => {
  const fromStr = document.getElementById('reportFrom').value;
  const toStr = document.getElementById('reportTo').value;
  try {
    const [attSnap, paySnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.ATTENDANCE), where('date', '>=', fromStr), where('date', '<=', toStr))),
      getDocs(collection(db, COLLECTIONS.PAYMENTS))
    ]);
    attendanceRows = attSnap.docs.map(d => d.data());
    paymentsRows = paySnap.docs.map(d => d.data());
  } catch (err) {
    console.error('[Reportes] loadAll:', err);
    toast('No se pudieron cargar los reportes (' + (err.code || err.message) + ')', 'error', 5000);
    attendanceRows = []; paymentsRows = [];
  }
  renderStats();
  renderAttendanceReport();
  renderPaymentsReport();
  renderCategoriesReport();
};

const renderStats = () => {
  const totalAtt = attendanceRows.length;
  const present = attendanceRows.filter(a => ['arrived', 'late'].includes(a.status)).length;
  const pct = totalAtt ? Math.round((present / totalAtt) * 100) : 0;
  const totalPay = paymentsRows.reduce((sum, p) => sum + (p.status === 'paid' ? (p.amount || 0) : 0), 0);
  const overdue = paymentsRows.filter(p => p.status === 'overdue').length;

  const cards = [
    { label: '% Asistencia en el rango', value: pct + '%', icon: 'fa-clipboard-check', color: '#198754' },
    { label: 'Recaudo confirmado', value: formatCOP(totalPay), icon: 'fa-sack-dollar', color: 'var(--color-primary)' },
    { label: 'Pagos vencidos', value: overdue, icon: 'fa-triangle-exclamation', color: '#dc3545' },
    { label: 'Alumnos activos', value: students.filter(s => s.active !== false).length, icon: 'fa-users', color: 'var(--color-gold-dark)' }
  ];
  document.getElementById('reportStats').innerHTML = cards.map(c => `
    <div class="card-bara" style="padding:16px">
      <i class="fas ${c.icon}" style="color:${c.color};font-size:18px"></i>
      <p style="font-family:var(--font-display);font-size:24px;margin-top:8px">${c.value}</p>
      <p style="font-size:11.5px;color:var(--text-muted)">${c.label}</p>
    </div>`).join('');
};

const renderAttendanceReport = () => {
  const el = document.getElementById('attendanceReport');
  const byStudent = {};
  attendanceRows.forEach(a => {
    byStudent[a.studentId] = byStudent[a.studentId] || { present: 0, total: 0, name: a.studentName || studentName(a.studentId) };
    byStudent[a.studentId].total++;
    if (['arrived', 'late'].includes(a.status)) byStudent[a.studentId].present++;
  });
  const rows = Object.entries(byStudent).map(([id, v]) => ({ id, ...v, pct: v.total ? Math.round((v.present / v.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);
  if (rows.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin registros en este rango.</p>`; return; }
  el.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:480px">
    <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
      <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Alumno</th>
      <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Presentes</th>
      <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">Total registros</th>
      <th style="padding:8px 12px;font-size:11.5px;color:var(--text-muted)">% Asistencia</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:8px 12px;font-size:13px;font-weight:600">${escapeHtml(r.name)}</td>
        <td style="padding:8px 12px;font-size:13px">${r.present}</td>
        <td style="padding:8px 12px;font-size:13px">${r.total}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:${r.pct >= 80 ? '#198754' : r.pct >= 50 ? '#ffc107' : '#dc3545'}">${r.pct}%</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
};

const renderPaymentsReport = () => {
  const el = document.getElementById('paymentsReport');
  const counts = { paid: 0, pending: 0, overdue: 0 };
  const amounts = { paid: 0, pending: 0, overdue: 0 };
  paymentsRows.forEach(p => { if (p.status in counts) { counts[p.status]++; amounts[p.status] += (p.amount || 0); } });
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    ${Object.entries(PAY_STATUS_LABEL).map(([k, v]) => `
      <div class="card-bara" style="padding:14px;text-align:center">
        <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase">${v}</p>
        <p style="font-family:var(--font-display);font-size:22px">${counts[k]}</p>
        <p style="font-size:12px;color:var(--text-secondary)">${formatCOP(amounts[k])}</p>
      </div>`).join('')}
  </div>`;
};

const renderCategoriesReport = () => {
  const el = document.getElementById('categoriesReport');
  const active = students.filter(s => s.active !== false);
  if (categories.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin categorías creadas.</p>`; return; }
  el.innerHTML = categories.map(c => {
    const count = active.filter(s => catNamesFor(s).split(', ').includes(c.name)).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color)">
      <span style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600"><span style="width:12px;height:12px;border-radius:3px;background:${c.color || 'var(--color-primary)'}"></span>${escapeHtml(c.name)}</span>
      <span style="font-size:13px;color:var(--text-secondary)">${count} alumno(s)</span>
    </div>`;
  }).join('');
};

const attendanceCsvRows = () => {
  const header = ['Alumno', 'Fecha', 'Estado'];
  const rows = attendanceRows.map(a => [a.studentName || studentName(a.studentId), a.date, STATUS_LABEL_ES[a.status] || a.status]);
  return [header, ...rows];
};

const paymentsCsvRows = () => {
  const header = ['Alumno', 'Monto', 'Estado', 'Fecha de vencimiento'];
  const rows = paymentsRows.map(p => [studentName(p.studentId), p.amount || 0, PAY_STATUS_LABEL[p.status] || p.status, p.dueDate?.toDate ? p.dueDate.toDate().toISOString().slice(0, 10) : '']);
  return [header, ...rows];
};

const exportCsv = (rows, filename) => {
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exportado', 'success');
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
