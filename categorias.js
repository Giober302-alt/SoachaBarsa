/**
 * @file categorias.js
 * @description Gestión de categorías (equipos por edad) — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';

let categories = [];
let unsub = null;

const init = async () => {
  showLoader('Cargando categorías…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewCategory')?.addEventListener('click', () => openForm());

  unsub = subscribeCollection(COLLECTIONS.CATEGORIES, (list) => {
    categories = list;
    render(list);
    hideLoader();
  });
};

const render = (list) => {
  const el = document.getElementById('categoriesContainer');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-layer-group"></i><p>Sin categorías todavía. Crea la primera con "Nueva categoría".</p></div>`;
    return;
  }

  el.innerHTML = list.map(c => `
    <div class="card-bara" style="padding:18px;display:flex;align-items:center;gap:14px">
      <div style="width:14px;height:44px;border-radius:6px;background:${c.color || '#8B0000'};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <p style="font-weight:700;font-size:14px;color:var(--text-primary)">${escapeHtml(c.name || '—')}</p>
        <p style="font-size:12px;color:var(--text-muted)">ID: ${c.id}</p>
      </div>
      <button class="btn-outline-bara" style="padding:7px 12px" data-edit="${c.id}"><i class="fas fa-pen"></i></button>
      <button class="btn-outline-bara" style="padding:7px 12px;color:#dc3545;border-color:#dc3545" data-delete="${c.id}"><i class="fas fa-trash"></i></button>
    </div>`).join('');

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(categories.find(c => c.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar categoría?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) {
      await deleteDocument(COLLECTIONS.CATEGORIES, btn.dataset.delete);
      toast('Categoría eliminada', 'success');
    }
  }));
};

const openForm = (existing = null) => {
  Swal.fire({
    title: existing ? 'Editar categoría' : 'Nueva categoría',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 14px" placeholder="Ej: Sub-12" value="${existing ? escapeHtml(existing.name || '') : ''}">
        <label class="form-label-bara">Color</label>
        <input id="swalColor" type="color" style="width:100%;height:42px;border:1.5px solid var(--border-color);border-radius:10px;cursor:pointer" value="${existing?.color || '#8B0000'}">
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => {
      const name = document.getElementById('swalName').value.trim();
      const color = document.getElementById('swalColor').value;
      if (!name) { Swal.showValidationMessage('Escribe un nombre'); return false; }
      return { name, color };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) {
      await updateDocument(COLLECTIONS.CATEGORIES, existing.id, res.value);
      toast('Categoría actualizada', 'success');
    } else {
      await createDocument(COLLECTIONS.CATEGORIES, res.value);
      toast('Categoría creada', 'success');
    }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
