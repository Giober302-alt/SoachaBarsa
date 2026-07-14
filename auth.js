/**
 * @file auth.js
 * @description Módulo de autenticación — Barsa Soacha Academy.
 *              ESTRUCTURA PLANA: importa firebase-config.js desde la raíz.
 * @module Auth
 * @version 1.1.0
 */

// ─── RUTA CORREGIDA: archivo en raíz, sin carpeta js/ ────────────────────────
import { auth, db, COLLECTIONS, ROLES } from './firebase-config.js';

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// ─── Estado interno de sesión ──────────────────────────────────────────────────
let _currentUser    = null;
let _currentProfile = null;

// ─── Observador de estado de sesión ──────────────────────────────────────────
/**
 * Registra un callback que se ejecuta al cambiar el estado de autenticación.
 * @param {Function} callback — recibe (firebaseUser, firestoreProfile) o (null, null)
 * @returns {Function} unsubscribe
 */
export const onSessionChange = (callback) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const profile   = await fetchUserProfile(firebaseUser.uid);
      _currentUser    = firebaseUser;
      _currentProfile = profile;
      callback(firebaseUser, profile);
    } else {
      _currentUser    = null;
      _currentProfile = null;
      callback(null, null);
    }
  });
};

// ─── Login ────────────────────────────────────────────────────────────────────
/**
 * Inicia sesión con correo y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success:boolean, user?:Object, profile?:Object, error?:string}>}
 */
export const login = async (email, password) => {
  try {
    const cred    = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await fetchUserProfile(cred.user.uid);

    if (!profile) {
      await signOut(auth);
      return { success: false, error: 'Perfil de usuario no encontrado. Contacta al administrador.' };
    }

    if (profile.active === false) {
      await signOut(auth);
      return { success: false, error: 'Tu cuenta está desactivada. Contacta al administrador.' };
    }

    // Registrar último acceso
    await setDoc(
      doc(db, COLLECTIONS.USERS, cred.user.uid),
      { lastLogin: serverTimestamp() },
      { merge: true }
    );

    return { success: true, user: cred.user, profile };
  } catch (err) {
    return { success: false, error: parseAuthError(err.code) };
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
/** Cierra la sesión y redirige al login. */
export const logout = async () => {
  await signOut(auth);
  _currentUser    = null;
  _currentProfile = null;
  window.location.href = './login.html';
};

// ─── Reset de contraseña ──────────────────────────────────────────────────────
/**
 * Envía correo de restablecimiento de contraseña.
 * @param {string} email
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export const sendPasswordReset = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { success: true };
  } catch (err) {
    return { success: false, error: parseAuthError(err.code) };
  }
};

// ─── Perfil de Firestore ──────────────────────────────────────────────────────
/**
 * Recupera el perfil del usuario desde Firestore.
 * @param {string} uid
 * @returns {Promise<Object|null>}
 */
export const fetchUserProfile = async (uid) => {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error('[Auth] Error al obtener perfil:', err);
    return null;
  }
};

/**
 * Crea o actualiza el perfil de un usuario en Firestore.
 * @param {string} uid
 * @param {Object} profileData
 */
export const createUserProfile = async (uid, profileData) => {
  await setDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...profileData,
    active:    true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

// ─── Getters de sesión ────────────────────────────────────────────────────────
export const getCurrentUser    = () => _currentUser;
export const getCurrentProfile = () => _currentProfile;
export const getCurrentRole    = () => _currentProfile?.role || null;

// ─── Control de acceso por roles ──────────────────────────────────────────────
/**
 * Verifica si el usuario tiene al menos el nivel de rol indicado.
 * @param {string} requiredRoleKey
 * @returns {boolean}
 */
export const hasRole = (requiredRoleKey) => {
  if (!_currentProfile) return false;
  const currentLevel  = ROLES[_currentProfile.role?.toUpperCase()]?.level || 0;
  const requiredLevel = ROLES[requiredRoleKey?.toUpperCase()]?.level || 99;
  return currentLevel >= requiredLevel;
};

/**
 * Verifica permisos por operación.
 * @param {string} operation — ej: 'create:student', 'read:payments'
 * @returns {boolean}
 */
export const can = (operation) => {
  const role = getCurrentRole();
  if (!role) return false;
  const permissions = {
    admin:       ['*'],
    coordinator: ['create:student','read:student','update:student',
                  'create:attendance','read:attendance','update:attendance',
                  'read:payments','create:payments','update:payments',
                  'read:tournaments','create:tournaments',
                  'read:schedules','create:schedules',
                  'read:announcements','create:announcements',
                  'read:coaches','read:categories','read:reports'],
    coach:       ['create:attendance','read:attendance','update:attendance',
                  'read:student','read:schedules','read:categories','read:announcements'],
    parent:      ['read:attendance:own','read:payments:own',
                  'read:schedules','read:announcements','read:tournaments']
  };
  const userPerms = permissions[role] || [];
  if (userPerms.includes('*')) return true;
  return userPerms.includes(operation);
};

/**
 * Protege una página: redirige al login si no hay sesión.
 * @param {string|null} requiredRole
 * @returns {Promise<Object|false>}
 */
export const requireAuth = (requiredRole = null) => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe();
      if (!firebaseUser) {
        window.location.href = './login.html';
        resolve(false);
        return;
      }
      const profile = await fetchUserProfile(firebaseUser.uid);
      if (!profile || profile.active === false) {
        await signOut(auth);
        window.location.href = './login.html';
        resolve(false);
        return;
      }
      _currentUser    = firebaseUser;
      _currentProfile = profile;
      if (requiredRole && !hasRole(requiredRole)) {
        window.location.href = './dashboard.html?error=unauthorized';
        resolve(false);
        return;
      }
      resolve(profile);
    });
  });
};

// ─── Traducción de errores Firebase ──────────────────────────────────────────
const parseAuthError = (code) => {
  const map = {
    'auth/user-not-found':        'No existe una cuenta con ese correo.',
    'auth/wrong-password':        'Contraseña incorrecta.',
    'auth/invalid-email':         'El formato del correo no es válido.',
    'auth/user-disabled':         'Esta cuenta ha sido deshabilitada.',
    'auth/too-many-requests':     'Demasiados intentos fallidos. Intenta más tarde.',
    'auth/network-request-failed':'Sin conexión a internet.',
    'auth/invalid-credential':    'Correo o contraseña incorrectos.',
    'auth/email-already-in-use':  'Ya existe una cuenta con ese correo.'
  };
  return map[code] || `Error de autenticación (${code}).`;
};
