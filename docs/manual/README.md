# Manual de uso (para la IA conectada)

Cada `.md` de esta carpeta es un tema del manual que consulta la IA conectada
por MCP (herramienta `ayuda`, ver `src/lib/mcp/manual.ts`) y el chat interno.

Formato:

```
# Título en lenguaje de salón
palabras: clave, sinónimo, como lo diría una encargada
quién: dueño/admin, encargada, empleada

Para qué sirve.

## Paso a paso
1. …

## Ojo con / casos comunes
- …
```

Reglas:
- Nombres de botones y campos tal cual aparecen en pantalla.
- Si cambia una pantalla, se actualiza su tema: la IA repite lo que dice acá
  con total seguridad.
- Nada de `[VERIFICAR …]`: el test `src/lib/mcp/manual.test.ts` lo rechaza.
