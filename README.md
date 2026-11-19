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
  la vista previa al momento. Las líneas sin separador se omiten y se avisa
  cuántas son. También sirve el formato «Notas en texto plano» que exportan otras
  apps de flashcards. Se puede exportar un mazo a CSV y hacer copias completas en JSON.
- Guardado automático y copia de seguridad diaria (se conservan 14).
- Tema claro, oscuro o el del sistema.

## 100 % local

Memora no necesita internet ni cuentas: todo se guarda en tu equipo. La app
bloquea cualquier conexión de red; solo carga sus propios archivos.

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

### Crear el instalador

```bash
npx electron-builder --win    # Windows (.exe)
npx electron-builder --mac    # macOS (.dmg), debe ejecutarse en un Mac
npx electron-builder --linux  # Linux (AppImage)
```

El resultado queda en `dist/`.

## Dónde se guardan los datos

En la carpeta de datos de la aplicación (`Ajustes → Abrir carpeta de datos`):

- Windows: `%APPDATA%\memora\memora-data.json`
- macOS: `~/Library/Application Support/memora/memora-data.json`
- Linux: `~/.config/memora/memora-data.json`

Las copias diarias están en la subcarpeta `backups/`.

## Estructura

```
main.js            Proceso principal de Electron (ventana, archivos, copias)
preload.js         Puente seguro entre la interfaz y el sistema de archivos
src/index.html     Interfaz
src/app.js         Lógica de la interfaz (vistas, sesiones, importación)
src/scheduler.js   Algoritmo de repetición espaciada (sin dependencias)
src/styles.css     Estilos (tema claro y oscuro)
test/              Pruebas del algoritmo (node --test)
```
