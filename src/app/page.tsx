import type { Metadata } from "next";
import { BookingExperience } from "@/components/booking/booking-experience";
import { getCurrentUser } from "@/lib/auth/session";
import { getReservaPublicaSnapshot } from "@/lib/data/turnos";

/**
 * Esto es lo que se ve cuando alguien pega el link en WhatsApp.
 *
 * Antes el título era "MALALA | Club de belleza" y no había Open Graph, así
 * que la vista previa mostraba sólo el título y quedaba "Club de belleza" —
 * que es como se conoce a la sucursal del Centro, no a las dos. El nombre que
 * tiene que verse es MALALA.
 *
 * `metadataBase` sale del dominio público para que la imagen de la vista
 * previa salga con URL absoluta: WhatsApp no resuelve rutas relativas.
 */
const BASE =
  process.env.MALALA_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
  "https://www.malala.com.ar";

const DESCRIPCION =
  "Peluquería, nails, cejas y pestañas, faciales y masajes en San Miguel de Tucumán y Yerba Buena. Reservá tu turno online.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "MALALA",
  description: DESCRIPCION,
  openGraph: {
    type: "website",
    siteName: "MALALA",
    title: "MALALA",
    description: DESCRIPCION,
    url: BASE,
    locale: "es_AR",
    images: [{ url: "/icon.png", width: 512, height: 512, alt: "MALALA" }],
  },
};

export default async function HomePage() {
  const [snapshot, user] = await Promise.all([
    getReservaPublicaSnapshot(),
    getCurrentUser(),
  ]);

  return (
    <BookingExperience
      snapshot={snapshot}
      loggedInLabel={user ? user.nombre : undefined}
    />
  );
}
