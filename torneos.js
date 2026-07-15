/**
 * @file torneos.js
 * @description Torneos — inscripción, aceptación y seguimiento.
 *              Barsa Soacha Academy.
 */
import { requireAuth } from './auth.js';
import { initShell, toast, showConfirm, hideLoader, showLoader, getCollection, formatDate } from './app.js';
import { COLLECTIONS, db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc,
  Timestamp, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { notify } from './notifications.js';

let profile = null;
let tournaments = [];
let categories = [];
let coaches = [];
let students = [];
let openId = null;

const STATUS_LABEL = { pending: 'Pendiente', accepted: 'Aprobado', rejected: 'Rechazado', cancelled: 'Cancelado' };
const STATUS_BADGE = { pending: 'badge-pending', accepted: 'badge-paid', rejected: 'badge-overdue', cancelled: 'badge-excused' };

const init = async () => {
  showLoader('Cargando torneos…');
  profile = await requireAuth('coach');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewTournament')?.addEventListener('click', () => openTournamentForm());
  if (!['admin', 'coordinator'].includes(profile.role)) document.getElementById('btnNewTournament')?.remove();

  [categories, coaches, students] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.COACHES),
    getCollection(COLLECTIONS.STUDENTS)
  ]);

  await loadTournaments();
  hideLoader();
};

const loadTournaments = async () => {
  const snap = await getDocs(query(collection(db, COLLECTIONS.TOURNAMENTS), orderBy('date', 'desc')));
  tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
};

const catName = (id) => categories.find(c => c.id === id)?.name || '—';
const toDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts || 0);
const isSupervisor = (t) => (t.coachEmails || []).includes((profile.email || '').toLowerCase());
const canManage = (t) => ['admin', 'coordinator'].includes(profile.role) || isSupervisor(t);

const render = () => {
  const el = document.getElementById('tournamentsContainer');
  if (!el) return;
  if (tournaments.length === 0) {
    el.innerHTML = `<div class="empty-widget"><i class="fas fa-trophy"></i><p>Sin torneos todavía.</p></div>`;
    return;
  }
  el.innerHTML = tournaments.map(t => {
    const d = toDate(t.date);
    const isPast = d < new Date();
    return `
    <div class="card-bara" style="margin-bottom:14px">
      <div class="card-header-bara" style="cursor:pointer" data-toggle="${t.id}">
        <span class="card-title-bara"><i class="fas fa-trophy"></i> ${escapeHtml(t.name || '—')}</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="badge-status ${isPast ? 'badge-excused' : 'badge-arrived'}">${isPast ? 'Finalizado' : 'Próximo'}</span>
          <i class="fas fa-chevron-down" style="font-size:12px;color:var(--text-muted)"></i>
        </div>
      </div>
      <div class="card-body-bara" id="body-${t.id}" style="display:${openId === t.id ? 'block' : 'none'}">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:16px">
          ${field('Fecha', formatDate(t.date))}
          ${t.callTime ? field('Hora de convocatoria', t.callTime) : ''}
          ${field('Categoría', catName(t.categoryId))}
          ${field('Sede', t.venue || '—')}
          ${field('Entrenadores supervisores', (t.coachEmails || []).join(', ') || '—')}
        </div>
        ${t.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;white-space:pre-wrap">${escapeHtml(t.description)}</p>` : ''}

        ${canManage(t) ? `<div style="display:flex;gap:8px;margin-bottom:16px">
          <button class="btn-outline-bara" data-edit-t="${t.id}"><i class="fas fa-pen"></i> Editar</button>
          ${['admin','coordinator'].includes(profile.role) ? `<button class="btn-outline-bara" style="color:#dc3545;border-color:#dc3545" data-delete-t="${t.id}"><i class="fas fa-trash"></i> Eliminar</button>` : ''}
        </div>` : ''}

        <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Inscripciones</p>
        <div id="regs-${t.id}"><div class="skeleton-row"><div class="sk-circle"></div><div class="sk-text"><div class="sk-line w-60"></div></div></div></div>

        <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin:20px 0 8px">Convocatoria</p>
        <div id="callup-${t.id}"><div class="skeleton-row"><div class="sk-circle"></div><div class="sk-text"><div class="sk-line w-60"></div></div></div></div>

        <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin:20px 0 8px">Seguimiento</p>
        ${canManage(t) ? `<div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="update-input-${t.id}" class="form-control-bara" placeholder="Escribe una actualización (resultado, avance, logística)…">
          <button class="btn-primary-bara" data-add-update="${t.id}"><i class="fas fa-paper-plane"></i></button>
        </div>` : ''}
        <div id="updates-${t.id}"><div class="skeleton-row"><div class="sk-circle"></div><div class="sk-text"><div class="sk-line w-100"></div></div></div></div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-toggle]').forEach(h => h.addEventListener('click', () => {
    const id = h.dataset.toggle;
    openId = openId === id ? null : id;
    render();
    if (openId === id) { loadRegistrations(id); loadUpdates(id); loadCallUp(id); }
  }));
  el.querySelectorAll('[data-edit-t]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTournamentForm(tournaments.find(t => t.id === btn.dataset.editT));
  }));
  el.querySelectorAll('[data-delete-t]').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await showConfirm('¿Eliminar torneo?', 'Esta acción no se puede deshacer.', 'Eliminar');
    if (ok) { await deleteDoc(doc(db, COLLECTIONS.TOURNAMENTS, btn.dataset.deleteT)); toast('Torneo eliminado', 'success'); loadTournaments(); }
  }));
  el.querySelectorAll('[data-add-update]').forEach(btn => btn.addEventListener('click', () => addUpdate(btn.dataset.addUpdate)));

  if (openId) { loadRegistrations(openId); loadUpdates(openId); loadCallUp(openId); }
};

const field = (label, value) => `<div><p style="font-size:11px;color:var(--text-muted);text-transform:uppercase">${label}</p><p style="font-size:13.5px;font-weight:600;margin-top:2px">${escapeHtml(String(value))}</p></div>`;

// ─── Inscripciones ──────────────────────────────────────────────────────────
const loadRegistrations = async (tournamentId) => {
  const snap = await getDocs(query(collection(db, 'tournamentRegistrations'), where('tournamentId', '==', tournamentId)));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const el = document.getElementById(`regs-${tournamentId}`);
  if (!el) return;
  if (list.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin inscripciones todavía.</p>`; return; }

  const t = tournaments.find(x => x.id === tournamentId);
  el.innerHTML = list.map(r => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)">
      <span style="flex:1;font-size:13.5px;font-weight:600">${escapeHtml(r.studentName || '—')}</span>
      <span class="badge-status ${STATUS_BADGE[r.status] || 'badge-pending'}">${STATUS_LABEL[r.status] || r.status}</span>
      ${canManage(t) && r.status === 'pending' ? `
        <button class="btn-outline-bara" style="padding:5px 9px;color:#198754;border-color:#198754" data-accept="${r.id}"><i class="fas fa-check"></i></button>
        <button class="btn-outline-bara" style="padding:5px 9px;color:#dc3545;border-color:#dc3545" data-reject="${r.id}"><i class="fas fa-times"></i></button>` : ''}
    </div>`).join('');

  el.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.accept, 'accepted', tournamentId)));
  el.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => respond(btn.dataset.reject, 'rejected', tournamentId)));
};

const respond = async (regId, status, tournamentId) => {
  await updateDoc(doc(db, 'tournamentRegistrations', regId), { status, respondedAt: serverTimestamp(), respondedBy: profile.displayName || '' });
  toast(status === 'accepted' ? 'Inscripción aceptada' : 'Inscripción rechazada', 'success');
  loadRegistrations(tournamentId);
};

// ─── Seguimiento ────────────────────────────────────────────────────────────
const loadUpdates = async (tournamentId) => {
  const snap = await getDocs(query(collection(db, 'tournamentUpdates'), where('tournamentId', '==', tournamentId), orderBy('createdAt', 'desc')));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const el = document.getElementById(`updates-${tournamentId}`);
  if (!el) return;
  if (list.length === 0) { el.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Sin actualizaciones todavía.</p>`; return; }
  el.innerHTML = list.map(u => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border-color)">
      <p style="font-size:13px">${escapeHtml(u.text || '')}</p>
      <p style="font-size:11px;color:var(--text-muted);margin-top:3px">${escapeHtml(u.author || '')} · ${formatDate(u.createdAt)}</p>
    </div>`).join('');
};

const addUpdate = async (tournamentId) => {
  const input = document.getElementById(`update-input-${tournamentId}`);
  const text = input.value.trim();
  if (!text) return;
  await addDoc(collection(db, 'tournamentUpdates'), { tournamentId, text, author: profile.displayName || '', createdAt: serverTimestamp() });
  input.value = '';
  loadUpdates(tournamentId);

  const regsSnap = await getDocs(query(collection(db, 'tournamentRegistrations'), where('tournamentId', '==', tournamentId), where('status', '==', 'accepted')));
  const t = tournaments.find(x => x.id === tournamentId);
  regsSnap.forEach(r => {
    const data = r.data();
    if (data.parentEmail) notify({ parentEmail: data.parentEmail, title: `Seguimiento: ${t?.name || 'Torneo'}`, body: text });
  });
};

// ─── Convocatoria (call-ups) ────────────────────────────────────────────────
// El entrenador propone la lista de convocados; el admin/coordinador la
// aprueba antes de publicarla. Los padres solo ven la lista ya aprobada
// (ver renderTournaments en portal-padres.js).
const CALLUP_STATUS_LABEL = { proposed: 'Propuesta \u2014 pendiente de aprobaci\u00f3n', approved: 'Aprobada y publicada' };

const loadCallUp = async (tournamentId) => {
  const el = document.getElementById(`callup-${tournamentId}`);
  if (!el) return;
  const t = tournaments.find(x => x.id === tournamentId);
  const snap = await getDoc(doc(db, 'callUps', tournamentId));
  const callUp = snap.exists() ? snap.data() : null;
  const eligible = t.categoryId ? students.filter(s => (s.categoryIds || (s.categoryId ? [s.categoryId] : [])).includes(t.categoryId)) : students;
  const selectedIds = callUp?.studentIds || [];
  const manager = canManage(t);

  if (!manager) {
    if (!callUp) { el.innerHTML = `<p style=\"font-size:13px;color:var(--text-muted)\">A\u00fan no hay convocatoria publicada.</p>`; return; }
    el.innerHTML = `<span class=\"badge-status ${callUp.status === 'approved' ? 'badge-paid' : 'badge-pending'}\" style=\"margin-bottom:10px;display:inline-block\">${CALLUP_STATUS_LABEL[callUp.status]}</span>
      ${callUp.status === 'approved' ? `<div style=\"display:flex;flex-wrap:wrap;gap:6px\">${eligible.filter(s => selectedIds.includes(s.id)).map(s => `<span class=\"badge-status badge-arrived\">${escapeHtml(s.displayName)}</span>`).join('') || '<span style=\"font-size:12.5px;color:var(--text-muted)\">Sin jugadores convocados.</span>'}</div>` : ''}`;
    return;
  }

  el.innerHTML = `
    <div style=\"border:1.5px solid var(--border-color);border-radius:10px;padding:8px 14px;max-height:180px;overflow-y:auto;margin-bottom:10px\">
      ${eligible.map(s => `<label style=\"display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px\">
        <input type=\"checkbox\" class=\"callupChk-${tournamentId}\" value=\"${s.id}\" ${selectedIds.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.displayName)}
      </label>`).join('') || '<p style=\"font-size:12.5px;color:var(--text-muted)\">Sin jugadores en esta categor\u00eda.</p>'}
    </div>
    ${callUp ? `<span class=\"badge-status ${callUp.status === 'approved' ? 'badge-paid' : 'badge-pending'}\" style=\"margin-bottom:10px;display:inline-block\">${CALLUP_STATUS_LABEL[callUp.status]}</span>` : ''}
    <div style=\"display:flex;gap:8px;flex-wrap:wrap\">
      <button class=\"btn-outline-bara\" data-propose-callup=\"${tournamentId}\"><i class=\"fas fa-clipboard-list\"></i> Guardar propuesta</button>
      ${['admin', 'coordinator'].includes(profile.role) ? `<button class=\"btn-primary-bara\" data-approve-callup=\"${tournamentId}\"><i class=\"fas fa-check\"></i> Aprobar y publicar</button>` : ''}
    </div>`;

  document.querySelector(`[data-propose-callup=\"${tournamentId}\"]`)?.addEventListener('click', () => saveCallUp(tournamentId, 'proposed'));
  document.querySelector(`[data-approve-callup=\"${tournamentId}\"]`)?.addEventListener('click', () => saveCallUp(tournamentId, 'approved'));
};

const saveCallUp = async (tournamentId, status) => {
  const t = tournaments.find(x => x.id === tournamentId);
  const studentIds = Array.from(document.querySelectorAll(`.callupChk-${tournamentId}:checked`)).map(el => el.value);
  await setDoc(doc(db, 'callUps', tournamentId), {
    tournamentId, categoryId: t.categoryId || null, studentIds, status,
    proposedBy: profile.displayName || '', updatedAt: serverTimestamp()
  }, { merge: true });
  toast(status === 'approved' ? 'Convocatoria aprobada y publicada' : 'Propuesta de convocatoria guardada', 'success');
  if (status === 'approved') {
    const calledStudents = students.filter(s => studentIds.includes(s.id) && s.parentEmail);
    calledStudents.forEach(s => notify({ parentEmail: s.parentEmail, title: `Convocatoria: ${t.name}`, body: `${s.displayName} fue convocado(a).` }));
  }
  loadCallUp(tournamentId);
};


const openTournamentForm = (existing = null) => {
  const dateStr = existing?.date ? toDate(existing.date).toISOString().slice(0, 10) : '';
  Swal.fire({
    title: existing ? 'Editar torneo' : 'Nuevo torneo',
    width: 480,
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.name || '') : ''}">
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div style="flex:1"><label class="form-label-bara">Fecha</label><input id="swalDate" type="date" class="form-control-bara swal2-input" style="margin:0" value="${dateStr}"></div>
          <div style="flex:1"><label class="form-label-bara">Categoría</label>
            <select id="swalCategory" class="form-control-bara swal2-input" style="margin:0">
              <option value="">Todas</option>
              ${categories.map(c => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <label class="form-label-bara">Sede</label>
        <input id="swalVenue" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${existing ? escapeHtml(existing.venue || '') : ''}">
        <label class="form-label-bara">Hora de convocatoria <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></label>
        <input id="swalCallTime" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="Ej: 7:00 am en la sede" value="${existing ? escapeHtml(existing.callTime || '') : ''}">
        <label class="form-label-bara">Descripción / reglamento</label>
        <textarea id="swalDescription" class="form-control-bara swal2-textarea" style="margin:0 0 12px">${existing ? escapeHtml(existing.description || '') : ''}</textarea>
        <label class="form-label-bara">Entrenadores que supervisan</label>
        <div style="border:1.5px solid var(--border-color);border-radius:10px;padding:8px 14px;max-height:120px;overflow-y:auto">
          ${coaches.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px">
            <input type="checkbox" class="swalCoachChk" value="${(c.email || '').toLowerCase()}" ${(existing?.coachEmails || []).includes((c.email || '').toLowerCase()) ? 'checked' : ''}> ${escapeHtml(c.displayName)} ${c.email ? `(${escapeHtml(c.email)})` : '<span style=\"color:#dc3545\">sin correo</span>'}
          </label>`).join('') || '<p style="font-size:12.5px;color:var(--text-muted)">Sin entrenadores registrados.</p>'}
        </div>
      </div>`,
    showCancelButton: true, confirmButtonText: existing ? 'Guardar' : 'Crear', cancelButtonText: 'Cancelar', confirmButtonColor: '#00C853',
    focusConfirm: false,
    preConfirm: () => {
      const name = document.getElementById('swalName').value.trim();
      const dateVal = document.getElementById('swalDate').value;
      if (!name || !dateVal) { Swal.showValidationMessage('Completa nombre y fecha'); return false; }
      return {
        name,
        date: Timestamp.fromDate(new Date(dateVal + 'T00:00:00')),
        categoryId: document.getElementById('swalCategory').value || null,
        venue: document.getElementById('swalVenue').value.trim(),
        callTime: document.getElementById('swalCallTime').value.trim(),
        description: document.getElementById('swalDescription').value.trim(),
        coachEmails: Array.from(document.querySelectorAll('.swalCoachChk:checked')).map(el => el.value).filter(Boolean)
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    if (existing) {
      await updateDoc(doc(db, COLLECTIONS.TOURNAMENTS, existing.id), { ...res.value, updatedAt: serverTimestamp() });
      toast('Torneo actualizado', 'success');
    } else {
      await addDoc(collection(db, COLLECTIONS.TOURNAMENTS), { ...res.value, createdAt: serverTimestamp() });
      toast('Torneo creado', 'success');
      notify({ audience: 'parents', title: 'Nuevo torneo', body: res.value.name });
      if (res.value.coachEmails.length) {
        notify({ audience: 'coaches', title: 'Nuevo torneo asignado', body: `${res.value.name} — supervisores: ${res.value.coachEmails.join(', ')}` });
      }
    }
    loadTournaments();
  });
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
