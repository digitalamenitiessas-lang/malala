/**
 * Carga los precios que el salon completo en el CSV de pedir-precios-centro.ts.
 *
 * Es el paso que falta entre las dos pasadas de import-centro-catalogo.ts: los
 * servicios nuevos entran inactivos y en $0, aca reciben precio y se activan.
 * Mientras alguno siga en $0, --baja-viejos se niega a apagar el catalogo
 * anterior, asi que este script es lo que destraba la migracion.
 *
 * Empareja por codigo, que es unico por sucursal. No crea servicios: si un
 * codigo del CSV no esta cargado, lo avisa y sigue.
 *
 * Idempotente.
 *
 * Uso:
 *   npx tsx scripts/import-precios-centro.ts precios-centro.xlsx
 *   npx tsx scripts/import-precios-centro.ts precios-centro.xlsx --aplicar
 */
import "../envConfig";
import { readFileSync } from "node:fs";
import { leerXlsx } from "./lib/xlsx";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--"));

/**
 * Acepta el .xlsx que manda pedir-precios-centro.ts y tambien un CSV, por si el
 * salon lo exporta asi desde el Excel o desde Google Sheets. En el CSV se
 * detecta el separador: el Excel en español exporta con punto y coma.
 */
function leerTabla(ruta: string): string[][] {
  if (/\.xlsx$/i.test(ruta)) {
    const hojas = leerXlsx(ruta);
    const primera = [...hojas.values()][0];
    if (!primera?.length) throw new Error("El xlsx no tiene ninguna hoja con datos");
    return primera.filter((f) => f.some((x) => String(x).trim() !== ""));
  }
  const texto = readFileSync(ruta, "utf8");
  const cabecera = texto.split("\n")[0] ?? "";
  const sep = (cabecera.match(/;/g)?.length ?? 0) > (cabecera.match(/,/g)?.length ?? 0) ? ";" : ",";
  return parseCsv(texto, sep);
}

/** CSV con comillas dobles al estilo Excel; una fila por linea logica. */
function parseCsv(texto: string, sep: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  const s = texto.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (enComillas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

/**
 * El salon escribe los importes como le sale: "36.000", "$ 36000", "36000,00".
 * Se toma el ultimo separador como decimal solo si deja dos digitos atras, que
 * es la unica forma de distinguir "36.000" (treinta y seis mil) de "36,00".
 */
function plata(v: string): number | null {
  const t = String(v ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!t) return null;
  const ult = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  const dec = ult >= 0 && t.length - ult - 1 === 2;
  const limpio = dec
    ? t.slice(0, ult).replace(/[.,]/g, "") + "." + t.slice(ult + 1)
    : t.replace(/[.,]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const sql = getSqlClient();
  if (!ARCHIVO) {
    console.log("Falta el archivo. Uso: npx tsx scripts/import-precios-centro.ts <archivo.xlsx> [--aplicar]");
    process.exit(1);
  }
  const filas = leerTabla(ARCHIVO);
  const cab = filas[0].map((h) => h.toLowerCase().trim());
  const iCod = cab.findIndex((h) => h.startsWith("codigo"));
  const iEf = cab.findIndex((h) => h.includes("efectivo"));
  const iLi = cab.findIndex((h) => h.includes("lista"));
  if (iCod < 0 || iEf < 0 || iLi < 0) {
    console.log(`La planilla no tiene las columnas esperadas. Encabezado leido: ${cab.join(" | ")}`);
    process.exit(1);
  }

  const actuales = (await sql`
    select s.id, s.codigo, s.nombre, s.precio_lista, s.precio_efectivo, s.activo
      from servicios s
      join servicio_sucursal ss on ss.servicio_id = s.id
     where ss.sucursal_id = ${CE} and s.codigo is not null`) as any[];
  const porCodigo = new Map(actuales.map((s) => [String(s.codigo).trim(), s]));

  const cambios: Array<{ s: any; ef: number; li: number }> = [];
  const sinCodigo: string[] = [];
  const vacias: string[] = [];

  for (const f of filas.slice(1)) {
    const cod = String(f[iCod] ?? "").trim();
    if (!cod) continue;
    const s = porCodigo.get(cod);
    if (!s) { sinCodigo.push(cod); continue; }
    const ef = plata(f[iEf]);
    // Sin precio de lista se usa el de efectivo: un servicio sin recargo de
    // tarjeta es valido, cero no lo es (romperia el calculo de comision, que
    // toma precio_efectivo como base del catalogo).
    const li = plata(f[iLi]) ?? ef;
    if (ef == null || li == null) { vacias.push(cod); continue; }
    if (s.precio_efectivo === ef && s.precio_lista === li && s.activo) continue;
    cambios.push({ s, ef, li });
  }

  console.log(`${filas.length - 1} filas leidas.`);
  console.log(`  con precio para aplicar : ${cambios.length}`);
  console.log(`  todavia sin completar   : ${vacias.length}`);
  if (sinCodigo.length) {
    console.log(`  codigos que no existen en Centro (${sinCodigo.length}): ${sinCodigo.slice(0, 10).join(", ")}`);
  }

  // Un precio de lista por debajo del de efectivo casi siempre es que se
  // invirtieron las columnas: la tarjeta tiene recargo, no descuento.
  const invertidos = cambios.filter((c) => c.li < c.ef);
  if (invertidos.length) {
    console.log(`\n  ATENCION: ${invertidos.length} filas con lista < efectivo (columnas al reves?):`);
    for (const c of invertidos.slice(0, 10)) {
      console.log(`     ${c.s.codigo} ${String(c.s.nombre).slice(0, 34).padEnd(36)} ef ${c.ef} / lista ${c.li}`);
    }
  }

  if (!APLICAR) {
    console.log(`\n(simulacion, nada se escribio. Agregar --aplicar)`);
    process.exit(0);
  }
  for (const c of cambios) {
    await sql`update servicios
                 set precio_efectivo = ${c.ef}, precio_lista = ${c.li}, activo = true
               where id = ${c.s.id}`;
  }
  const faltan = (await sql`
    select count(*)::int n from servicios s
      join servicio_sucursal ss on ss.servicio_id = s.id
     where ss.sucursal_id = ${CE} and s.codigo is not null and s.precio_efectivo <= 0`) as any[];
  console.log(`\nListo: ${cambios.length} servicios con precio y activos.`);
  console.log(
    faltan[0].n === 0
      ? `Ya no queda ninguno en $0: se puede correr import-centro-catalogo.ts --baja-viejos --aplicar.`
      : `Quedan ${faltan[0].n} en $0; hasta que no queden, --baja-viejos no apaga el catalogo viejo.`,
  );
  console.log(`Los servicios nuevos quedan fuera de la reserva online (visible_reserva=false):`);
  console.log(`las escalas por largo son precios internos, en la web va un "desde".`);
  process.exit(0);
}

main();
