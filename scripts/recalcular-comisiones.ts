/**
 * Recalcula las comisiones de las ventas ya cargadas con el criterio vigente:
 * la comisión sale del PRECIO EN EFECTIVO del catálogo, no de lo que se cobró.
 *
 * Por qué hizo falta: durante unos días la comisión se calculó sobre lo cobrado,
 * así que las ventas cargadas a precio de lista (las que pagaban con tarjeta) le
 * pagaban a la empleada el 30% del recargo de la tarjeta también.
 *
 * Usa comisionMontoServicio, el mismo helper que usa la carga de ventas y el
 * ticket: si el criterio se vuelve a tocar, este script sigue el cambio solo.
 *
 * Por defecto NO escribe. Muestra el detalle y deja un backup en JSON.
 *   npx tsx scripts/recalcular-comisiones.ts            (dry run)
 *   npx tsx scripts/recalcular-comisiones.ts --apply
 *   npx tsx scripts/recalcular-comisiones.ts --revertir <backup.json>
 */
import "../envConfig";
import { writeFileSync, readFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";
import { comisionMontoServicio } from "../src/lib/data/ingresos-helpers";

const EPS = 0.5;

async function main() {
  const sql = getSqlClient();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const revertirIdx = args.indexOf("--revertir");

  if (revertirIdx !== -1) {
    const file = args[revertirIdx + 1];
    if (!file) throw new Error("Falta la ruta del backup");
    const backup: { id: string; comision_monto: number }[] = JSON.parse(
      readFileSync(file, "utf8"),
    );
    for (const r of backup) {
      await sql`update ingreso_lineas set comision_monto = ${r.comision_monto} where id = ${r.id}`;
    }
    console.log(`Revertidas ${backup.length} líneas desde ${file}`);
    process.exit(0);
  }

  const rows = await sql`
    select l.id, l.subtotal, l.cantidad, l.comision_pct, l.comision_monto,
           l.soporta_descuento, l.promo_servicio_id, l.servicio_id,
           i.subtotal as tk_subtotal, i.descuento_monto, i.fecha,
           s.precio_efectivo as serv_efectivo,
           ins.precio_venta_efectivo as prod_efectivo,
           e.nombre as emp, suc.nombre as suc,
           coalesce(s.nombre, ins.nombre) as item,
           liq.id as ya_liquidada
    from ingreso_lineas l
    join ingresos i on i.id = l.ingreso_id
    join sucursales suc on suc.id = i.sucursal_id
    left join servicios s on s.id = l.servicio_id
    left join insumos ins on ins.id = l.insumo_id
    left join empleados e on e.id = l.empleado_id
    left join liquidacion_lineas liq on liq.ingreso_linea_id = l.id
    where i.anulado = false and l.comision_pct > 0`;

  const liquidadas = rows.filter((r) => r.ya_liquidada);
  if (liquidadas.length > 0) {
    // Esa comisión ya se pagó con ese número: cambiarla dejaría la liquidación
    // diciendo una cosa y la venta otra, sin que nadie se entere.
    console.error(
      `ABORTADO: ${liquidadas.length} líneas ya entraron en una liquidación.`,
    );
    process.exit(1);
  }

  const cambios: {
    id: string;
    suc: string;
    emp: string;
    item: string;
    fecha: string;
    antes: number;
    despues: number;
  }[] = [];

  for (const r of rows) {
    // El precio de catálogo es unitario; los productos se venden por cantidad.
    const base =
      r.servicio_id != null
        ? (r.serv_efectivo ?? undefined)
        : r.prod_efectivo != null
          ? r.prod_efectivo * r.cantidad
          : undefined;

    const nuevo = comisionMontoServicio({
      precioCobrado: r.subtotal,
      precioEfectivoServicio: base,
      esDePromo: !!r.promo_servicio_id,
      comisionPct: r.comision_pct,
      soportaDescuento: r.soporta_descuento,
      subtotal: r.tk_subtotal,
      descuentoMonto: r.descuento_monto,
    });

    if (Math.abs(nuevo - r.comision_monto) < EPS) continue;
    cambios.push({
      id: r.id,
      suc: r.suc,
      emp: r.emp ?? "sin asignar",
      item: r.item,
      fecha: new Date(r.fecha).toISOString().slice(0, 10),
      antes: r.comision_monto,
      despues: nuevo,
    });
  }

  const porEmp = new Map<string, { antes: number; despues: number; n: number }>();
  for (const c of cambios) {
    const k = `${c.suc} · ${c.emp}`;
    const cur = porEmp.get(k) ?? { antes: 0, despues: 0, n: 0 };
    cur.antes += c.antes;
    cur.despues += c.despues;
    cur.n += 1;
    porEmp.set(k, cur);
  }

  console.log(`${rows.length} líneas con comisión · ${cambios.length} cambian\n`);
  console.log("POR EMPLEADA (sólo las líneas que cambian)");
  for (const [k, v] of [...porEmp].sort(
    (a, b) => a[1].despues - a[1].antes - (b[1].despues - b[1].antes),
  )) {
    console.log(
      ` ${k.padEnd(32)} ${String(v.n).padStart(2)} líneas  $${v.antes.toFixed(0).padStart(8)} → $${v.despues.toFixed(0).padStart(8)}  ${(v.despues - v.antes).toFixed(0).padStart(9)}`,
    );
  }
  const totalAntes = cambios.reduce((a, c) => a + c.antes, 0);
  const totalDespues = cambios.reduce((a, c) => a + c.despues, 0);
  console.log(
    `\n TOTAL  $${totalAntes.toFixed(0)} → $${totalDespues.toFixed(0)}  (${(totalDespues - totalAntes).toFixed(0)})`,
  );

  if (!apply) {
    console.log("\n(dry run — pasar --apply para escribir)");
    process.exit(0);
  }

  const backupFile = `scripts/data/backup-comisiones-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    backupFile,
    JSON.stringify(
      cambios.map((c) => ({ id: c.id, comision_monto: c.antes })),
      null,
      2,
    ),
  );
  console.log(`\nBackup: ${backupFile}`);

  for (const c of cambios) {
    await sql`update ingreso_lineas set comision_monto = ${c.despues} where id = ${c.id}`;
  }
  console.log(`Actualizadas ${cambios.length} líneas.`);
  process.exit(0);
}

main();
