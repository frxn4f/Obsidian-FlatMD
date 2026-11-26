# Contribuir

El código está en inglés. La interfaz y esta documentación están en español.

## Errores y propuestas

Usa las plantillas del repositorio. En un error, incluye un fragmento mínimo de Markdown y las versiones de Obsidian, del plugin y del sistema. No pegues notas con datos personales ni rutas de tu equipo.

## Cambios de código

1. Instala las dependencias con `npm ci`.
2. Crea una rama a partir de la rama principal.
3. Mantén el cambio pequeño y con un propósito claro.
4. Si cambia el comportamiento visible, actualiza `README.md` y `CHANGELOG.md`.
5. Ejecuta `npm test`, `npm run typecheck` y `npm run lint`. `npm run check` lanza todo eso y además compila.

No hace falta abrir un informe si el cambio ya está descrito en la pull request.

No subas `node_modules/`, `main.js` ni archivos de un vault. La licencia del proyecto todavía no está decidida: no añadas un archivo `LICENSE` por tu cuenta.
