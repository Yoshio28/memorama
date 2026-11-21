# Comunidad de Memomancer (Firebase)

La sección **Comunidad** guarda los mazos públicos en Cloud Firestore y usa
**inicio de sesión anónimo** de Firebase Authentication. Todo cabe en el plan
gratuito (Spark).

- Explorar y descargar mazos no requiere sesión.
- Al publicar por primera vez, Memomancer crea en silencio una sesión anónima y la guarda
  en el equipo (`community-auth.json` en la carpeta de datos). Esa sesión es la dueña
  de los mazos que publica: solo ella puede actualizarlos o retirarlos.
- Se publica el contenido de las tarjetas (anverso, reverso y sección), el título,
  la descripción y el nombre o apodo que elija el usuario. Nunca el progreso ni las estadísticas.

## Configurar el proyecto (una sola vez)

1. Entra en <https://console.firebase.google.com> → **Crear un proyecto** (por ejemplo
   «memorama»). Google Analytics no hace falta. El proyecto empieza en el plan
   gratuito Spark.
2. **Authentication** → *Comenzar* → *Método de acceso* → **Anónimo** → *Habilitar* → *Guardar*.
3. **Firestore Database** → *Crear base de datos* → elige la ubicación (no se puede
   cambiar después; por ejemplo `nam5 (United States)`) → **modo de producción** → *Crear*.
4. En Firestore, pestaña **Reglas**: borra lo que haya, pega el contenido de
   [`firestore.rules`](firestore.rules) y pulsa **Publicar**.
5. ⚙️ **Configuración del proyecto** → *General* → *Tus apps* → icono web `</>` →
   registra la app («Memomancer», sin Hosting). Copia `apiKey` y `projectId` del bloque
   `firebaseConfig` y ponlos en [`../firebase-config.json`](../firebase-config.json).

`apiKey` y `projectId` no son secretos: identifican el proyecto y van dentro de la
app. La seguridad la dan las reglas de Firestore. Como medida extra, en Google Cloud
Console → *APIs y servicios* → *Credenciales* puedes restringir esa clave a
*Identity Toolkit API*, *Token Service API* y *Cloud Firestore API*.

## Moderar

En la consola de Firebase → Firestore → *Datos*:

- `reports`: denuncias (`deckId`, `reason`, `createdAt`). La app no puede leerlas;
  solo tú desde la consola.
- `decks`: mazos públicos. Para quitar uno, busca el documento con ese `deckId`
  y bórralo.

## Límites (los aplican las reglas)

- Título ≤ 80 caracteres, descripción ≤ 500, autor ≤ 40.
- Entre 1 y 2000 tarjetas y como máximo 50 secciones por mazo (y < 1 MB por documento).
- Campos fijos: no se aceptan campos extra; `ownerUid` siempre es quien publica;
  `createdAt` y `updatedAt` los pone el servidor.

Las reglas no pueden limitar cuántos mazos publica cada sesión. Si hubiera spam,
borra los mazos desde la consola. Para limitar el ritmo de publicación harían falta
Cloud Functions (plan Blaze).

## Probar las reglas en local

Requiere Java y `firebase-tools` (`npm i -g firebase-tools`):

```bash
npm run test:rules
```

Arranca los emuladores de Authentication y Firestore y comprueba, con varias sesiones
anónimas, que nadie puede publicar a nombre de otro, modificar o borrar mazos ajenos,
saltarse los límites ni leer las denuncias.
