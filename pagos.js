/**
 * @file pagos.js
 * @description Registro y estado de pagos — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection, getCollection, formatCOP, formatDate
} from './app.js';
import { COLLECTIONS, db, storage } from './firebase-config.js';
import { Timestamp, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { notify } from './notifications.js';

const PAY_DOT = { paid: '🟢', pending: '🟡', overdue: '🔴' };

let payments = [];
let students = [];

const STATUS_LABEL = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido' };
const STATUS_BADGE = { paid: 'badge-paid', pending: 'badge-pending', overdue: 'badge-overdue' };

const init = async () => {
  showLoader('Cargando pagos…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  students = await getCollection(COLLECTIONS.STUDENTS);
  document.getElementById('btnNewPayment')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.PAYMENTS, (list) => {
    payments = list;
    render(list);
    hideLoader();
  });
};

const studentName = (id) => students.find(s => s.id === id)?.displayName || '—';

const render = (list) => {
  const el = document.getElementById('paymentsContainer');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-credit-card"></i><p>Sin pagos todavía.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Alumno</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Monto</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Fecha</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Estado</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)"></th>
      </tr></thead>
      <tbody>
        ${list.map(p => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px">${escapeHtml(p.studentId ? studentName(p.studentId) : (p.studentName || '—'))}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${formatCOP(p.amount || 0)}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${formatDate(p.createdAt)}${p.dueDate ? ' · vence ' + formatDate(p.dueDate) : ''}</td>
          <td style="padding:12px 20px">${PAY_DOT[p.status] || ''} <span class="badge-status ${STATUS_BADGE[p.status] || 'badge-pending'}">${STATUS_LABEL[p.status] || p.status}</span></td>
          <td style="padding:12px 20px;white-space:nowrap">
            ${p.receiptURL ? `<a href="${p.receiptURL}" target="_blank" rel="noopener" class="btn-outline-bara" style="padding:6px 10px"><i class="fas fa-receipt"></i></a>` : ''}
            <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${p.id}"><i class="fas fa-pen"></i></button>
            <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${p.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(payments.find(p => p.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar pago?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) { await deleteDocument(COLLECTIONS.PAYMENTS, btn.dataset.delete); toast('Pago eliminado', 'success'); }
  }));
};

const openForm = (existing = null) => {
  const options = students.map(s => `<option value="${s.id}" ${existing?.studentId === s.id ? 'selected' : ''}>${escapeHtml(s.displayName)}</option>`).join('');
  Swal.fire({
    title: existing ? 'Editar pago' : 'Nuevo pago',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Alumno</label>
        <select id="swalStudent" class="form-control-bara swal2-input" style="margin:0 0 12px">${options}</select>
        <label class="form-label-bara">Monto (COP)</label>
        <input id="swalAmount" type="number" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing?.amount || 80000}">
        <label class="form-label-bara">Fecha de vencimiento</label>
        <input id="swalDueDate" type="date" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing?.dueDate ? toDateStr(existing.dueDate) : ''}">
        <label class="form-label-bara">Estado</label>
        <select id="swalStatus" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${existing?.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <label class="form-label-bara">Comprobante (opcional)</label>
        <input id="swalReceipt" type="file" class="form-control-bara swal2-input" style="margin:0">
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: async () => {
      const studentId = document.getElementById('swalStudent').value;
      if (!studentId) { Swal.showValidationMessage('Selecciona un alumno'); return false; }
      const dueVal = document.getElementById('swalDueDate').value;
      const file = document.getElementById('swalReceipt').files[0];
      let receiptURL = existing?.receiptURL || null;
      if (file) {
        try {
          const path = `payments/${studentId}/${Date.now()}_${file.name}`;
          const sref = ref(storage, path);
          await uploadBytes(sref, file);
          receiptURL = await getDownloadURL(sref);
        } catch (err) { Swal.showValidationMessage('Error subiendo comprobante: ' + (err.code || err.message)); return false; }
      }
      return {
        studentId,
        amount: Number(document.getElementById('swalAmount').value) || 0,
        status: document.getElementById('swalStatus').value,
        dueDate: dueVal ? Timestamp.fromDate(new Date(dueVal + 'T00:00:00')) : null,
        receiptURL
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) { await updateDocument(COLLECTIONS.PAYMENTS, existing.id, res.value); toast('Pago actualizado', 'success'); }
    else {
      await createDocument(COLLECTIONS.PAYMENTS, res.value);
      toast('Pago creado', 'success');
      const st = students.find(s => s.id === res.value.studentId);
      if (st?.parentEmail) {
        notify({ parentEmail: st.parentEmail, title: `Nuevo pago de ${st.displayName}`, body: `${STATUS_LABEL[res.value.status]} · ${formatCOP(res.value.amount)}` });
      }
    }
  });
};

const toDateStr = (ts) => (ts?.toDate ? ts.toDate() : new Date(ts)).toISOString().slice(0, 10);

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
