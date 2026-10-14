/**
 * Carga en la ficha de Valentina las horas que hace de ENCARGADA.
 *
 * Tiene que correrse ANTES de que se deploye el cambio que hace que el arreglo
 * mixto tome las horas de la ficha en vez de las franjas. Si no, su ficha en
 * cero le deja el sueldo sin horas, que es como se rompieron cinco sueldos la
 * vez pasada.
 *
 * Dicho por el salon: "8,5 hs encargada semanales x $5.000 hora encargada.
 * Profesional fijo: 50.000 mas comision. Y tambien tiene el 10% de venta de
 * productos. Esto suma."
 *
 * Uso:
 *   npx tsx scripts/set-horas-encargada-valentina.ts
 *   npx tsx scripts/set-horas-encargada-valentina.ts --aplicar
 */
import "../envConfig";
import postgres from "postgres";

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("falta SUPABASE_DATABASE_URL");

const aplicar = process.argv.includes("--aplicar");
const HORAS = 8.5;

const sql = postgres(url, { max: 1, prepare: false });
const $ = (n: unknown) => `$${Number(n).toLocaleString("es-AR")}`;

async function main() {
  await sql
    .begin(async (tx) => {
      const [v] = await tx`
        select id, nombre, tipo_comision, horas_por_semana, valor_hora,
               sueldo_basico_semanal
        from empleados
        where nombre = 'Valentina' and sucursal_principal_id = 'seed-000001'
          and activo = true
      `;
      if (!v) throw new Error("no encontre a Valentina en Centro");
      if (v.tipo_comision !== "mixto") {
        throw new Error(`esperaba tipo mixto y es ${v.tipo_comision}. No toco nada.`);
      }

      console.log(`${v.nombre} · ${v.tipo_comision}`);
      console.log(`  horas por semana: ${v.horas_por_semana}  ->  ${HORAS}`);
      console.log(`  valor hora:       ${$(v.valor_hora)}`);
      console.log(`  basico semanal:   ${$(v.sueldo_basico_semanal)}`);
      console.log(
        `\n  por semana le queda: ${HORAS} x ${$(v.valor_hora)} = ${$(HORAS * Number(v.valor_hora))}` +
          ` + basico ${$(v.sueldo_basico_semanal)} = ${$(HORAS * Number(v.valor_hora) + Number(v.sueldo_basico_semanal))}`,
      );
      console.log(`  mas la comision de lo que atienda y el 10% de productos.`);

      await tx`update empleados set horas_por_semana = ${HORAS} where id = ${v.id}`;

      if (!aplicar) {
        console.log("\nSIMULACION: se cancela. Corré con --aplicar para que quede.");
        throw new Error("ROLLBACK");
      }
      console.log("\nAPLICADO.");
    })
    .catch((e) => {
      if (!(e instanceof Error && e.message === "ROLLBACK")) throw e;
    });
  await sql.end();
}

main();
