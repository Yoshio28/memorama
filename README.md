# Memomancer

<img src="build/icon.png" alt="Icono de Memomancer: un gato mago sobre una base con una M" width="128">

> Antes se llamaba **Memora**. Desde la 1.2.0 se llama Memomancer; tus tarjetas se conservan.

Aplicación de escritorio de tarjetas de estudio con **repetición espaciada**
(Windows, macOS y Linux). Funciona como las apps clásicas de flashcards: cada
respuesta (Otra vez / Difícil / Bien / Fácil) decide cuándo vuelve la tarjeta.
Además añade dos cosas:

1. **Secciones dentro de cada mazo**: clasifica las tarjetas por temas
   (p. ej. «Europa», «América»…). Cada sección tiene su color, sus recuentos,
   su porcentaje de tarjetas dominadas y sus propios botones de *Estudiar* y
   *Practicar*. Puedes arrastrar una tarjeta a otra sección o mover muchas a la vez
   desde *Explorar*.
2. **Modos de estudio sencillos y personalizables**: elige qué mazos y secciones
   quieres, el tipo de estudio, el orden, la dirección, el máximo de tarjetas y si
   quieres escribir la respuesta. Guárdalo con un nombre y empiézalo con un clic
   desde Inicio.
   - **Repaso programado**: sigue el algoritmo (cuenta para la programación).
   - **Práctica libre**: repasa lo que quieras (todas, solo difíciles, falladas hoy,
     marcadas con estrella…) sin alterar la programación. Las que fallas vuelven
     unas tarjetas después.

## Funciones

- Mazos, secciones con color, tarjetas con formato sencillo (`**negrita**`,
  `*cursiva*`, `` `código` ``) y opción de crear la tarjeta inversa.
- Algoritmo de repetición espaciada (variante de SM-2 con pasos de aprendizaje,
  reaprendizaje tras fallar, facilidad por tarjeta y límites diarios por mazo).
- Sesión de estudio con atajos: `Espacio` muestra la respuesta, `1`–`4` responden,
  `Z` deshace, `E` edita, `M` marca con estrella y `Esc` sale.
- Al terminar una sesión puedes practicar solo las tarjetas que fallaste.
- Explorar: búsqueda, filtros y acciones en bloque (mover a sección, marcar,
  reiniciar progreso, eliminar).
- Estadísticas: previsión de repasos, actividad de 30 días, estado de las tarjetas
  y **rendimiento por sección** (de peor a mejor), para saber qué tema reforzar.
- Importar archivos de texto (`.txt`, `.csv`, `.tsv`): una tarjeta por línea.
  En los `.txt` el separador por defecto es `=`:

  ```
  perro = dog
  gato = cat = Animales      ← la 3.ª columna (opcional) es la sección
  ```

  Puedes cambiar el separador (tabulador, `;`, `,`, `|`, `:` o uno propio) y ver
  la vista previa al momento. Las líneas sin separador aparecen en una lista donde
  puedes corregirlas (añadiendo el separador) o eliminarlas antes de importar. También sirve el formato «Notas en texto plano» que exportan otras
  apps de flashcards. Se puede exportar un mazo a CSV y hacer copias completas en JSON.
- Guardado automático y copia de seguridad diaria (se conservan 14).
- Tema claro, oscuro o el del sistema.

## Descargar

**Windows:** descarga `Memomancer-Setup-<versión>.exe` desde
[Releases](https://github.com/Yoshio28/memorama/releases/latest) y ábrelo. El
programa no tiene firma digital: si aparece «Windows protegió su PC», pulsa
**Más información → Ejecutar de todas formas**. También hay una versión portable en `.zip`.

**Android (7 o posterior):** descarga `Memomancer-<versión>.apk` desde la misma página
de [Releases](https://github.com/Yoshio28/memorama/releases/latest) en el teléfono y
ábrelo. La primera vez Android pedirá permiso para instalar apps desde el navegador o el
gestor de archivos. Para tener los mismos mazos en el PC y en el móvil, inicia sesión con
Google en *Perfil* en los dos (o usa *Ajustes → Exportar copia (JSON)* y *Restaurar copia…*).

## 100 % local

Memomancer no necesita internet ni cuentas: todo se guarda en tu equipo y la interfaz
tiene bloqueada cualquier conexión de red. Solo hay tres excepciones, y las tres ocurren
únicamente cuando las usas:

- **Buscar actualizaciones**: consulta la última release de este repositorio en GitHub.
- **Comunidad**: lista, descarga o publica mazos públicos (Firebase).
- **Cuenta de Google** (opcional, en *Perfil*): si inicias sesión, tus datos se guardan
  también en tu cuenta y se sincronizan entre tus dispositivos.

## Perfil y cuenta de Google

En **Perfil** eliges tu nombre y tu foto (se reduce a 256 px y se guarda con tus datos).
El nombre aparece en la barra lateral y como autor al publicar en la Comunidad.

Si inicias sesión con Google:

- Tus mazos, tarjetas, progreso, modos de estudio y perfil se guardan comprimidos en tu
  cuenta (Firestore, en una zona que solo puede leer y escribir tu cuenta).
- Si pierdes o cambias de equipo o de teléfono, inicia sesión en el nuevo y lo recuperas
  todo. Si usas Memomancer en varios dispositivos, se sincronizan solos: al abrir la app,
  unos segundos después de cada cambio, al volver a ella y al cerrarla.
- Si cambias cosas en dos dispositivos a la vez, se combinan (`src/sync.js`): lo que cambió
  en un solo lado se respeta, también los borrados; si la misma tarjeta se estudió en los dos,
  se queda el progreso con más repasos.
- Los mazos que hubieras publicado en la Comunidad pasan a tu cuenta.
- Cerrar sesión no borra nada: los datos se quedan en el dispositivo y en la cuenta.

El inicio de sesión se hace en la página de Google del navegador; Memomancer nunca ve tu
contraseña. Configuración: [`firebase/LEEME.md`](firebase/LEEME.md#cuenta-de-google-y-copia-en-la-nube).

## Comunidad

En **Comunidad** puedes explorar los mazos que otras personas han hecho públicos,
buscar por título, tema o autor, ver su contenido y **añadirlos a tus mazos** (con
sus secciones). También puedes **denunciar** un mazo inapropiado.

Para compartir uno tuyo, abre el mazo y pulsa **Publicar**. Puedes poner título,
descripción y tu nombre o apodo. Se publican las tarjetas y sus secciones, nunca tu
progreso. Después el botón muestra **✓ Publicado**: desde ahí puedes actualizar la
copia pública o retirarla. Tus publicaciones aparecen en **Comunidad → Mis publicaciones**.

No hace falta crear cuenta: al publicar se crea una sesión anónima guardada en tu
equipo. Si reinstalas o cambias de equipo, tus mazos siguen publicados, pero ya no
podrás retirarlos desde la app.

Configuración, moderación y límites: [`firebase/LEEME.md`](firebase/LEEME.md).

## Actualizaciones

En **Ajustes → Actualizaciones**, o con el botón de la parte inferior de la barra
lateral, pulsa **Buscar actualizaciones**. Si hay una versión nueva verás sus
novedades y el botón **Descargar e instalar**. Memomancer descarga el instalador,
comprueba su tamaño y su huella SHA-256 publicada por GitHub, lo instala en
silencio y se vuelve a abrir. Tus tarjetas y ajustes se conservan.

- Solo funciona en copias instaladas con `Memomancer-Setup-*.exe`. La versión portable
  muestra el enlace a la página de descarga.
- El actualizador existe a partir de la 1.0.3: si tienes una versión anterior,
  instala la 1.0.3 a mano una vez.
- Para publicar una versión nueva basta con cambiar `"version"` en `package.json`
  y subir el cambio a `main`: GitHub Actions compila el instalador y crea la release.

## Uso

Requiere [Node.js](https://nodejs.org/) 18 o posterior.

```bash
npm install
npm start
```

Pruebas del algoritmo:

```bash
npm test
```

### Crear el instalador de Windows

```bash
npm run dist:win
```

Genera en `dist/`:

- `Memomancer-Setup-<versión>.exe`: instalador. Instala para el usuario actual (sin
  permisos de administrador) y crea accesos directos en el menú Inicio y el
  escritorio, además de un desinstalador.
- `Memomancer-Portable-<versión>.zip`: descomprímelo y abre `Memomancer.exe`. No requiere instalación.

El proceso funciona en Windows, Linux o macOS. Necesita `makensis` (NSIS) y `zip`
en el PATH, pero no Wine: el icono y la versión se incrustan con `resedit`
(`scripts/win-resources.mjs`) y el instalador se define en `build/installer.nsi`.

Para macOS y Linux: `npx electron-builder --mac` (en un Mac) o `npx electron-builder --linux`.

### App de Android

La app de Android usa [Capacitor](https://capacitorjs.com) con la misma interfaz de `src/`.
`mobile/bridge.js` sustituye a `preload.js` y `main.js`: guarda los datos en la carpeta
privada de la app, exporta con el menú de compartir y gestiona el botón Atrás.

```bash
npm run build:mobile                       # prepara www/ y sincroniza el proyecto android/
cd android && ./gradlew assembleRelease    # necesita el SDK de Android y JDK 21
```

GitHub Actions compila el APK en cada release (`.github/workflows/release.yml`) y lo firma
con la clave guardada en los secretos `ANDROID_KEYSTORE_BASE64` y
`ANDROID_KEYSTORE_PASSWORD`. Todas las versiones deben firmarse con esa misma clave: si
se pierde, el APK nuevo no podrá instalarse encima del anterior. En las ramas `android-*`,
`android-check.yml` compila un APK de prueba sin publicarlo.

## Dónde se guardan los datos

En la carpeta de datos de la aplicación (`Ajustes → Abrir carpeta de datos`):

- Windows: `%APPDATA%\memora\memora-data.json`
- macOS: `~/Library/Application Support/memora/memora-data.json`
- Linux: `~/.config/memora/memora-data.json`

La carpeta sigue llamándose `memora` (el nombre anterior de la app) para que las
actualizaciones conserven tus tarjetas. Las copias diarias están en la subcarpeta `backups/`.

## Estructura

```
main.js            Proceso principal de Electron (ventana, archivos, copias)
updater.js         Búsqueda, descarga verificada e instalación de actualizaciones
community.js       Comunidad: sesión anónima y mazos públicos (API REST de Firebase)
firebase-config.json  apiKey y projectId del proyecto de Firebase (públicos)
firebase/          Reglas de Firestore, pruebas de las reglas y guía de configuración
preload.js         Puente seguro entre la interfaz y el sistema de archivos
src/index.html     Interfaz
src/app.js         Lógica de la interfaz (vistas, sesiones, importación)
src/scheduler.js   Algoritmo de repetición espaciada (sin dependencias)
src/styles.css     Estilos (tema claro y oscuro, y diseño para móvil)
src/community-core.js  Comunidad, cuenta de Google y copia en la nube (común a escritorio y Android)
src/sync.js        Fusión a tres bandas de los datos de dos dispositivos
google-auth.js     Inicio de sesión con Google en escritorio (navegador + servidor local temporal)
docs/auth/         Página puente del inicio de sesión (GitHub Pages)
mobile/bridge.js   Capa nativa de Android (Capacitor): datos, archivos, Atrás, actualizaciones
android/           Proyecto de Android (generado con Capacitor y ajustado: iconos, versión, firma)
capacitor.config.json  Configuración de Capacitor
test/              Pruebas del algoritmo (node --test)
```
