# Diseño: integrar el compilador TyScript al playground

Fecha: 2026-11-17

## Intención

Combinar el compilador actualizado de la rama `code` con la interfaz React/Vite de `main`. Desde el playground, la persona podrá editar un programa, abrir y descargar archivos `.tys`, compilarlo y ejecutarlo en un panel de terminal simulado dentro del editor. La experiencia debe funcionar en el sitio estático y conservar el análisis interactivo existente.

## Objetivos

- Conservar la interfaz y el modo paso a paso de `main`, que seguirá recorriendo Lexer, Parser y Semántica sin añadir las fases nuevas.
- Incorporar compilación léxica, sintáctica, semántica, IR, optimización y generación JS de `code`.
- Ejecutar el cuerpo generado con un runtime local a la página; capturar `print` en la terminal y solicitar valores de `read` desde ella.
- Abrir `.tys` con el selector de archivos del navegador y guardar el contenido como `.tys` mediante descarga.
- Combinar dependencias y comandos para mantener tanto el playground como el CLI `compile`.

## Fuera de alcance

- Acceso al sistema de archivos local sin selector/descarga del navegador.
- Servidor Node remoto o ejecución en infraestructura del servidor.
- Resaltado sintáctico avanzado o reemplazo del editor actual.

## Restricciones y seguridad

El playground es estático (React/Vite/GitHub Pages), por lo que el CLI basado en `fs` y `process` no puede ser su motor de ejecución. La UI debe usar los módulos de compilación compartidos y el runtime `CompilerRuntime` en memoria. Solo se ejecutará el cuerpo JS generado por el compilador; no se expondrá `window` al programa. La entrada se resolverá mediante una cola controlada por el panel terminal. Guardar/abrir usará APIs del navegador.

## Enfoques considerados

1. **Compilación y ejecución en navegador (elegido).** Reutiliza las fases y el runtime del compilador; funciona en el playground estático y da respuesta inmediata. Requiere integrar el pipeline de `code` sin importar el CLI de Node.
2. **CLI local únicamente.** Requiere menos integración web, pero no permite ejecutar desde la interfaz del sitio.
3. **Servicio de ejecución Node.** Permite un runtime Node real, pero agrega servidor, despliegue y superficie operativa innecesaria para el playground actual.

Se eligió la primera opción según el objetivo acordado de ejecutar desde el editor publicado.

## Diseño de la solución

- Fusionar `code` en `main` conservando el commit exclusivo de `main`; mantener el frontend React/Vite y las herramientas de pruebas, junto con los nuevos módulos, ejemplos, documentación y CLI.
- Actualizar el `App` para usar `compileSource`, `IntermediateGenerator`, `optimize` y `generateJavaScript`; mantener los resultados/tabs de análisis y el modo paso a paso actual (Lexer, Parser y Semántica); la terminal será el flujo para ejecutar el programa completo.
- Añadir acciones Abrir, Guardar y Ejecutar al editor, con nombre de archivo `.tys` y atajo de ejecución si encaja con los patrones actuales.
- Añadir una terminal acoplada debajo del editor, con historial de salida, estado de compilación/ejecución, campo de entrada para `read` y control para limpiar salida. Los errores de compilación se muestran como diagnósticos y no se ejecutan.
- Mantener el proyecto construible con Vite y conservar `npm run compile`/`npm test` de la rama `code`; reconciliar lockfile y TypeScript config con las dependencias necesarias.

## Criterios de aceptación

- `main` incluye los cambios funcionales de `code` y conserva el frontend.
- En el editor se puede descargar un `.tys` y cargar un `.tys` existente.
- Un ejemplo ejecutable muestra `print` en la terminal integrada; un programa con `read` pausa y continúa al recibir una línea.
- Los errores léxicos, sintácticos, semánticos y de runtime aparecen en la interfaz sin romper el playground.
- El build web y el CLI permanecen disponibles.

## Decisiones de implementación pendientes al constructor

Decisión acordada: conservar el modo paso a paso actual solo para Lexer, Parser y Semántica; no ampliarlo a IR ni ejecución. Usar las APIs nativas del navegador para abrir/guardar archivos y el runtime ya existente del compilador. Mantener el panel adaptable a pantallas pequeñas y aprovechar los componentes Tailwind existentes. No agregar dependencias si se puede resolver con el stack actual.

