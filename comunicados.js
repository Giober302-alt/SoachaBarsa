/**
 * @file comunicados.js
 * @description Comunicados a padres — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection, formatDate, truncate
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';

let announcements = [];

const init = async () => {
  showLoader('Cargando comunicados…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewAnnouncement')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.ANNOUNCEMENTS, (list) => {
    announcements = list.sort((a, b) => (b.pinned === true) - (a.pinned === true));
    render(announcements);
    hideLoader();
  });
};

const render = (list) => {
  const el = document.getElementById('announcementsContainer');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-bullhorn"></i><p>Sin comunicados todavía.</p></div>`;
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="card-bara" style="padding:16px 20px;${a.pinned ? 'border-color:var(--color-gold)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
        <div style="flex:1;min-width:0">
          <p style="font-weight:700;font-size:14px">${a.pinned ? '<i class="fas fa-thumbtack" style="color:var(--color-gold);margin-right:6px"></i>' : ''}${escapeHtml(a.title || '—')}</p>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:6px;white-space:pre-wrap">${escapeHtml(truncate(a.body || '', 220))}</p>
          <p style="font-size:11px;color:var(--text-muted);margin-top:8px">${formatDate(a.createdAt)}</p>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${a.id}"><i class="fas fa-pen"></i></button>
          <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${a.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(announcements.find(a => a.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar comunicado?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) { await deleteDocument(COLLECTIONS.ANNOUNCEMENTS, btn.dataset.delete); toast('Comunicado eliminado', 'success'); }
  }));
};

const openForm = (existing = null) => {
  Swal.fire({
    title: existing ? 'Editar comunicado' : 'Nuevo comunicado',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Título</label>
        <input id="swalTitle" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.title || '') : ''}">
        <label class="form-label-bara">Mensaje</label>
        <textarea id="swalBody" class="form-control-bara swal2-textarea" style="margin:0 0 12px;min-height:100px">${existing ? escapeHtml(existing.body || '') : ''}</textarea>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)">
          <input id="swalPinned" type="checkbox" ${existing?.pinned ? 'checked' : ''}> Fijar arriba
        </label>
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Publicar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => {
      const title = document.getElementById('swalTitle').value.trim();
      if (!title) { Swal.showValidationMessage('Escribe un título'); return false; }
      return {
        title,
        body: document.getElementById('swalBody').value.trim(),
        pinned: document.getElementById('swalPinned').checked
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) { await updateDocument(COLLECTIONS.ANNOUNCEMENTS, existing.id, res.value); toast('Comunicado actualizado', 'success'); }
    else { await createDocument(COLLECTIONS.ANNOUNCEMENTS, res.value); toast('Comunicado publicado', 'success'); }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
