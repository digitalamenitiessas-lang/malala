import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Dónde escribe el build. Por defecto `.next`, que es lo que lee `next start`.
   *
   * El deploy lo pisa con `.next-build` para construir SIN TOCAR el directorio
   * que el servidor está sirviendo, y recién al final renombra. Sin esto,
   * `next build` reescribe el `.next` que `next start` tiene abierto: durante
   * los ~6 minutos que tarda en un núcleo, cualquiera que esté adentro recibe
   * 404 en algún chunk y se le cuelga la pantalla. Es el motivo por el que
   * después de cada actualización había que pedir recarga forzada y por el que
   * sólo se podía desplegar con el salón cerrado.
   *
   * Se lee del entorno y no se fija acá porque `next start` tiene que seguir
   * encontrando `.next`: el deploy exporta la variable sólo para el build.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Subir fotos de perfil de profesionales (hasta 4 MB) por Server Action.
    // El default de 1 MB las rechazaría.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
