/**
 * @file alumnos.js
 * @description Gestión de alumnos — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection, getCollection, formatDate
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

let students   = [];
let categories = [];

const init = async () => {
  showLoader('Cargando alumnos…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewStudent')?.addEventListener('click', () => openForm());

  categories = await getCollection(COLLECTIONS.CATEGORIES);

  subscribeCollection(COLLECTIONS.STUDENTS, (list) => {
    students = list;
    render(list);
    hideLoader();
  });
};

const categoryName = (id) => categories.find(c => c.id === id)?.name || '—';

const render = (list) => {
  const el = document.getElementById('studentsContainer');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-users"></i><p>Sin alumnos todavía. Crea el primero con "Nuevo alumno".</p></div>`;
    return;
  }

  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Alumno</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Categoría</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Fecha de nacimiento</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Estado</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)"></th>
      </tr></thead>
      <tbody>
        ${list.map(s => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px">${escapeHtml(s.displayName || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(categoryName(s.categoryId))}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${formatDate(s.birthDate)}</td>
          <td style="padding:12px 20px"><span class="badge-status ${s.active === false ? 'badge-overdue' : 'badge-paid'}">${s.active === false ? 'Inactivo' : 'Activo'}</span></td>
          <td style="padding:12px 20px;white-space:nowrap">
            <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${s.id}"><i class="fas fa-pen"></i></button>
            <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${s.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(students.find(s => s.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar alumno?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) {
      await deleteDocument(COLLECTIONS.STUDENTS, btn.dataset.delete);
      toast('Alumno eliminado', 'success');
    }
  }));
};

const openForm = (existing = null) => {
  const options = categories.map(c => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const birth = existing?.birthDate ? (existing.birthDate.toDate ? existing.birthDate.toDate() : new Date(existing.birthDate)) : null;
  const birthStr = birth ? birth.toISOString().slice(0, 10) : '';

  Swal.fire({
    title: existing ? 'Editar alumno' : 'Nuevo alumno',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre completo</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.displayName || '') : ''}">
        <label class="form-label-bara">Categoría</label>
        <select id="swalCategory" class="form-control-bara swal2-input" style="margin:0 0 12px">
          <option value="">Sin categoría</option>
          ${options}
        </select>
        <label class="form-label-bara">Fecha de nacimiento</label>
        <input id="swalBirth" type="date" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${birthStr}">
        <label class="form-label-bara">Correo del padre/acudiente <span style="font-weight:400;color:var(--text-muted)">(para el Portal de Padres)</span></label>
        <input id="swalParentEmail" type="email" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="padre@correo.com" value="${existing ? escapeHtml(existing.parentEmail || '') : ''}">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)">
          <input id="swalActive" type="checkbox" ${existing?.active === false ? '' : 'checked'}> Activo
        </label>
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => {
      const displayName = document.getElementById('swalName').value.trim();
      if (!displayName) { Swal.showValidationMessage('Escribe un nombre'); return false; }
      const birthVal = document.getElementById('swalBirth').value;
      return {
        displayName,
        categoryId: document.getElementById('swalCategory').value || null,
        birthDate: birthVal ? Timestamp.fromDate(new Date(birthVal + 'T00:00:00')) : null,
        parentEmail: document.getElementById('swalParentEmail').value.trim().toLowerCase() || null,
        active: document.getElementById('swalActive').checked
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) {
      await updateDocument(COLLECTIONS.STUDENTS, existing.id, res.value);
      toast('Alumno actualizado', 'success');
    } else {
      await createDocument(COLLECTIONS.STUDENTS, res.value);
      toast('Alumno creado', 'success');
    }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
