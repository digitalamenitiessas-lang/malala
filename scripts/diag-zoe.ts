import "../envConfig";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client/postgres";
const DIAS=["dom","lun","mar","mie","jue","vie","sab"];
async function main(){
  const db=getDb();
  const r=await db.execute(sql`
    select e.id, e.nombre, e.tipo_comision, e.valor_hora, e.horas_por_semana,
           e.dias_trabajo, e.sucursal_principal_id,
           (select count(*) from profesionales_horarios f where f.empleado_id = e.id) as franjas
    from empleados e where e.activo = true
    order by e.horas_por_semana, e.nombre
  `);
  console.log("=== HORAS POR SEMANA vs FRANJAS (quienes quedan en 0) ===");
  for(const x of r as any[]){
    const dias=Array.isArray(x.dias_trabajo)?x.dias_trabajo:[];
    const flag = Number(x.horas_por_semana)<=0 && Number(x.franjas)>0 ? "  <-- antes cobraba por franjas, ahora 0" : "";
    console.log(`  ${String(x.nombre).padEnd(22)} hs/sem=${String(Number(x.horas_por_semana)).padStart(4)}  hora=$${Number(x.valor_hora)}  franjas=${x.franjas}  dias=${dias.length}  tipo=${x.tipo_comision}${flag}`);
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
