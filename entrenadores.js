/**
 * @file entrenadores.js
 * @description Gestión de entrenadores — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection, getInitials, stringToColor
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';

let coaches = [];

const init = async () => {
  showLoader('Cargando entrenadores…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewCoach')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.COACHES, (list) => {
    coaches = list;
    render(list);
    hideLoader();
  });
};

const render = (list) => {
  const el = document.getElementById('coachesContainer');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-chalkboard-teacher"></i><p>Sin entrenadores todavía. Crea el primero con "Nuevo entrenador".</p></div>`;
    return;
  }

  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Entrenador</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Correo</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Teléfono</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Estado</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)"></th>
      </tr></thead>
      <tbody>
        ${list.map(c => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;display:flex;align-items:center;gap:10px">
            <div class="avatar avatar-sm" style="background:${stringToColor(c.displayName || '')}">${getInitials(c.displayName || '')}</div>
            <span style="font-weight:600;font-size:13.5px">${escapeHtml(c.displayName || '—')}</span>
          </td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(c.email || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(c.phone || '—')}</td>
          <td style="padding:12px 20px"><span class="badge-status ${c.active === false ? 'badge-overdue' : 'badge-paid'}">${c.active === false ? 'Inactivo' : 'Activo'}</span></td>
          <td style="padding:12px 20px;white-space:nowrap">
            <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${c.id}"><i class="fas fa-pen"></i></button>
            <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${c.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(coaches.find(c => c.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar entrenador?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) {
      await deleteDocument(COLLECTIONS.COACHES, btn.dataset.delete);
      toast('Entrenador eliminado', 'success');
    }
  }));
};

const openForm = (existing = null) => {
  Swal.fire({
    title: existing ? 'Editar entrenador' : 'Nuevo entrenador',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre completo</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.displayName || '') : ''}">
        <label class="form-label-bara">Correo</label>
        <input id="swalEmail" type="email" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.email || '') : ''}">
        <label class="form-label-bara">Teléfono</label>
        <input id="swalPhone" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.phone || '') : ''}">
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
      return {
        displayName,
        email: document.getElementById('swalEmail').value.trim(),
        phone: document.getElementById('swalPhone').value.trim(),
        active: document.getElementById('swalActive').checked
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) {
      await updateDocument(COLLECTIONS.COACHES, existing.id, res.value);
      toast('Entrenador actualizado', 'success');
    } else {
      await createDocument(COLLECTIONS.COACHES, res.value);
      toast('Entrenador creado', 'success');
    }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
