# Memora

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

**Windows:** descarga `Memora-Setup-<versión>.exe` desde
[Releases](https://github.com/Yoshio28/memorama/releases/latest) y ábrelo. El
programa no tiene firma digital: si aparece «Windows protegió su PC», pulsa
**Más información → Ejecutar de todas formas**. También hay una versión portable en `.zip`.

## 100 % local

Memora no necesita internet ni cuentas: todo se guarda en tu equipo y la interfaz
tiene bloqueada cualquier conexión de red. Solo hay dos excepciones, y las dos ocurren
únicamente cuando las usas:

- **Buscar actualizaciones**: consulta la última release de este repositorio en GitHub.
- **Comunidad**: lista, descarga o publica mazos públicos (Firebase).

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
novedades y el botón **Descargar e instalar**. Memora descarga el instalador,
comprueba su tamaño y su huella SHA-256 publicada por GitHub, lo instala en
silencio y se vuelve a abrir. Tus tarjetas y ajustes se conservan.

- Solo funciona en copias instaladas con `Memora-Setup-*.exe`. La versión portable
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

- `Memora-Setup-<versión>.exe`: instalador. Instala para el usuario actual (sin
  permisos de administrador) y crea accesos directos en el menú Inicio y el
  escritorio, además de un desinstalador.
- `Memora-Portable-<versión>.zip`: descomprímelo y abre `Memora.exe`. No requiere instalación.

El proceso funciona en Windows, Linux o macOS. Necesita `makensis` (NSIS) y `zip`
en el PATH, pero no Wine: el icono y la versión se incrustan con `resedit`
(`scripts/win-resources.mjs`) y el instalador se define en `build/installer.nsi`.

Para macOS y Linux: `npx electron-builder --mac` (en un Mac) o `npx electron-builder --linux`.

## Dónde se guardan los datos

En la carpeta de datos de la aplicación (`Ajustes → Abrir carpeta de datos`):

- Windows: `%APPDATA%\memora\memora-data.json`
- macOS: `~/Library/Application Support/memora/memora-data.json`
- Linux: `~/.config/memora/memora-data.json`

Las copias diarias están en la subcarpeta `backups/`.

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
src/styles.css     Estilos (tema claro y oscuro)
test/              Pruebas del algoritmo (node --test)
```
