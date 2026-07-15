/**
 * @file alumno-detalle.js
 * @description Ficha completa del alumno — Barsa Soacha Academy.
 *              Pestañas: General, Médica, Documentos, Fotos, Rendimiento, Contacto.
 *              Permisos: admin/coordinador editan todo; entrenador solo
 *              publica Rendimiento; el padre edita Contacto/Médica y sube
 *              documentos y fotos de SU hijo (reforzado por firestore.rules).
 */
import { requireAuth, getCurrentProfile } from './auth.js';
import { initShell, toast, showConfirm, hideLoader, showLoader, formatDate, formatCOP, getCollection, applyTheme, AppState } from './app.js';
import { COLLECTIONS, db, storage } from './firebase-config.js';
import {
  doc, getDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy,
  getDocs, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { notify } from './notifications.js';

const params = new URLSearchParams(location.search);
const studentId = params.get('id');

let profile = null;
let student = null;
let categories = [];
let coaches = [];
let perms = { core: false, contact: false, uploads: false, rendimiento: false };

const init = async () => {
  showLoader('Cargando ficha…');
  profile = await requireAuth();
  if (!profile) return;
  applyTheme(AppState.theme);
  if (profile.role === 'parent') document.getElementById('backLink').href = './portal-padres.html';

  if (!studentId) { showError('Falta el ID del alumno en la URL.'); return; }

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
    if (!snap.exists()) { showError('No se encontró el alumno o no tienes acceso.'); return; }
    student = { id: snap.id, ...snap.data() };
  } catch (err) {
    showError('No tienes permiso para ver esta ficha, o las reglas de Firestore no están publicadas todavía. (' + (err.code || err.message) + ')');
    return;
  }

  perms.core        = ['admin', 'coordinator'].includes(profile.role);
  perms.contact      = perms.core || profile.role === 'parent';
  perms.uploads       = perms.core || profile.role === 'parent';
  perms.rendimiento  = ['admin', 'coordinator', 'coach'].includes(profile.role);

  [categories, coaches] = await Promise.all([
    getCollection(COLLECTIONS.CATEGORIES),
    getCollection(COLLECTIONS.COACHES)
  ]);

  document.getElementById('detailRoot').style.display = 'block';
  bindTabs();
  renderGeneral();
  renderMedical();
  renderContact();
  await Promise.all([renderDocuments(), renderPhotos(), renderPerformance(), renderPayments(), renderChangeLog()]);
  hideLoader();

  const requestedTab = params.get('tab');
  if (requestedTab) {
    const btn = document.querySelector(`.dtab-btn[data-tab="${requestedTab}"]`);
    btn?.click();
  }
};

const showError = (msg) => {
  hideLoader();
  document.getElementById('errorBox').style.display = 'block';
  document.getElementById('errorBox').textContent = msg;
};

// ─── Tabs ─────────────────────────────────────────────────────────────────
const bindTabs = () => {
  document.querySelectorAll('.dtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dtab-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
    });
  });
};

const age = (birth) => {
  if (!birth) return '—';
  const b = birth.toDate ? birth.toDate() : new Date(birth);
  const diff = Date.now() - b.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
};

const catName = (id) => categories.find(c => c.id === id)?.name || '—';
const catNamesFor = (s) => {
  const ids = (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);
  return ids.map(id => catName(id)).join(', ') || '—';
};
const coachName = (id) => coaches.find(c => c.id === id)?.displayName || 'Sin asignar';
const studentCategoryIds = (s) => (s.categoryIds && s.categoryIds.length) ? s.categoryIds : (s.categoryId ? [s.categoryId] : []);

// ─── General ──────────────────────────────────────────────────────────────
const renderGeneral = () => {
  const el = document.getElementById('tab-general');
  el.innerHTML = `
    <div class="card-bara" style="padding:24px">
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        <div class="avatar avatar-xl" style="background:var(--color-primary);overflow:hidden">
          ${student.photoURL ? `<img src="${student.photoURL}" style="width:100%;height:100%;object-fit:cover">` : (student.displayName || '?').slice(0,2).toUpperCase()}
        </div>
        <div>
          <h2 style="font-size:20px;font-weight:700">${escapeHtml(student.displayName || '—')}</h2>
          <span class="badge-status ${student.active === false ? 'badge-overdue' : 'badge-paid'}">${student.active === false ? 'Inactivo' : 'Activo'}</span>
        </div>
        ${perms.core ? `<button class="btn-outline-bara" style="margin-left:auto" id="btnEditGeneral"><i class="fas fa-pen"></i> Editar</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px">
        ${field('Documento', `${student.documentType || 'CC'} ${student.documentNumber || '—'}`)}
        ${field('Fecha de nacimiento', formatDate(student.birthDate))}
        ${field('Edad', age(student.birthDate) + ' años')}
        ${field('Categoría / Equipo', catNamesFor(student))}
        ${field('Entrenador asignado', coachName(student.coachId))}
      </div>
    </div>`;
  document.getElementById('btnEditGeneral')?.addEventListener('click', openGeneralForm);
};

const field = (label, value) => `<div><p style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${label}</p><p style="font-size:14px;font-weight:600;margin-top:2px">${escapeHtml(String(value))}</p></div>`;

const openGeneralForm = () => {
  Swal.fire({
    title: 'Editar información general',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Tipo y número de documento</label>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <select id="swalDocType" class="form-control-bara swal2-input" style="margin:0;max-width:110px">
            ${['CC','TI','RC','CE'].map(t => `<option ${student.documentType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <input id="swalDocNumber" class="form-control-bara swal2-input" style="margin:0;flex:1" value="${escapeHtml(student.documentNumber || '')}">
        </div>
        <label class="form-label-bara">Categorías <span style="font-weight:400;color:var(--text-muted)">(puede pertenecer a varias)</span></label>
        <div style="border:1.5px solid var(--border-color);border-radius:10px;padding:8px 14px;margin:0 0 12px;max-height:130px;overflow-y:auto">
          ${categories.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13.5px"><input type="checkbox" class="swalCatChk" value="${c.id}" ${studentCategoryIds(student).includes(c.id) ? 'checked' : ''}> ${escapeHtml(c.name)}</label>`).join('') || '<p style="font-size:12.5px;color:var(--text-muted)">Crea categorías primero.</p>'}
        </div>
        <label class="form-label-bara">Entrenador asignado</label>
        <select id="swalCoach" class="form-control-bara swal2-input" style="margin:0 0 12px">
          <option value="">Sin asignar</option>
          ${coaches.map(c => `<option value="${c.id}" ${student.coachId === c.id ? 'selected' : ''}>${escapeHtml(c.displayName)}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)">
          <input id="swalActive" type="checkbox" ${student.active === false ? '' : 'checked'}> Activo
        </label>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => ({
      documentType: document.getElementById('swalDocType').value,
      documentNumber: document.getElementById('swalDocNumber').value.trim(),
      categoryIds: Array.from(document.querySelectorAll('.swalCatChk:checked')).map(el => el.value),
      categoryId: null,
      coachId: document.getElementById('swalCoach').value || null,
      active: document.getElementById('swalActive').checked
    })
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await updateDoc(doc(db, COLLECTIONS.STUDENTS, studentId), { ...res.value, updatedAt: serverTimestamp() });
    Object.assign(student, res.value);
    toast('Ficha actualizada', 'success');
    renderGeneral();
  });
};

// ─── Médica ───────────────────────────────────────────────────────────────
const renderMedical = () => {
  const m = student.medical || {};
  const el = document.getElementById('tab-medical');
  el.innerHTML = `
    <div class="card-bara" style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <p style="font-weight:700;font-size:15px">Ficha médica</p>
        ${perms.contact ? `<button class="btn-outline-bara" id="btnEditMedical"><i class="fas fa-pen"></i> Editar</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
        ${field('Tipo de sangre', m.bloodType || '—')}
        ${field('EPS', m.eps || '—')}
        ${field('Alergias', m.allergies || '—')}
        ${field('Medicamentos', m.medications || '—')}
        ${field('Restricciones', m.restrictions || '—')}
        ${field('Contacto de emergencia', m.emergencyContact || '—')}
        ${field('Teléfono de emergencia', m.emergencyPhone || '—')}
      </div>
      ${m.notes ? `<div style="margin-top:16px"><p style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Observaciones</p><p style="font-size:13.5px;margin-top:4px;white-space:pre-wrap">${escapeHtml(m.notes)}</p></div>` : ''}
    </div>`;
  document.getElementById('btnEditMedical')?.addEventListener('click', openMedicalForm);
};

const openMedicalForm = () => {
  const m = student.medical || {};
  Swal.fire({
    title: 'Ficha médica',
    width: 480,
    html: `
      <div style="text-align:left">
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div style="flex:1"><label class="form-label-bara">Tipo de sangre</label><input id="mBlood" class="form-control-bara swal2-input" style="margin:0" value="${escapeHtml(m.bloodType || '')}"></div>
          <div style="flex:1"><label class="form-label-bara">EPS</label><input id="mEps" class="form-control-bara swal2-input" style="margin:0" value="${escapeHtml(m.eps || '')}"></div>
        </div>
        <label class="form-label-bara">Alergias</label>
        <input id="mAllergies" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(m.allergies || '')}">
        <label class="form-label-bara">Medicamentos</label>
        <input id="mMeds" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(m.medications || '')}">
        <label class="form-label-bara">Restricciones médicas</label>
        <input id="mRestrictions" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(m.restrictions || '')}">
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div style="flex:1"><label class="form-label-bara">Contacto de emergencia</label><input id="mContact" class="form-control-bara swal2-input" style="margin:0" value="${escapeHtml(m.emergencyContact || '')}"></div>
          <div style="flex:1"><label class="form-label-bara">Teléfono</label><input id="mPhone" class="form-control-bara swal2-input" style="margin:0" value="${escapeHtml(m.emergencyPhone || '')}"></div>
        </div>
        <label class="form-label-bara">Observaciones</label>
        <textarea id="mNotes" class="form-control-bara swal2-textarea" style="margin:0">${escapeHtml(m.notes || '')}</textarea>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => ({
      medical: {
        bloodType: document.getElementById('mBlood').value.trim(),
        eps: document.getElementById('mEps').value.trim(),
        allergies: document.getElementById('mAllergies').value.trim(),
        medications: document.getElementById('mMeds').value.trim(),
        restrictions: document.getElementById('mRestrictions').value.trim(),
        emergencyContact: document.getElementById('mContact').value.trim(),
        emergencyPhone: document.getElementById('mPhone').value.trim(),
        notes: document.getElementById('mNotes').value.trim()
      }
    })
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await updateDoc(doc(db, COLLECTIONS.STUDENTS, studentId), { ...res.value, updatedAt: serverTimestamp() });
    student.medical = res.value.medical;
    toast('Ficha médica actualizada', 'success');
    renderMedical();
    logChange(`${profile.role === 'parent' ? 'El padre/madre' : 'Staff'} actualizó la ficha médica`);
    renderChangeLog();
  });
};

// ─── Contacto / adicional ──────────────────────────────────────────────────
const renderContact = () => {
  const c = student.contact || {};
  const el = document.getElementById('tab-contact');
  el.innerHTML = `
    <div class="card-bara" style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <p style="font-weight:700;font-size:15px">Contacto e información adicional</p>
        ${perms.contact ? `<button class="btn-outline-bara" id="btnEditContact"><i class="fas fa-pen"></i> Editar</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
        ${field('Dirección', c.address || '—')}
        ${field('Teléfono(s)', c.phones || '—')}
        ${field('Correo del padre/acudiente', student.parentEmail || '—')}
        ${field('Teléfono del acudiente (WhatsApp)', student.parentPhone || '—')}
        ${field('Personas autorizadas para recoger', c.authorizedPickup || '—')}
      </div>
    </div>
    <div class="card-bara" style="padding:20px;margin-top:14px">
      <p style="font-weight:700;font-size:13px;margin-bottom:8px"><i class="fas fa-clock-rotate-left"></i> Historial de cambios</p>
      <div id="changeLogList"><p style="font-size:12px;color:var(--text-muted)">Cargando…</p></div>
    </div>`;
  document.getElementById('btnEditContact')?.addEventListener('click', openContactForm);
};

const openContactForm = () => {
  const c = student.contact || {};
  Swal.fire({
    title: 'Contacto e información adicional',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Dirección</label>
        <input id="cAddress" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(c.address || '')}">
        <label class="form-label-bara">Teléfono(s)</label>
        <input id="cPhones" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(c.phones || '')}">
        <label class="form-label-bara">Teléfono del acudiente (WhatsApp)</label>
        <input id="cParentPhone" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="57 300 1234567" value="${escapeHtml(student.parentPhone || '')}">
        <label class="form-label-bara">Personas autorizadas para recoger al niño(a)</label>
        <textarea id="cPickup" class="form-control-bara swal2-textarea" style="margin:0">${escapeHtml(c.authorizedPickup || '')}</textarea>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => ({
      contact: {
        address: document.getElementById('cAddress').value.trim(),
        phones: document.getElementById('cPhones').value.trim(),
        authorizedPickup: document.getElementById('cPickup').value.trim()
      },
      parentPhone: document.getElementById('cParentPhone').value.trim() || null
    })
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await updateDoc(doc(db, COLLECTIONS.STUDENTS, studentId), { ...res.value, updatedAt: serverTimestamp() });
    student.contact = res.value.contact;
    student.parentPhone = res.value.parentPhone;
    toast('Datos actualizados', 'success');
    renderContact();
    logChange(`${profile.role === 'parent' ? 'El padre/madre' : 'Staff'} actualizó contacto/información adicional`);
    renderChangeLog();
  });
};

// ─── Documentos ─────────────────────────────────────────────────────────────
const DOC_TYPES = ['Registro civil', 'Tarjeta de identidad', 'Documento de identidad', 'EPS', 'Certificado médico', 'Consentimiento', 'Carné de vacunación', 'Seguro', 'Otro'];

const renderDocuments = async () => {
  const el = document.getElementById('tab-documents');
  el.innerHTML = `
    ${perms.uploads ? `<div class="card-bara" style="padding:18px;margin-bottom:16px">
      <label class="form-label-bara">Subir documento</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="docTypeSelect" class="form-control-bara" style="max-width:220px">${DOC_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
        <input type="file" id="docFileInput" class="form-control-bara" style="max-width:280px">
        <button class="btn-primary-bara" id="btnUploadDoc"><i class="fas fa-upload"></i> Subir</button>
      </div>
    </div>` : ''}
    <div id="documentsList"><div class="skeleton-card"></div></div>`;

  document.getElementById('btnUploadDoc')?.addEventListener('click', uploadDocument);

  const snap = await getDocs(query(collection(db, 'documents'), where('studentId', '==', studentId)));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const listEl = document.getElementById('documentsList');
  if (list.length === 0) { listEl.innerHTML = `<div class="empty-widget"><i class="fas fa-file"></i><p>Sin documentos todavía.</p></div>`; return; }

  listEl.innerHTML = list.map(d => `
    <div class="card-bara" style="padding:14px 18px;display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <i class="fas fa-file-lines" style="color:var(--color-primary);font-size:18px"></i>
      <div style="flex:1;min-width:0"><p style="font-weight:600;font-size:13.5px">${escapeHtml(d.name || d.type)}</p><p style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(d.type || '')} · ${formatDate(d.createdAt)}</p></div>
      <a href="${d.fileURL}" target="_blank" rel="noopener" class="btn-outline-bara" style="padding:6px 10px"><i class="fas fa-eye"></i></a>
      ${(perms.core || (perms.uploads && d.uploadedByRole === 'parent')) ? `<button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-del-doc="${d.id}" data-path="${d.storagePath}"><i class="fas fa-trash"></i></button>` : ''}
    </div>`).join('');

  listEl.querySelectorAll('[data-del-doc]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar documento?', '', 'Eliminar');
    if (!ok) return;
    try { await deleteObject(ref(storage, btn.dataset.path)); } catch (e) {}
    await deleteDoc(doc(db, 'documents', btn.dataset.delDoc));
    toast('Documento eliminado', 'success');
    renderDocuments();
  }));
};

const uploadDocument = async () => {
  const type = document.getElementById('docTypeSelect').value;
  const file = document.getElementById('docFileInput').files[0];
  if (!file) { toast('Elige un archivo', 'warning'); return; }
  showLoader('Subiendo documento…');
  try {
    const path = `students/${studentId}/documents/${Date.now()}_${file.name}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, file);
    const url = await getDownloadURL(sref);
    await addDoc(collection(db, 'documents'), {
      studentId, type, name: file.name, fileURL: url, storagePath: path,
      uploadedByRole: profile.role, createdAt: serverTimestamp()
    });
    toast('Documento subido', 'success');
    await renderDocuments();
  } catch (err) {
    toast('Error subiendo el archivo: ' + (err.code || err.message), 'error');
  }
  hideLoader();
};

// ─── Fotos ──────────────────────────────────────────────────────────────────
const renderPhotos = async () => {
  const el = document.getElementById('tab-photos');
  el.innerHTML = `
    ${perms.uploads ? `<div class="card-bara" style="padding:18px;margin-bottom:16px">
      <label class="form-label-bara">Subir fotografía</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input type="file" accept="image/*" id="photoFileInput" class="form-control-bara" style="max-width:280px">
        <button class="btn-primary-bara" id="btnUploadPhoto"><i class="fas fa-upload"></i> Subir</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-secondary)">
          <input type="checkbox" id="setAsProfile"> Usar como foto de perfil
        </label>
      </div>
    </div>` : ''}
    <div id="photosGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px"></div>`;

  document.getElementById('btnUploadPhoto')?.addEventListener('click', uploadPhoto);

  const snap = await getDocs(query(collection(db, 'photos'), where('studentId', '==', studentId)));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const grid = document.getElementById('photosGrid');
  if (list.length === 0) { grid.innerHTML = `<div class="empty-widget" style="grid-column:1/-1"><i class="fas fa-images"></i><p>Sin fotos todavía.</p></div>`; return; }

  grid.innerHTML = list.map(p => `
    <div style="position:relative;border-radius:10px;overflow:hidden;aspect-ratio:1">
      <img src="${p.url}" style="width:100%;height:100%;object-fit:cover">
      ${(perms.core || (perms.uploads && p.uploadedByRole === 'parent')) ? `<button data-del-photo="${p.id}" data-path="${p.storagePath}" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:6px;padding:4px 6px;cursor:pointer"><i class="fas fa-trash" style="font-size:11px"></i></button>` : ''}
    </div>`).join('');

  grid.querySelectorAll('[data-del-photo]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar foto?', '', 'Eliminar');
    if (!ok) return;
    try { await deleteObject(ref(storage, btn.dataset.path)); } catch (e) {}
    await deleteDoc(doc(db, 'photos', btn.dataset.delPhoto));
    toast('Foto eliminada', 'success');
    renderPhotos();
  }));
};

const uploadPhoto = async () => {
  const file = document.getElementById('photoFileInput').files[0];
  if (!file) { toast('Elige una imagen', 'warning'); return; }
  const asProfile = document.getElementById('setAsProfile').checked;
  showLoader('Subiendo foto…');
  try {
    const path = `students/${studentId}/photos/${Date.now()}_${file.name}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, file);
    const url = await getDownloadURL(sref);
    await addDoc(collection(db, 'photos'), { studentId, url, storagePath: path, uploadedByRole: profile.role, createdAt: serverTimestamp() });
    if (asProfile) {
      await updateDoc(doc(db, COLLECTIONS.STUDENTS, studentId), { photoURL: url, updatedAt: serverTimestamp() });
      student.photoURL = url;
      renderGeneral();
    }
    toast('Foto subida', 'success');
    await renderPhotos();
  } catch (err) {
    toast('Error subiendo la foto: ' + (err.code || err.message), 'error');
  }
  hideLoader();
};

// ─── Rendimiento ────────────────────────────────────────────────────────────
const renderPerformance = async () => {
  const el = document.getElementById('tab-performance');
  el.innerHTML = `
    ${perms.rendimiento ? `<div class="card-bara" style="padding:18px;margin-bottom:16px">
      <label class="form-label-bara">Categoría</label>
      <select id="perfCategory" class="form-control-bara" style="margin-bottom:8px;max-width:220px">
        <option value="Fortaleza">Fortaleza</option>
        <option value="Por mejorar">Aspecto por mejorar</option>
        <option value="Objetivo">Objetivo</option>
        <option value="Observación">Observación general</option>
      </select>
      <textarea id="perfText" class="form-control-bara" style="margin-bottom:8px;min-height:70px" placeholder="Escribe la observación…"></textarea>
      <button class="btn-primary-bara" id="btnAddPerf"><i class="fas fa-plus"></i> Publicar</button>
    </div>` : ''}
    <div id="perfList"><div class="skeleton-card"></div></div>`;

  document.getElementById('btnAddPerf')?.addEventListener('click', addPerformanceNote);

  const snap = await getDocs(query(collection(db, 'performanceNotes'), where('studentId', '==', studentId), orderBy('createdAt', 'desc')));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const listEl = document.getElementById('perfList');
  if (list.length === 0) { listEl.innerHTML = `<div class="empty-widget"><i class="fas fa-chart-line"></i><p>Sin observaciones todavía.</p></div>`; return; }

  listEl.innerHTML = list.map(n => `
    <div class="card-bara" style="padding:14px 18px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="badge-status badge-excused">${escapeHtml(n.category || 'Observación')}</span>
        ${n.rating ? `<span style="color:var(--color-gold);font-size:14px">${'★'.repeat(n.rating)}${'☆'.repeat(5 - n.rating)}</span>` : ''}
      </div>
      <p style="font-size:13.5px;margin-top:8px;white-space:pre-wrap">${escapeHtml(n.text || '')}</p>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px">${escapeHtml(n.coachName || '')} · ${formatDate(n.createdAt)}</p>
    </div>`).join('');
};

const addPerformanceNote = async () => {
  const category = document.getElementById('perfCategory').value;
  const text = document.getElementById('perfText').value.trim();
  if (!text) { toast('Escribe una observación', 'warning'); return; }
  await addDoc(collection(db, 'performanceNotes'), {
    studentId, category, text, coachName: profile.displayName || '', createdAt: serverTimestamp()
  });
  if (student.parentEmail) {
    await notify({ parentEmail: student.parentEmail, title: `Nueva observación de ${student.displayName}`, body: `${category}: ${text}` });
  }
  document.getElementById('perfText').value = '';
  toast('Observación publicada', 'success');
  renderPerformance();
};

// ─── Pagos ──────────────────────────────────────────────────────────────────
const PAY_STATUS_LABEL = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido' };
const PAY_STATUS_BADGE = { paid: 'badge-paid', pending: 'badge-pending', overdue: 'badge-overdue' };
const PAY_DOT = { paid: '🟢', pending: '🟡', overdue: '🔴' };

const renderPayments = async () => {
  const el = document.getElementById('tab-payments');
  el.innerHTML = `
    ${perms.core ? `<div class="card-bara" style="padding:18px;margin-bottom:16px">
      <button class="btn-primary-bara" id="btnAddPayment"><i class="fas fa-plus"></i> Registrar pago</button>
    </div>` : ''}
    <div id="paymentsList"><div class="skeleton-card"></div></div>`;

  document.getElementById('btnAddPayment')?.addEventListener('click', openPaymentForm);

  const snap = await getDocs(query(collection(db, 'payments'), where('studentId', '==', studentId)));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const listEl = document.getElementById('paymentsList');
  if (list.length === 0) { listEl.innerHTML = `<div class="empty-widget"><i class="fas fa-credit-card"></i><p>Sin pagos registrados.</p></div>`; return; }

  listEl.innerHTML = list.map(p => `
    <div class="card-bara" style="padding:14px 18px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:18px">${PAY_DOT[p.status] || ''}</span>
      <div style="flex:1;min-width:0">
        <p style="font-weight:600;font-size:13.5px">${formatCOP(p.amount || 0)}</p>
        <p style="font-size:11.5px;color:var(--text-muted)">${formatDate(p.createdAt)}${p.dueDate ? ' · vence ' + formatDate(p.dueDate) : ''}</p>
      </div>
      <span class="badge-status ${PAY_STATUS_BADGE[p.status] || 'badge-pending'}">${PAY_STATUS_LABEL[p.status] || p.status}</span>
      ${p.receiptURL ? `<a href="${p.receiptURL}" target="_blank" rel="noopener" class="btn-outline-bara" style="padding:6px 10px"><i class="fas fa-receipt"></i></a>` : ''}
      ${perms.core ? `<button class="btn-outline-bara" style="padding:6px 10px;color:#dc3545;border-color:#dc3545" data-del-pay="${p.id}"><i class="fas fa-trash"></i></button>` : ''}
    </div>`).join('');

  listEl.querySelectorAll('[data-del-pay]').forEach(btn => btn.addEventListener('click', async () => {
    const ok = await showConfirm('¿Eliminar pago?', '', 'Eliminar');
    if (!ok) return;
    await deleteDoc(doc(db, 'payments', btn.dataset.delPay));
    toast('Pago eliminado', 'success');
    renderPayments();
  }));
};

const openPaymentForm = () => {
  Swal.fire({
    title: 'Registrar pago',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Monto (COP)</label>
        <input id="payAmount" type="number" class="form-control-bara swal2-input" style="margin:0 0 12px" value="80000">
        <label class="form-label-bara">Fecha de vencimiento</label>
        <input id="payDue" type="date" class="form-control-bara swal2-input" style="margin:0 0 12px">
        <label class="form-label-bara">Estado</label>
        <select id="payStatus" class="form-control-bara swal2-input" style="margin:0">
          ${Object.entries(PAY_STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>`,
    showCancelButton: true, confirmButtonText: 'Crear', cancelButtonText: 'Cancelar', confirmButtonColor: '#8B0000',
    focusConfirm: false,
    preConfirm: () => {
      const dueVal = document.getElementById('payDue').value;
      return {
        studentId,
        amount: Number(document.getElementById('payAmount').value) || 0,
        status: document.getElementById('payStatus').value,
        dueDate: dueVal ? Timestamp.fromDate(new Date(dueVal + 'T00:00:00')) : null
      };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await addDoc(collection(db, 'payments'), { ...res.value, createdAt: serverTimestamp() });
    toast('Pago registrado', 'success');
    if (student.parentEmail) {
      notify({ parentEmail: student.parentEmail, title: `Nuevo pago de ${student.displayName}`, body: `${PAY_STATUS_LABEL[res.value.status]} · ${formatCOP(res.value.amount)}` });
    }
    renderPayments();
  });
};

const logChange = async (summary) => {
  try {
    await addDoc(collection(db, 'studentChangeLog'), {
      studentId, summary, changedBy: profile.displayName || profile.email || 'Padre/Madre',
      changedByRole: profile.role, createdAt: serverTimestamp()
    });
  } catch (err) { console.error('[alumno-detalle] No se pudo registrar el cambio:', err); }
};

const renderChangeLog = async () => {
  const el = document.getElementById('changeLogList');
  if (!el) return;
  const snap = await getDocs(query(collection(db, 'studentChangeLog'), where('studentId', '==', studentId), orderBy('createdAt', 'desc')));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 10);
  if (list.length === 0) { el.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">Sin cambios registrados todavía.</p>`; return; }
  el.innerHTML = list.map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--border-color)">
    <p style="font-size:12.5px">${escapeHtml(l.summary || '')}</p>
    <p style="font-size:11px;color:var(--text-muted);margin-top:2px">${escapeHtml(l.changedBy || '')} · ${formatDate(l.createdAt)}</p>
  </div>`).join('');
};

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
