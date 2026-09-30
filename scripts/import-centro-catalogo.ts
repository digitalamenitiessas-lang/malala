/**
 * Reemplaza el catalogo de servicios de Malala Centro por el de la planilla del
 * salon (scripts/data/centro-catalogo.json, 124 prestaciones con codigo).
 *
 * Lo que habia cargado en Centro venia de un scrapeo de Calendico: 61 servicios
 * sin codigo, con rubros propios y sin las escalas por largo de pelo. La
 * planilla es lo que el salon realmente usa.
 *
 * NADA SE BORRA. `ingreso_lineas.servicio_id` es una FK y la linea no guarda
 * copia del nombre del servicio: si se borrara la fila de `servicios`, los
 * tickets viejos, las liquidaciones y el reporte por rubro se quedarian sin de
 * que hablar. Los servicios que salen del catalogo se marcan activo=false, que
 * es lo unico que filtra listServicios; todas las lecturas de historia los
 * siguen encontrando por el join.
 *
 * Tres cosas distintas pasan con las 124 filas de la planilla:
 *
 *   REUSAR  el servicio ya existe en Centro con ese mismo nombre. Se le pone el
 *           codigo y el rubro de la planilla SOBRE LA MISMA FILA. Es lo que
 *           conserva las ventas, las recetas y las asignaciones a profesionales
 *           sin tener que migrar nada.
 *   CREAR   no existe. Entra desactivado y en $0, porque la planilla no trae
 *           precios de venta (solo insumo y cantidad por servicio). Un servicio
 *           inactivo no aparece en la caja, asi que no se puede vender en $0
 *           por accidente.
 *   BAJA    al reves: un servicio de Calendico que la planilla no tiene. Se
 *           marca inactivo, pero recien en la segunda pasada (--baja-viejos),
 *           cuando los nuevos ya tengan precio. Si se hicieran las dos cosas
 *           juntas, Centro se quedaria sin catalogo vendible.
 *
 * Idempotente: se puede correr las veces que haga falta.
 *
 * Uso:
 *   npx tsx scripts/import-centro-catalogo.ts                          simulacion
 *   npx tsx scripts/import-centro-catalogo.ts --aplicar                paso 1
 *   npx tsx scripts/import-centro-catalogo.ts --baja-viejos --aplicar  paso 2
 */
import "../envConfig";
import { readFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");
const BAJA_VIEJOS = process.argv.includes("--baja-viejos");

const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * El subrubro de la planilla ES el rubro de Yerba Buena, con otra grafia. Se
 * mapea a la cadena exacta que ya usa YB para que el comparativo por rubro
 * ponga las dos sucursales en la misma fila: "Coloracion" y "COLORACION" serian
 * dos rubros distintos para el reporte.
 */
const RUBRO: Record<string, string> = {
  "Corte y peinado": "CORTE Y PEINADO",
  Lavados: "LAVADOS",
  "Tratamientos capilares": "TRATAMIENTOS CAPILARES",
  "Trabajos tecnicos": "TRABAJOS TECNICOS",
  Coloracion: "COLORACION",
  Combos: "COMBOS",
  Adicionales: "ADICIONALES",
  Nails: "NAILS",
  "Cejas y pestanas": "CEJAS Y PESTAÑAS",
  Facial: "FACIAL",
  // Sin equivalente en YB: rubro nuevo de Centro.
  "Alquiler de Gabinete": "ALQUILER DE GABINETE",
  "Gift Cards": "GIFT CARDS",
};

/** El mapa se indexa normalizado para no depender de tildes ni mayusculas. */
const RUBRO_NORM = new Map(
  Object.entries(RUBRO).map(([k, v]) => [norm(k), v]),
);

interface Fila {
  codigo: string;
  servicio: string;
  rubro: string;
  subrubro: string;
  estado: string;
  refYB: string | null;
}

async function main() {
  const sql = getSqlClient();
  const plan: Fila[] = JSON.parse(
    readFileSync("scripts/data/centro-catalogo.json", "utf8"),
  );

  const actuales = (await sql`
    select s.id, s.nombre, s.codigo, s.rubro, s.activo,
           s.precio_lista, s.precio_efectivo,
           (select count(*) from ingreso_lineas il where il.servicio_id = s.id) ventas,
           (select count(*) from recetas r where r.servicio_id = s.id) recetas
      from servicios s
      join servicio_sucursal ss on ss.servicio_id = s.id
     where ss.sucursal_id = ${CE}`) as any[];

  const porNombre = new Map(actuales.map((s) => [norm(s.nombre), s]));
  const porCodigo = new Map(
    actuales.filter((s) => s.codigo).map((s) => [String(s.codigo).trim(), s]),
  );

  const reusar: Array<{ fila: Fila; actual: any }> = [];
  const crear: Fila[] = [];
  for (const f of plan) {
    const rubro = RUBRO_NORM.get(norm(f.subrubro));
    if (!rubro) throw new Error(`Subrubro sin mapear: "${f.subrubro}" (${f.codigo})`);
    // Por codigo primero: si el script ya corrio una vez, la fila reusada quedo
    // con el codigo puesto y el nombre puede haberlo editado el salon.
    const actual = porCodigo.get(f.codigo) ?? porNombre.get(norm(f.servicio));
    if (actual) reusar.push({ fila: f, actual });
    else crear.push(f);
  }

  const reclamados = new Set(reusar.map((r) => r.actual.id));
  const sobran = actuales.filter((s) => !reclamados.has(s.id) && s.activo);

  console.log(`Planilla: ${plan.length} prestaciones. Centro hoy: ${actuales.length}.`);
  console.log(`  REUSAR (se les pone codigo y rubro) : ${reusar.length}`);
  console.log(`  CREAR  (nuevas, inactivas, en $0)   : ${crear.length}`);
  console.log(`  quedan fuera del catalogo           : ${sobran.length}`);

  const conHistoria = sobran.filter((s) => Number(s.ventas) || Number(s.recetas));
  if (conHistoria.length) {
    console.log(
      `\n  ${conHistoria.length} de las que quedan fuera tienen historia (se desactivan, no se borran):`,
    );
    for (const s of conHistoria) {
      console.log(
        `     ${String(s.nombre).slice(0, 42).padEnd(44)} ventas:${s.ventas} recetas:${s.recetas}`,
      );
    }
  }

  const cambianRubro = reusar.filter(
    (r) => r.actual.rubro !== RUBRO_NORM.get(norm(r.fila.subrubro)),
  );
  if (cambianRubro.length) {
    console.log(
      `\n  ${cambianRubro.length} servicios cambian de rubro. El reporte por rubro reagrupa`,
    );
    console.log(`  tambien las ventas viejas, porque lee el rubro actual del servicio.`);
  }

  if (BAJA_VIEJOS) {
    // Segunda pasada. Solo tiene sentido cuando el catalogo nuevo ya se puede
    // vender: si los nuevos siguen en $0 y ademas se apagan los viejos, la caja
    // de Centro se queda sin nada que cobrar.
    const sinPrecio = (await sql`
      select count(*)::int n from servicios s
        join servicio_sucursal ss on ss.servicio_id = s.id
       where ss.sucursal_id = ${CE} and s.codigo is not null and s.precio_efectivo <= 0`) as any[];
    if (sinPrecio[0].n > 0) {
      console.log(
        `\nNO se dan de baja los viejos: ${sinPrecio[0].n} servicios nuevos siguen en $0.`,
      );
      console.log(`Cargar los precios primero, si no Centro se queda sin catalogo vendible.`);
      process.exit(1);
    }
    console.log(`\nDando de baja ${sobran.length} servicios de la carga de Calendico.`);
    if (APLICAR && sobran.length) {
      await sql`update servicios set activo = false, visible_reserva = false
                 where id in ${sql(sobran.map((s) => s.id))}`;
    }
    console.log(APLICAR ? "Listo." : "(simulacion)");
    process.exit(0);
  }

  if (!APLICAR) {
    console.log(`\n(simulacion, nada se escribio. Agregar --aplicar)`);
    process.exit(0);
  }

  for (const { fila, actual } of reusar) {
    await sql`update servicios
                 set codigo = ${fila.codigo},
                     rubro = ${RUBRO_NORM.get(norm(fila.subrubro))!}
               where id = ${actual.id}`;
  }
  for (const f of crear) {
    const id = crypto.randomUUID();
    // comision_default_pct en 0 como en todo el catalogo de YB: el porcentaje
    // sale de la empleada, no del servicio.
    await sql`insert into servicios
      (id, rubro, nombre, codigo, precio_lista, precio_efectivo,
       comision_default_pct, activo, visible_reserva, es_promo)
      values (${id}, ${RUBRO_NORM.get(norm(f.subrubro))!}, ${f.servicio}, ${f.codigo},
              0, 0, 0, false, false, false)`;
    await sql`insert into servicio_sucursal (id, servicio_id, sucursal_id)
      values (${crypto.randomUUID()}, ${id}, ${CE})`;
  }
  console.log(`\nListo: ${reusar.length} actualizados, ${crear.length} creados (inactivos).`);
  console.log(`Los ${sobran.length} viejos siguen activos hasta que corras --baja-viejos.`);
  process.exit(0);
}

main();
