# Dragon Ball: Adventure Blast

Prueba de concepto jugable de un juego 3D de aventura/plataformas en el navegador, hecha con **Three.js + Vite** (sin backend, sin recursos externos). Todo el contenido (Goku, escenario, cielo, texturas) es **procedural**: no hay modelos ni texturas que puedan fallar al cargar.

Referencias visuales (en `assets/references/`): `goku-reference.png` y `environment-reference.png`.

## Ejecutar

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # genera dist/
npm run preview   # sirve dist/
```

Requiere un navegador con WebGL. Las dependencias están fijadas (Vite 2.9, Three 0.160) para funcionar también con Node ≥ 12.2; con Node moderno funciona igual.

## Controles

| Acción | Tecla |
|---|---|
| Mover (relativo a la cámara) | `W A S D` / flechas |
| Correr | `SHIFT` |
| Saltar | `ESPACIO` |
| Cámara | arrastrar con el ratón · `Q`/`E` girar · rueda = zoom |
| Pausa / reanudar | `P`, `ESC` o botón (también al cambiar de pestaña) |

## Qué incluye

- **Goku procedural** con jerarquía completa (cabeza, pelo, torso, brazos, antebrazos, manos, piernas, pies), gi naranja, camiseta/cinturón/muñequeras azules, botas, ojos y pelo puntiagudo, material toon con contorno.
- **Animaciones** procedurales: idle (respiración), walk, run, jump, fall y landing, con transiciones suavizadas según el estado.
- **Movimiento**: aceleración/deceleración, control aéreo reducido, salto con gravedad, coyote time y buffer de salto, orientación hacia la dirección de movimiento, pendientes máximas transitables.
- **Física**: terreno por función de altura, colisiones cilindro/caja, plataformas escalables (piedras escalonadas, Nube Voladora, meseta con rampa).
- **Cámara** en tercera persona con seguimiento suave, órbita con ratón, colisión con suelo y objetos, y FOV dinámico al correr.
- **Escenario** inspirado en la referencia: valle verde, camino de tierra, casa de tejado marrón, casa-cápsula blanca, pagoda de tejado azul, mesetas rocosas, árboles, bambú, hierba y flores (instanciados), montañas lejanas, nubes y sombras.
- **Objetivo**: 7 Esferas del Dragón repartidas por el mapa.
- **UI** HTML/CSS: pantalla START, FPS, estado del personaje, controles, pausa, contador de esferas, y pantalla de error (WebGL no disponible / errores inesperados).

## Estructura

```
index.html · style.css · vite.config.js · package.json
src/
  main.js            bucle principal, renderer, estados de juego
  world.js           terreno, cielo, edificios, vegetación, luces
  camera.js          cámara en tercera persona
  controls.js        teclado y ratón
  physics.js         suelo, colisiones y plataformas
  character/         goku.js (modelo) · animations.js · movement.js
  ui/interface.js    HUD y pantallas
assets/references/   imágenes de referencia
```

`assets/models`, `assets/textures` y `assets/audio` están reservadas para futuros recursos.

## Despliegue en GitHub Pages

1. Sube el repositorio a GitHub (rama `main`).
2. En **Settings → Pages**, elige **Source: GitHub Actions**.
3. Cada push a `main` ejecuta `.github/workflows/deploy.yml` (build + deploy).

La ruta base es configurable con la variable `BASE_PATH` (por defecto `./`, rutas relativas válidas en cualquier subruta):

```bash
BASE_PATH=/dragon-ball-adventure-blast/ npm run build
```

## Notas y limitaciones

- El movimiento es relativo a la cámara (W avanza hacia donde mira la cámara), como en los juegos 3D clásicos.
- Goku se ha interpretado con proporciones chibi y el equipo pedido (cinturón azul, camiseta azul); es modelado procedural, no un modelo artístico final.
- Sin audio ni combate en esta primera versión.
