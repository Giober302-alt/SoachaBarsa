/**
 * @file app.js
 * @description Core de Barsa Soacha Academy.
 *              ESTRUCTURA PLANA: todos los imports apuntan a la raíz del repositorio.
 * @module App
 * @version 1.1.0
 */

// ─── RUTAS CORREGIDAS: sin carpetas, todo en raíz ────────────────────────────
import { logout, getCurrentProfile, getCurrentRole } from './auth.js';
import { db, COLLECTIONS, ROLES }                   from './firebase-config.js';

import {
  collection, query, where, orderBy, limit,
  getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// ─── Estado global ────────────────────────────────────────────────────────────
export const AppState = {
  theme:       localStorage.getItem('barsa_theme') || 'light',
  sidebarOpen: true,
  loading:     false,
  page:        ''
};

// ─── Shell: sidebar + navbar ──────────────────────────────────────────────────
/** Inicializa el shell de la aplicación. Llamar en cada página protegida. */
export const initShell = () => {
  applyTheme(AppState.theme);
  bindSidebarToggle();
  bindDarkModeToggle();
  bindLogout();
  renderUserBadge();
  highlightActiveNav();
  bindSidebarLinks();
};

// ─── Tema ─────────────────────────────────────────────────────────────────────
export const applyTheme = (theme) => {
  AppState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('barsa_theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
};

const bindDarkModeToggle = () => {
  document.getElementById('darkModeBtn')?.addEventListener('click', () => {
    applyTheme(AppState.theme === 'dark' ? 'light' : 'dark');
  });
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const bindSidebarToggle = () => {
  const btn     = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  if (!btn) return;
  btn.addEventListener('click', toggleSidebar);
  overlay?.addEventListener('click', closeSidebar);
  if (window.innerWidth < 992) closeSidebar();
};

export const toggleSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('mainContent');
  const overlay = document.getElementById('sidebarOverlay');
  AppState.sidebarOpen = !AppState.sidebarOpen;
  sidebar?.classList.toggle('collapsed', !AppState.sidebarOpen);
  main?.classList.toggle('sidebar-collapsed', !AppState.sidebarOpen);
  if (AppState.sidebarOpen && window.innerWidth < 992) overlay?.classList.add('active');
  else overlay?.classList.remove('active');
};

const closeSidebar = () => {
  AppState.sidebarOpen = false;
  document.getElementById('sidebar')?.classList.add('collapsed');
  document.getElementById('mainContent')?.classList.add('sidebar-collapsed');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
};

const highlightActiveNav = () => {
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-page') === current);
  });
};

const bindSidebarLinks = () => {
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', () => { if (window.innerWidth < 992) closeSidebar(); });
  });
};

// ─── Badge de usuario ─────────────────────────────────────────────────────────
const renderUserBadge = () => {
  const profile = getCurrentProfile();
  if (!profile) return;
  const nameEl   = document.getElementById('navUserName');
  const roleEl   = document.getElementById('navUserRole');
  const avatarEl = document.getElementById('navAvatar');
  if (nameEl)   nameEl.textContent = profile.displayName || 'Usuario';
  if (roleEl)   roleEl.textContent = ROLES[profile.role?.toUpperCase()]?.label || profile.role;
  if (avatarEl) {
    if (profile.photoURL) {
      avatarEl.innerHTML = `<img src="${profile.photoURL}" alt="Avatar" class="avatar-img">`;
    } else {
      avatarEl.textContent      = getInitials(profile.displayName || '');
      avatarEl.style.background = stringToColor(profile.displayName || '');
    }
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const bindLogout = () => {
  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const ok = await showConfirm('¿Cerrar sesión?', 'Se cerrará tu sesión actual.');
    if (ok) { showLoader('Cerrando sesión…'); await logout(); }
  });
};

// ─── Loader global ────────────────────────────────────────────────────────────
export const showLoader = (message = 'Cargando…') => {
  const loader = document.getElementById('globalLoader');
  const msg    = document.getElementById('loaderMessage');
  if (loader) loader.classList.add('active');
  if (msg)    msg.textContent = message;
  AppState.loading = true;
};

export const hideLoader = () => {
  document.getElementById('globalLoader')?.classList.remove('active');
  AppState.loading = false;
};

// ─── Toast (SweetAlert2) ──────────────────────────────────────────────────────
export const toast = (message, type = 'info', duration = 3500) => {
  if (!window.Swal) { console.log(`[${type.toUpperCase()}] ${message}`); return; }
  Swal.fire({
    toast: true, position: 'top-end', icon: type,
    title: message, showConfirmButton: false,
    timer: duration, timerProgressBar: true,
    customClass: { popup: 'barsa-toast' }
  });
};

export const showConfirm = async (title, text, confirmText = 'Confirmar') => {
  if (!window.Swal) return confirm(`${title}\n${text}`);
  const result = await Swal.fire({
    title, text, icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#8B0000', cancelButtonColor: '#6c757d',
    confirmButtonText: confirmText, cancelButtonText: 'Cancelar',
    reverseButtons: true
  });
  return result.isConfirmed;
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
export const showSkeleton = (containerId, count = 3, type = 'card') => {
  const el = document.getElementById(containerId);
  if (!el) return;
  const tpls = {
    stat: `<div class="skeleton-stat"><div class="sk-icon"></div><div class="sk-text"><div class="sk-line w-50"></div><div class="sk-line w-75"></div></div></div>`,
    card: `<div class="skeleton-card"><div class="sk-line w-100"></div><div class="sk-line w-75"></div><div class="sk-line w-50"></div></div>`,
    row:  `<div class="skeleton-row"><div class="sk-circle"></div><div class="sk-text"><div class="sk-line w-60"></div><div class="sk-line w-40"></div></div></div>`
  };
  el.innerHTML = Array(count).fill(tpls[type] || tpls.card).join('');
};

// ─── Firestore helpers ────────────────────────────────────────────────────────
export const getCollection = async (collectionName, constraints = []) => {
  try {
    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.error(`[App] getCollection ${collectionName}:`, err); return []; }
};

export const getDocument = async (collectionName, docId) => {
  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) { console.error(`[App] getDocument ${docId}:`, err); return null; }
};

export const createDocument = async (collectionName, data) => {
  try {
    const ref = await addDoc(collection(db, collectionName), {
      ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return ref.id;
  } catch (err) { console.error(`[App] createDocument ${collectionName}:`, err); return null; }
};

export const updateDocument = async (collectionName, docId, data) => {
  try {
    await updateDoc(doc(db, collectionName, docId), { ...data, updatedAt: serverTimestamp() });
    return true;
  } catch (err) { console.error(`[App] updateDocument ${docId}:`, err); return false; }
};

export const deleteDocument = async (collectionName, docId) => {
  try { await deleteDoc(doc(db, collectionName, docId)); return true; }
  catch (err) { console.error(`[App] deleteDocument ${docId}:`, err); return false; }
};

export const subscribeCollection = (collectionName, callback, constraints = []) => {
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error(`[App] snapshot ${collectionName}:`, err)
  );
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
export const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' });
};

export const formatCOP = (v) =>
  new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v);

export const getInitials = (name = '') => {
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : name.substring(0,2).toUpperCase();
};

export const stringToColor = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
};

export const truncate = (text = '', max = 40) =>
  text.length > max ? text.substring(0, max) + '…' : text;

export const today = () => new Date().toISOString().split('T')[0];

export const getGreeting = (name = '') => {
  const h = new Date().getHours();
  const s = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  return `${s}${name ? ', ' + name.split(' ')[0] : ''} 👋`;
};
