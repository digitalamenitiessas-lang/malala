/**
 * Arma la planilla de precios que le falta a Centro.
 *
 * La planilla de costos del salon trae las 124 prestaciones con codigo, rubro y
 * receta, pero NO trae precio de venta (lo dice su propio encabezado). Sin
 * precio un servicio no se puede vender, asi que este script exporta un CSV
 * para que el salon complete solo lo que falta.
 *
 * Para que completar 97 precios no sea completar 97 casilleros en blanco, cada
 * fila lleva de referencia lo que Centro cobra HOY por lo mas parecido que
 * tiene cargado: los servicios por largo de pelo ("Alisado sin formol 1..4")
 * salen todos de un unico "Alisado sin formol" con precio, asi que el salon ve
 * el numero actual al lado y solo tiene que abrir la escala.
 *
 * Uso: npx tsx scripts/pedir-precios-centro.ts [salida.csv]
 */
import "../envConfig";
import { readFileSync, writeFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";

const CE = "seed-000001";
const SALIDA = process.argv[2] ?? "precios-centro.csv";

const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Alisado sin formol 3" -> "alisado sin formol": el nivel es el largo de pelo. */
const sinNivel = (s: string) => norm(s).replace(/\s+[1-4]$/, "");

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const sql = getSqlClient();
  const plan = JSON.parse(
    readFileSync("scripts/data/centro-catalogo.json", "utf8"),
  ) as Array<{ codigo: string; servicio: string; subrubro: string }>;

  const actuales = (await sql`
    select s.nombre, s.codigo, s.precio_lista, s.precio_efectivo
      from servicios s
      join servicio_sucursal ss on ss.servicio_id = s.id
     where ss.sucursal_id = ${CE} and s.precio_efectivo > 0`) as any[];

  const porNombre = new Map(actuales.map((s) => [norm(s.nombre), s]));
  // Un mismo "padre" puede alimentar varios niveles; alcanza con quedarse con
  // el primero, porque lo que se usa es su precio como referencia.
  const porFamilia = new Map<string, any>();
  for (const s of actuales) {
    const k = sinNivel(s.nombre);
    if (!porFamilia.has(k)) porFamilia.set(k, s);
  }

  const filas = plan.map((f) => {
    const exacto = porNombre.get(norm(f.servicio));
    const familia = exacto ?? porFamilia.get(sinNivel(f.servicio));
    return {
      codigo: f.codigo,
      servicio: f.servicio,
      rubro: f.subrubro,
      // Ya tiene precio y es el mismo servicio: no hay nada que preguntar.
      efectivo: exacto ? exacto.precio_efectivo : "",
      lista: exacto ? exacto.precio_lista : "",
      referencia: exacto
        ? "ya cargado"
        : familia
          ? `hoy "${familia.nombre}" = ${familia.precio_efectivo} efectivo / ${familia.precio_lista} lista`
          : "",
    };
  });

  const faltan = filas.filter((f) => f.efectivo === "");
  const conPista = faltan.filter((f) => f.referencia !== "");

  const cab = [
    "Codigo",
    "Servicio",
    "Rubro",
    "Precio EFECTIVO",
    "Precio LISTA (tarjeta)",
    "Referencia (lo que cobran hoy)",
  ];
  const cuerpo = filas.map((f) =>
    [f.codigo, f.servicio, f.rubro, f.efectivo, f.lista, f.referencia]
      .map(csv)
      .join(","),
  );
  // BOM para que Excel abra bien las tildes.
  writeFileSync(SALIDA, "﻿" + [cab.join(","), ...cuerpo].join("\r\n"), "utf8");

  console.log(`${SALIDA}: ${filas.length} prestaciones.`);
  console.log(`  ya tienen precio cargado        : ${filas.length - faltan.length}`);
  console.log(`  hay que completar               : ${faltan.length}`);
  console.log(`     de esas, con precio de referencia: ${conPista.length}`);
  console.log(`     de esas, en blanco total         : ${faltan.length - conPista.length}`);
  process.exit(0);
}

main();
