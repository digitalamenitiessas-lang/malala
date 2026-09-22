import "../envConfig";
import { readFileSync } from "node:fs";
import { getSqlClient } from "../src/lib/db/client/postgres";
const CE = "seed-000001";
const APLICAR = process.argv.includes("--aplicar");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Question Professional (lista julio 2026, s/IVA)" -> "Question Professional" */
const limpio = (p: string) => p.replace(/\(.*$/, "").trim();

// La planilla escribe el nombre comercial completo; el sistema ya tiene a ese
// proveedor con otro nombre. Sin esto se crearia un duplicado y la deuda del
// proveedor quedaria partida en dos fichas.
const ALIAS: Record<string, string> = { "l oreal professionnel": "Loreal" };
const resolver = (nombre: string) => ALIAS[norm(nombre)] ?? nombre;

async function main() {
  const sql = getSqlClient();
  const plan = JSON.parse(readFileSync("scripts/data/centro-planilla.json", "utf8"));
  const provs = await sql`select id, nombre from proveedores`;
  const porNombre = new Map((provs as any[]).map((p) => [norm(p.nombre), p]));

  const filas = [...plan.insumos, ...plan.reventa];
  const resultado = new Map<string, { prov: string; insumos: string[]; existe: boolean }>();
  for (const f of filas) {
    const nombre = limpio(f.proveedor ?? "");
    if (!nombre) continue;
    const hit = porNombre.get(norm(resolver(nombre)));
    const clave = norm(nombre);
    const cur = resultado.get(clave) ?? { prov: nombre, insumos: [], existe: !!hit };
    cur.insumos.push(f.codigo);
    resultado.set(clave, cur);
  }
  console.log("Proveedor de la planilla            existe?  insumos");
  for (const [, r] of [...resultado].sort()) {
    console.log(`${r.prov.padEnd(36)} ${(r.existe ? "si " : "NO ").padEnd(8)} ${r.insumos.length}`);
  }
  if (!APLICAR) { console.log("\n-- simulacion --"); process.exit(0); }

  let vinculos = 0, creados = 0;
  await sql.begin(async (tx) => {
    for (const f of filas) {
      const nombre = limpio(f.proveedor ?? "");
      if (!nombre) continue;
      let prov = porNombre.get(norm(resolver(nombre)));
      if (!prov) {
        const id = "prov-" + norm(nombre).replace(/ /g, "-");
        await tx`insert into proveedores (id, nombre, deuda_pendiente) values (${id}, ${nombre}, 0)
          on conflict (id) do nothing`;
        prov = { id, nombre };
        porNombre.set(norm(nombre), prov);
        creados++;
      }
      const [ins] = await tx`select id from insumos where sucursal_id=${CE} and codigo=${f.codigo}`;
      if (!ins) continue;
      await tx`insert into insumo_proveedores (id, insumo_id, proveedor_id)
        values (${crypto.randomUUID()}, ${(ins as any).id}, ${(prov as any).id})
        on conflict do nothing`;
      vinculos++;
    }
  });
  console.log(`\nProveedores creados: ${creados} · vinculos: ${vinculos}`);
  process.exit(0);
}
main();
