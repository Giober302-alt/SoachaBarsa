/**
 * @file agenda.js
 * @description Agenda / horarios de eventos — Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import {
  initShell, toast, showConfirm, hideLoader, showLoader,
  createDocument, updateDocument, deleteDocument, subscribeCollection
} from './app.js';
import { COLLECTIONS } from './firebase-config.js';
import { Timestamp, collection, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';

let events = [];

const init = async () => {
  showLoader('Cargando agenda…');
  const profile = await requireAuth('coordinator');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewEvent')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.SCHEDULES, (list) => {
    events = list.sort((a, b) => toDate(a.startTime) - toDate(b.startTime));
    render(events);
    hideLoader();
  });
};

const toDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts || 0);

const typeBadge = (t) => {
  const map = { Entrenamiento: 'badge-arrived', Partido: 'badge-pending', Reunión: 'badge-excused' };
  return map[t] || 'badge-arrived';
};

const render = (list) => {
  const el = document.getElementById('eventsContainer');
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-calendar-alt"></i><p>Sin eventos todavía. Crea el primero con "Nuevo evento".</p></div>`;
    return;
  }
  el.innerHTML = list.map(ev => {
    const d = toDate(ev.startTime);
    return `<div class="card-bara" style="padding:16px 20px;display:flex;align-items:center;gap:16px">
      <div style="min-width:56px;text-align:center">
        <div style="font-family:var(--font-display);font-size:22px;line-height:1;color:var(--text-primary)">${d.getDate()}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">${d.toLocaleDateString('es-CO',{month:'short'})}</div>
      </div>
      <div style="flex:1;min-width:0">
        <p style="font-weight:600;font-size:14px">${escapeHtml(ev.title || '—')}</p>
        <p style="font-size:12px;color:var(--text-muted)"><i class="fas fa-clock"></i> ${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(ev.location || '')}</p>
      </div>
      <span class="badge-status ${typeBadge(ev.type)}">${escapeHtml(ev.type || 'Entrenamiento')}</span>
      <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${ev.id}"><i class="fas fa-pen"></i></button>
      <button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-delete="${ev.id}"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openForm(events.find(e => e.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar evento?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) { await deleteDocument(COLLECTIONS.SCHEDULES, btn.dataset.delete); toast('Evento eliminado', 'success'); }
  }));
};

const openForm = (existing = null) => {
  const d = existing ? toDate(existing.startTime) : new Date();
  const dateStr = existing ? d.toISOString().slice(0, 10) : '';
  const timeStr = existing ? d.toTimeString().slice(0, 5) : '';

  Swal.fire({
    title: existing ? 'Editar evento' : 'Nuevo evento',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Título</label>
        <input id="swalTitle" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.title || '') : ''}">
        <label class="form-label-bara">Tipo</label>
        <select id="swalType" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${['Entrenamiento','Partido','Reunión'].map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <label class="form-label-bara">Lugar</label>
        <input id="swalLocation" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.location || '') : ''}">
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="form-label-bara">Fecha</label>
          <input id="swalDate" type="date" class="form-control-bara swal2-input" style="margin:0" value="${dateStr}"></div>
          <div style="flex:1"><label class="form-label-bara">Hora</label>
          <input id="swalTime" type="time" class="form-control-bara swal2-input" style="margin:0" value="${timeStr}"></div>
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: existing ? 'Guardar' : 'Crear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => {
      const title = document.getElementById('swalTitle').value.trim();
      const date = document.getElementById('swalDate').value;
      const time = document.getElementById('swalTime').value || '00:00';
      if (!title || !date) { Swal.showValidationMessage('Completa título y fecha'); return false; }
      return {
        title,
        type: document.getElementById('swalType').value,
        location: document.getElementById('swalLocation').value.trim(),
        startTime: Timestamp.fromDate(new Date(`${date}T${time}:00`))
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) { await updateDocument(COLLECTIONS.SCHEDULES, existing.id, res.value); toast('Evento actualizado', 'success'); }
    else { await createDocument(COLLECTIONS.SCHEDULES, res.value); toast('Evento creado', 'success'); }
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
