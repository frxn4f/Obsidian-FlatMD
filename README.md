# FlatMD - Self-Contained Exporter

Copia o exporta la nota activa de Obsidian como un Markdown que lleva consigo sus imágenes locales. Esas imágenes se convierten en Data URIs. La nota abierta y el resto de archivos del vault no se modifican.

Sirve para pegar una nota en otro sitio, o para guardar un `.md` que se pueda abrir fuera de Obsidian sin depender de las rutas del vault.

El repositorio de GitHub es `obsidian-flatmd`. El identificador del plugin, y por tanto el nombre de su carpeta dentro del vault, es `self-contained-markdown-exporter`.

## Funcionalidades

Hay dos comandos:

- **Copy note.** Procesa la nota activa y copia el Markdown al portapapeles.
- **Export note.** Procesa la nota y escribe un archivo `.md` nuevo.

El procesamiento hace esto:

- Detecta imágenes wiki (`![[foto.png]]`) e imágenes Markdown (`![texto](ruta)`).
- Resuelve la ruta dentro del vault, lee el archivo y lo codifica en Base64.
- Sustituye la referencia por una Data URI.
- Conserva el texto alternativo. Si la referencia indica un tamaño, el resultado usa una etiqueta `<img>` con `width` y `height`.
- Si la imagen wiki no tiene texto alternativo, usa el nombre del archivo.
- Deja igual las imágenes `http` y `https`. No las descarga.
- Si una imagen local falta o no se puede leer, conserva la referencia original y sigue con las demás.
- No toca las imágenes que están en un bloque de código, en código en línea, en el frontmatter o en un comentario HTML cerrado.
- No convierte enlaces normales ni transclusiones de otras notas.
- Avisa al terminar, si el ajuste está activo, con los recursos detectados, convertidos, omitidos, los errores y el tamaño aproximado.

La misma imagen usada varias veces se lee y se codifica una sola vez. El Base64 puede repetirse en el resultado: cada aparición necesita su propia Data URI.

## Ejemplos

Una imagen wiki sin texto alternativo usa el nombre del archivo. Este PNG es de 1×1 píxel, para que la Data URI quepa aquí; una imagen real produce el mismo tipo de resultado, con un Base64 más largo.

```markdown
![[punto.png]]
```

```markdown
![punto.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)
```

Con texto alternativo:

```markdown
![[diagram.png|Esquema]]
```

```markdown
![Esquema](data:image/png;base64,...)
```

Con ancho, o con ancho y alto (`640x480`), el Markdown no tiene dónde guardar el tamaño. El plugin escribe un `<img>`:

```markdown
![[diagram.png|Esquema|640]]
```

```html
<img src="data:image/png;base64,..." alt="Esquema" width="640">
```

Una ruta Markdown relativa o codificada se resuelve y se incrusta igual:

```markdown
![Captura](adjuntos/captura%20de%20pantalla.png)
```

```markdown
![Captura](data:image/png;base64,...)
```

Una imagen externa se queda como está:

```markdown
![Captura](https://example.com/a.png)
```

## Instalación

Si el plugin está en el directorio de plugins de la comunidad, se instala desde Obsidian: Ajustes → Plugins de la comunidad → activar los plugins de la comunidad → buscar **Self-Contained Markdown Exporter**.

Hasta entonces, la instalación es manual y usa los archivos de una release de GitHub, no el código fuente.

1. Abre las releases del repositorio `obsidian-flatmd` y elige la versión que coincida con `manifest.json`. La primera es `0.1.0`.
2. Descarga `main.js` y `manifest.json`. Son archivos sueltos de la release, no hace falta descomprimir un zip.
3. En el vault, crea esta carpeta:

   ```text
   <vault>/.obsidian/plugins/self-contained-markdown-exporter/
   ```

   El nombre de la carpeta es el `id` del plugin. No uses `obsidian-flatmd`.
4. Copia ahí los dos archivos, directamente en esa carpeta.
5. En Obsidian, abre Ajustes → Plugins de la comunidad, desactiva el modo restringido y activa **Self-Contained Markdown Exporter**.
6. Si ya estaba instalado, desactívalo y actívalo otra vez después de sustituir `main.js`.

Este plugin no usa `styles.css`.

## Uso

Abre la nota y la paleta de comandos. Obsidian antepone el nombre del plugin, así que los comandos aparecen como:

- `Self-Contained Markdown Exporter: Copy note`
- `Self-Contained Markdown Exporter: Export note`

**Copy note** copia el Markdown resultante. Las imágenes locales van como Data URI en el texto, no como archivos del portapapeles.

**Export note** abre un cuadro para elegir el nombre y la carpeta del vault. El nombre inicial sale del patrón configurado; si no has cambiado nada, es el de la nota. **Guardar en el vault** crea un archivo nuevo en esa carpeta. En la aplicación de escritorio, **Guardar como…** abre el diálogo del sistema y puede guardar fuera del vault.

Si el archivo ya existe, puedes sobrescribirlo, guardarlo con un sufijo (`nota-2.md`, `nota-3.md`, …) o cancelar. El plugin no usa como destino la nota que está abierta.

Si no hay una nota Markdown activa, aparece un aviso y no se hace nada.

## Configuración

Los ajustes están en Ajustes → Self-Contained Markdown Exporter.

| Ajuste | Qué hace | Inicial |
| --- | --- | --- |
| Convertir imágenes | Si se desactiva, la copia y la exportación mantienen las referencias originales. | Activado |
| Carpeta de exportación | Carpeta del vault que se propone al exportar. Vacía para elegirla cada vez. | Vacía |
| Nombre del archivo | Patrón del nombre. Admite `{{noteName}}`, `{{date}}` y `{{time}}`. | `{{noteName}}` |
| Tamaño máximo por imagen | Megabytes del archivo original. Por encima de ese tamaño la imagen no se incrusta. `0` desactiva el límite. | 8 |
| Tamaño máximo del documento | Megabytes del Markdown resultante. `0` desactiva el límite. | 30 |
| Recursos inexistentes | Conserva la referencia. La otra opción añade además un comentario HTML. | Conservar la referencia |
| Conservar referencias externas | Las imágenes `http` y `https` se quedan igual. Si se desactiva, pasan a ser enlaces y tampoco se descargan. | Activado |
| Mostrar resumen | Aviso al terminar con los contadores y el tamaño. Los fallos al copiar o guardar se avisan igualmente, y también el aviso de que la conversión está desactivada. | Activado |

`{{date}}` es la fecha local del equipo, `AAAA-MM-DD`. `{{time}}` es la hora local, `HHMM`.

El Base64 ocupa aproximadamente un tercio más que el archivo binario, más el prefijo `data:`. Conviene que el límite del documento sea mayor que la suma de las imágenes.

## Archivos y red

El plugin lee las imágenes de la nota que ya están en el vault. No descarga recursos de internet y no envía el contenido de la nota a ningún servicio. No hay cuenta de usuario ni telemetría.

En escritorio, **Guardar como…** escribe un archivo en la ruta que eliges. Esa ruta puede estar fuera del vault. **Guardar en el vault** crea un archivo nuevo dentro del vault y no modifica la nota abierta.

## Desarrollo

Hace falta Node.js 22 o posterior. Clona `obsidian-flatmd` y entra en esa carpeta:

```sh
cd obsidian-flatmd
npm ci
npm run dev
```

`npm run dev` recompila `main.js` cuando cambia el código. `main.js` no forma parte del repositorio: solo se publica en las releases.

Otros scripts:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run check
```

`npm run check` ejecuta el linter, la comprobación de tipos, las pruebas, la compilación y una revisión de `main.js`.

Las pruebas cubren el análisis del Markdown, la resolución de rutas, la conversión a Data URI, los límites de tamaño, los nombres de exportación y el texto del resumen. No arrancan Obsidian.

Para probar el plugin mientras se desarrolla, la carpeta del repositorio puede enlazarse dentro de `.obsidian/plugins/self-contained-markdown-exporter`. Después de cada compilación hay que desactivar y activar el plugin, o recargar Obsidian. Conviene usar un vault de prueba, no el vault principal.

## Estructura del proyecto

```text
src/
  main.ts                         comandos y coordinación
  types.ts                        ajustes y resultado de la conversión
  summary.ts                      texto del aviso final
  vaultPath.ts                    rutas relativas al vault
  processors/
    scanMarkdown.ts               referencias, código y frontmatter
    markdownProcessor.ts          conversión de la nota
    renderImage.ts                Data URI, img y enlaces
    resourceProcessor.ts          MIME, Base64 y tamaño
  resolvers/
    referenceResolver.ts          candidatos de ruta, sin Obsidian
    vaultLookup.ts                adaptación a la API del vault
  managers/
    clipboardManager.ts
    exportManager.ts
    exportPaths.ts
    progressController.ts
  settings/
    settings.ts
    settingsTab.ts
tests/
```

`referenceResolver.ts` no importa Obsidian: decide qué rutas son válidas y se queda dentro del vault. `vaultLookup.ts` es la pieza que llama a `metadataCache` y a `vault.readBinary`.

## Compatibilidad

`manifest.json` declara como versión mínima de Obsidian la 1.5.0. El código se comprueba con el compilador de TypeScript contra los tipos del paquete `obsidian` fijado en `package-lock.json` (1.14.4 en esta versión del repositorio).

Las pruebas automáticas se ejecutan con Node.js 22. No abren la aplicación de Obsidian.

Copiar y guardar dentro del vault están escritos para escritorio y móvil. **Guardar como…** usa el diálogo de Electron y solo se ofrece cuando `Platform.isDesktopApp` es verdadero.

## Limitaciones conocidas

- No descarga imágenes externas. Un esquema que no sea `http`, `https` o una Data URI, por ejemplo `file://`, no se lee.
- No incrusta PDF, audio, vídeo ni otros adjuntos. `![[Otra nota]]` se deja igual.
- Una imagen sin extensión solo se incrusta si la resolución wiki de Obsidian encuentra un archivo de imagen. En Markdown no se busca un archivo por el nombre suelto cuando la ruta escrita no existe: así se evita incrustar otra imagen que tenga el mismo nombre en otra carpeta.
- Si hay varios archivos con el mismo nombre, la referencia wiki usa el que devuelve `getFirstLinkpathDest`.
- Un alias que es solo un número, o `anchoxalto` con la `x` minúscula, se trata como tamaño. `![[foto.png|500]]` no conserva «500» como texto alternativo.
- No se procesan las etiquetas HTML `<img>` ni las rutas que solo aparecen en propiedades del frontmatter.
- Los bloques de código con sangría de cuatro espacios no se reconocen. Un bloque cercado sin cierre protege el resto de la nota. Un comentario HTML sin `-->` no se protege.
- Una definición de referencia se reconoce al principio del documento, después de una línea en blanco, después de un bloque protegido o junto a otra definición. El título tiene que estar en la misma línea. La definición se conserva; la imagen que la usa se sustituye por una imagen autocontenida.
- El tipo MIME sale de la extensión. El plugin no comprueba que los bytes sean realmente de ese formato. HEIC, HEIF y SVG pueden no verse en todos los visores de Markdown.
- El límite de tamaño se revisa entre imágenes. Cancelar también: si cancelas durante la lectura de un archivo, esa lectura termina y después se descarta toda la operación.
- El aviso de progreso aparece cuando la nota tiene al menos ocho referencias que ya se ven como imagen: con una extensión reconocida, o externas. Una referencia wiki sin extensión no cuenta para ese umbral, aunque luego se resuelva a una imagen.
- El portapapeles del sistema puede rechazar un texto muy grande. El aviso muestra el tamaño para que se pueda ver antes.
- La licencia del proyecto todavía no está elegida. Hasta que haya un archivo `LICENSE`, no des por hecho que puedes redistribuir el código.

## Contribuir

Los informes de errores y las propuestas están en las plantillas de GitHub. La forma de preparar un cambio está en [CONTRIBUTING.md](CONTRIBUTING.md).

