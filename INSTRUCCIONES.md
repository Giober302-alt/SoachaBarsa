# Barsa Soacha Academy — Guía de implementación (gratis, paso a paso)

Este proyecto es un sistema de gestión (login + dashboard) para la academia,
listo para publicarse **gratis** con Firebase (backend) y GitHub (código +
hosting opcional). No necesitas saber programar para seguir esta guía.

## Qué incluye

- `index.html` — pantalla de bienvenida (splash) que redirige a login o dashboard.
- `login.html` / `dashboard.html` — páginas de la app.
- `app.js`, `auth.js`, `dashboard.js`, `firebase-config.js` — lógica.
- `style.css`, `responsive.css` — diseño visual (marca Barsa Soacha).
- `logo-barsa.svg` / `logo-barsa.png` — el escudo. **Solo sube tu logo real como
  `logo-barsa.png`** (mismo nombre exacto) y aparece en todo el sitio
  automáticamente — no hay que editar código (ver paso 5).
- `firestore.rules`, `storage.rules` — reglas de seguridad de la base de datos.
- `configuracion-inicial.html` — asistente para crear tu primer usuario administrador
  y, si quieres, datos de ejemplo.
- `seed-data.js` — datos de ejemplo usados por el asistente anterior.

Todo el código está en la raíz del proyecto (sin carpetas), listo para subir
tal cual a GitHub y Firebase Hosting.

---

## Paso 1 — Crear el proyecto en Firebase (gratis)

1. Ve a https://console.firebase.google.com y entra con una cuenta de Google.
2. **Crear un proyecto** → nómbralo, por ejemplo, `barsa-soacha`.
3. Puedes desactivar Google Analytics (no es necesario).
4. Dentro del proyecto, activa estos tres servicios (todos tienen un nivel
   gratuito — plan **Spark** — más que suficiente para una academia):
   - **Authentication** → pestaña "Sign-in method" → habilita **Correo/contraseña**.
   - **Firestore Database** → "Crear base de datos" → modo **producción** →
     elige la región más cercana (ej. `nam5` o `southamerica-east1`).
   - **Storage** → "Comenzar" (para fotos e imágenes futuras).
5. Ve a **Configuración del proyecto** (ícono de engranaje) → pestaña **General**
   → sección "Tus apps" → clic en el ícono `</>` (Web) → dale un apodo → "Registrar app".
6. Firebase te muestra un bloque `firebaseConfig = {...}`. Copia esos valores.

## Paso 2 — Conectar el código con tu proyecto Firebase

Abre `firebase-config.js` y reemplaza el bloque `FIREBASE_CONFIG` con los
valores que copiaste en el paso anterior:

```js
const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Es **normal y seguro** que estos valores queden visibles en el código: no son
secretos, son identificadores públicos. La seguridad real la dan las reglas
(`firestore.rules` / `storage.rules`), que ya vienen configuradas por roles.

## Paso 3 — Subir el código a GitHub

1. Crea una cuenta en https://github.com si no tienes una.
2. Crea un repositorio nuevo (botón verde "New"), por ejemplo `barsa-soacha`.
   Puede ser público o privado — ambos son gratis.
3. Sube **todos los archivos de este proyecto** (arrástralos en la pestaña
   "Add file → Upload files" de GitHub, o usa Git si ya lo conoces).
4. Confirma los cambios ("Commit changes").

Esto te sirve como respaldo del código y, si quieres, como origen para
Firebase Hosting o GitHub Pages (paso 4).

## Paso 4 — Publicar el sitio (Firebase Hosting, gratis)

Necesitas tener instalado Node.js (https://nodejs.org, descarga la versión LTS).
Luego, en una terminal, dentro de la carpeta del proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase init
```

En `firebase init`:
- Selecciona **Firestore**, **Hosting** y **Storage** con la barra espaciadora.
- Elige "Use an existing project" → tu proyecto `barsa-soacha`.
- Cuando pregunte por el directorio público, escribe `.` (punto).
- Configura como app de una sola página: **No**.
- No sobrescribas `index.html` si pregunta.
- Acepta usar `firestore.rules` y `storage.rules` que ya vienen en el proyecto.

Luego, cada vez que quieras publicar cambios:

```bash
firebase deploy
```

Al terminar te da una URL así: `https://barsa-soacha.web.app` — esa es tu
sitio en vivo, gratis, con HTTPS incluido.

> Alternativa sin terminal: puedes arrastrar la carpeta a
> https://console.firebase.google.com/project/_/hosting con la opción de
> despliegue manual, aunque el flujo con `firebase-tools` es el recomendado.

## Paso 5 — Reemplazar el logo por el escudo real

El sitio busca primero `logo-barsa.png`; si no existe, usa `logo-barsa.svg`
como respaldo. Para poner tu logo real:

1. Consigue el escudo real, idealmente PNG con **fondo transparente**.
2. Guárdalo con el nombre exacto **`logo-barsa.png`** en la raíz del proyecto
   (junto a `index.html`). No necesitas tocar ningún archivo de código.
3. Vuelve a publicar (`firebase deploy`, o sube el archivo nuevo a GitHub).

Si prefieres SVG, guárdalo como `logo-barsa.svg` (reemplazando el actual) —
sigue funcionando igual, solo que `logo-barsa.png` tiene prioridad si ambos existen.

No necesitas tocar el CSS: el tamaño y la sombra del logo ya están
controlados por las páginas donde aparece.

## Paso 6 — Crear tu primer usuario administrador

La app no tiene un formulario público de registro (por seguridad, para que
no cualquiera cree una cuenta). El primer administrador se crea así:

1. En Firebase Console → **Authentication** → "Add user" → escribe el correo
   y contraseña del administrador.
2. Abre `configuracion-inicial.html` en tu sitio publicado (o localmente) y
   sigue los 3 pasos: iniciar sesión, crear perfil de administrador y,
   opcionalmente, sembrar datos de ejemplo para ver el dashboard con contenido.
3. **Importante:** cuando termines, borra o renombra `configuracion-inicial.html`
   (y elimínalo del repositorio) para que nadie más pueda usarlo. Los usuarios
   siguientes (entrenadores, coordinadores, padres) se crean repitiendo el
   punto 1 y luego creando su documento de perfil manualmente en
   **Firestore Database → colección `users` → documento con ID = su UID**,
   con estos campos:
   - `displayName` (texto)
   - `email` (texto)
   - `role` (texto: `admin`, `coordinator`, `coach` o `parent`)
   - `active` (booleano: `true`)

## Paso 7 — Botones de acceso "Demo" en el login

`login.html` incluye 3 botones de acceso rápido (Administrador / Entrenador /
Padre) pensados para pruebas con datos ficticios. Si vas a producción,
ábrelo y borra el bloque `<div class="demo-section">…</div>` — o simplemente
no crees esas cuentas demo y los botones no harán nada útil.

## Paso 8 — Mantenimiento y siguientes pasos

- El dashboard lee datos en tiempo real de estas colecciones de Firestore:
  `students`, `attendance`, `payments`, `tournaments`, `schedules`,
  `announcements`, `categories`. Cárgalas manualmente desde la consola de
  Firestore, o construye formularios (no incluidos todavía) para cada una.
- Las reglas de seguridad (`firestore.rules`) ya diferencian qué puede hacer
  cada rol. Revísalas si agregas nuevas colecciones.
- El modo oscuro, el sidebar responsivo y los gráficos (Chart.js) ya
  funcionan sin configuración adicional.

---

## Paso 9 — Módulos de gestión y accesos por rol

Ya incluidos y funcionando (crean/editan/borran directo en Firestore):

- **Alumnos** (`alumnos.html`) — agrega el correo del padre en el campo
  "Correo del padre/acudiente" para que ese alumno aparezca en su Portal de Padres.
- **Categorías** (`categorias.html`), **Entrenadores** (`entrenadores.html`).
- **Agenda** (`agenda.html`) — crea entrenamientos, partidos y reuniones.
- **Asistencia** (`asistencia.html`) — elige categoría + fecha y pasa lista.
- **Pagos** (`pagos.html`) — registra pagos por alumno y su estado.
- **Comunicados** (`comunicados.html`) — mensajes que ven los padres en su portal.
- **Usuarios** (`usuarios.html`, solo Administrador) — crea cuentas de
  coordinador/entrenador/padre **sin salir de la app y sin tocar Firebase
  Console**: escribe nombre, correo y rol; el sistema crea la cuenta y le
  envía un correo a esa persona para que elija su propia contraseña.

### Qué ve cada rol al iniciar sesión
- **Admin / Coordinador** → `dashboard.html` completo (todos los módulos).
- **Entrenador** → `coach-panel.html`: su agenda, el listado de alumnos y
  acceso directo a pasar asistencia. No ve pagos ni puede editar alumnos.
- **Padre de familia** → `portal-padres.html`: solo la información de su(s)
  hijo(s) vinculados por correo — asistencia, pagos y comunicados. Si no ve a
  su hijo, revisa que el correo esté bien escrito en el perfil del alumno.

### Nota de seguridad sobre `usuarios.html`
Cualquier usuario autenticado puede, técnicamente, crear su propio documento
de perfil la primera vez (necesario para que el primer administrador pueda
arrancar el sistema). Una vez tengas tu cuenta admin funcionando, esto no
representa un riesgo práctico porque nadie puede registrarse solo — las
cuentas de Firebase Authentication solo las crea un administrador desde
`usuarios.html`. Si quieres cerrar por completo esa puerta de entrada,
dile a un desarrollador que reemplace esa regla por una Cloud Function
con permisos de administrador (no es necesario para operar con normalidad).

## Paso 10 — Ficha completa del alumno, documentos, fotos y notificaciones

- **Ficha del alumno** (`alumno-detalle.html?id=...`, enlace "🪪" desde Alumnos,
  Portal de Padres y Panel del entrenador): pestañas General, Médica,
  Documentos, Fotos, Rendimiento y Contacto. Admin/coordinador editan todo;
  el entrenador solo publica en "Rendimiento"; el padre edita "Contacto" y
  "Médica" y sube documentos/fotos — todo reforzado por `firestore.rules` y
  `storage.rules` (un padre nunca puede ver ni tocar la ficha de otro alumno).
- **Documentos y fotos** se guardan en Firebase Storage, dentro de
  `students/{id}/documentos` y `students/{id}/fotos` — ya activado en el
  Paso 1, sin configuración adicional. Cada archivo pesa máx. 8 MB.
- **Entrenador asignado por alumno**: en la ficha → pestaña General → Editar.
- **Agenda** ahora tiene sede, cancha y la opción de marcar un evento como
  cancelado (se ve tachado en rojo para entrenadores y padres).
- **Pagos** ahora admite fecha de vencimiento y subir el comprobante; el
  padre lo ve con semáforo 🟢 al día / 🟡 próximo a vencer / 🔴 vencido.
- **Notificaciones**: cada evento nuevo, comunicado, pago y marca de
  asistencia genera una notificación interna (campanita) para el entrenador
  y/o el padre correspondiente. Junto a cada una hay un botón de WhatsApp
  que abre un mensaje prellenado — **el envío es manual, con un clic**:
  automatizar el envío sin que alguien lo apruete requiere un proveedor de
  pago (Twilio o la API de Meta para WhatsApp Business), así que no está
  incluido para mantener el proyecto 100% gratis.

### Resumen de costos
Con el plan gratuito (Spark) de Firebase tienes, por mes: 50,000 lecturas y
20,000 escrituras diarias en Firestore, 10 GB de transferencia en Hosting y
autenticación ilimitada. Para una academia de fútbol esto es más que
suficiente y no deberías pagar nada.
