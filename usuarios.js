/**
 * @file usuarios.js
 * @description Alta y gestión de usuarios (entrenadores, coordinadores, padres)
 *              — Barsa Soacha Academy. Solo administradores.
 *
 * Crea la cuenta en Firebase Authentication usando una app secundaria de
 * Firebase, así la sesión del administrador actual NO se cierra ni se
 * reemplaza por la del usuario nuevo.
 */
import { requireAuth, sendPasswordReset } from './auth.js';
import { initShell, toast, showConfirm, hideLoader, showLoader, updateDocument, deleteDocument, subscribeCollection } from './app.js';
import { COLLECTIONS, FIREBASE_CONFIG, db } from './firebase-config.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const ROLE_LABEL = { admin: 'Administrador', coordinator: 'Coordinador', coach: 'Entrenador', parent: 'Padre de familia' };

let users = [];

const init = async () => {
  showLoader('Cargando usuarios…');
  const profile = await requireAuth('admin');
  if (!profile) return;
  initShell();

  document.getElementById('btnNewUser')?.addEventListener('click', () => openForm());

  subscribeCollection(COLLECTIONS.USERS, (list) => {
    users = list;
    render(list);
    hideLoader();
  });
};

const render = (list) => {
  const el = document.getElementById('usersContainer');
  if (!el) return;
  el.innerHTML = `<div class="card-bara"><div class="card-body-bara" style="padding:0">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border-color)">
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Nombre</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Correo</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Rol</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)">Estado</th>
        <th style="padding:12px 20px;font-size:12px;color:var(--text-muted)"></th>
      </tr></thead>
      <tbody>
        ${list.map(u => `
        <tr style="border-bottom:1px solid var(--border-color)">
          <td style="padding:12px 20px;font-weight:600;font-size:13.5px">${escapeHtml(u.displayName || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${escapeHtml(u.email || '—')}</td>
          <td style="padding:12px 20px;font-size:13px;color:var(--text-secondary)">${ROLE_LABEL[u.role] || u.role}</td>
          <td style="padding:12px 20px"><span class="badge-status ${u.active === false ? 'badge-overdue' : 'badge-paid'}">${u.active === false ? 'Inactivo' : 'Activo'}</span></td>
          <td style="padding:12px 20px;white-space:nowrap">
            <button class="btn-outline-bara" style="padding:6px 10px" data-edit="${u.id}"><i class="fas fa-pen"></i></button>
            <button class="btn-outline-bara" style="padding:6px 10px" data-reset="${u.id}" title="Enviar correo para restablecer contraseña"><i class="fas fa-key"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;

  el.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    openEdit(users.find(u => u.id === btn.dataset.edit));
  }));
  el.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', async () => {
    const u = users.find(x => x.id === btn.dataset.reset);
    if (!u?.email) return;
    const r = await sendPasswordReset(u.email);
    toast(r.success ? `Correo de restablecimiento enviado a ${u.email}` : r.error, r.success ? 'success' : 'error');
  }));
};

const openForm = () => {
  Swal.fire({
    title: 'Nuevo usuario',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre completo</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="Nombre">
        <label class="form-label-bara">Correo</label>
        <input id="swalEmail" type="email" class="form-control-bara swal2-input" style="margin:0 0 12px" placeholder="correo@ejemplo.com">
        <label class="form-label-bara">Rol</label>
        <select id="swalRole" class="form-control-bara swal2-input" style="margin:0">
          <option value="coach">Entrenador</option>
          <option value="parent">Padre de familia</option>
          <option value="coordinator">Coordinador</option>
          <option value="admin">Administrador</option>
        </select>
        <p style="font-size:12px;color:var(--text-muted);margin-top:10px">
          Se creará la cuenta y se enviará un correo para que la persona elija su propia contraseña.
        </p>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Crear cuenta',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#00C853',
    focusConfirm: false,
    preConfirm: () => {
      const displayName = document.getElementById('swalName').value.trim();
      const email = document.getElementById('swalEmail').value.trim();
      if (!displayName || !email) { Swal.showValidationMessage('Completa nombre y correo'); return false; }
      return { displayName, email, role: document.getElementById('swalRole').value };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await createUserAccount(res.value);
  });
};

const createUserAccount = async ({ displayName, email, role }) => {
  showLoader('Creando cuenta…');
  const tempPassword = 'Barsa' + Math.random().toString(36).slice(2, 10) + '!9';
  // App secundaria: aísla el signIn del nuevo usuario de la sesión del admin.
  const secondaryApp = initializeApp(FIREBASE_CONFIG, 'Secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), {
      displayName, email, role, active: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await signOut(secondaryAuth);
    await sendPasswordReset(email);
    toast(`Cuenta creada. Se envió un correo a ${email} para elegir contraseña.`, 'success', 5000);
  } catch (err) {
    toast('Error creando la cuenta: ' + (err.message || err.code), 'error', 6000);
  } finally {
    await deleteApp(secondaryApp);
    hideLoader();
  }
};

const openEdit = (existing) => {
  Swal.fire({
    title: 'Editar usuario',
    html: `
      <div style="text-align:left">
        <label class="form-label-bara">Nombre completo</label>
        <input id="swalName" class="form-control-bara swal2-input" style="margin:0 0 12px" value="${escapeHtml(existing.displayName || '')}">
        <label class="form-label-bara">Rol</label>
        <select id="swalRole" class="form-control-bara swal2-input" style="margin:0 0 12px">
          ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${existing.role === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary)">
          <input id="swalActive" type="checkbox" ${existing.active === false ? '' : 'checked'}> Cuenta activa
        </label>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#00C853',
    focusConfirm: false,
    preConfirm: () => ({
      displayName: document.getElementById('swalName').value.trim(),
      role: document.getElementById('swalRole').value,
      active: document.getElementById('swalActive').checked
    })
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    await updateDocument(COLLECTIONS.USERS, existing.id, res.value);
    toast('Usuario actualizado', 'success');
  });
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

document.addEventListener('DOMContentLoaded', init);
