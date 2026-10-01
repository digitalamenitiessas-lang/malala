/**
 * Da de alta un usuario del back office: el usuario de Supabase Auth y su
 * profile, que es donde vive el rol.
 *
 * Existe porque el alta que ya habia (crearAccesoInterno, en data/empleados.ts)
 * cuelga de un empleado, y no todo el que entra al sistema trabaja en el salon:
 * la dueña necesita ver las dos sucursales y no esta en la nomina de ninguna.
 *
 * Sobre el rol: `superadmin` es el UNICO que ve mas de una sucursal (lo resuelve
 * getCurrentUser leyendo todas las activas). Los demas quedan atados a su
 * sucursal_default. O sea que hoy "ver las dos sedes" implica acceso completo:
 * no hay un rol de solo lectura entre sucursales.
 *
 * La contraseña se pasa por argumento y no se imprime: no tiene que quedar en
 * el repo ni en la salida del comando. Lo correcto igual es que la cambie quien
 * la vaya a usar apenas entre.
 *
 * Uso:
 *   npx tsx scripts/crear-usuario.ts --email X --nombre "Y" --rol superadmin --sucursal seed-000002 --password "..."
 *   (sin --aplicar solo simula)
 */
import "../envConfig";
import { getSqlClient } from "../src/lib/db/client/postgres";
import { createSupabaseAdminClient } from "../src/lib/db/client/supabase-admin";

const ROLES = ["superadmin", "admin", "encargada", "empleado"] as const;
type Rol = (typeof ROLES)[number];

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sql = getSqlClient();
  const email = arg("email")?.trim().toLowerCase();
  const nombre = arg("nombre")?.trim();
  const rol = arg("rol")?.trim() as Rol | undefined;
  const sucursalId = arg("sucursal")?.trim();
  const password = arg("password");
  const aplicar = process.argv.includes("--aplicar");

  if (!email || !nombre || !rol || !sucursalId || !password) {
    console.log("Faltan datos. Uso:");
    console.log('  npx tsx scripts/crear-usuario.ts --email X --nombre "Y" --rol superadmin --sucursal seed-000002 --password "..." [--aplicar]');
    process.exit(1);
  }
  if (!ROLES.includes(rol)) {
    console.log(`Rol invalido: "${rol}". Validos: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.log("La contraseña tiene menos de 8 caracteres; Supabase la va a rechazar.");
    process.exit(1);
  }

  const [suc] = (await sql`select id, nombre, activo from sucursales where id = ${sucursalId}`) as any[];
  if (!suc) {
    const todas = (await sql`select id, nombre from sucursales order by id`) as any[];
    console.log(`No existe la sucursal "${sucursalId}". Hay: ${todas.map((s) => `${s.id} (${s.nombre})`).join(", ")}`);
    process.exit(1);
  }

  const yaProfile = (await sql`select user_id, rol, activo from profiles where lower(email) = ${email}`) as any[];
  if (yaProfile.length) {
    console.log(`Ya hay un profile con ese email: rol=${yaProfile[0].rol} activo=${yaProfile[0].activo}.`);
    console.log(`Para cambiarle el rol o reactivarlo, hacelo sobre ese profile; este script no pisa usuarios.`);
    process.exit(1);
  }

  console.log(`Alta de usuario`);
  console.log(`  email     ${email}`);
  console.log(`  nombre    ${nombre}`);
  console.log(`  rol       ${rol}${rol === "superadmin" ? "  (ve TODAS las sucursales y puede todo)" : `  (atado a ${suc.nombre})`}`);
  console.log(`  sucursal  ${suc.nombre}`);
  console.log(`  password  (${password.length} caracteres, no se imprime)`);

  if (!aplicar) {
    console.log(`\n(simulacion, nada se escribio. Agregar --aplicar)`);
    process.exit(0);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    console.log(`No se pudo crear el usuario de Auth: ${error?.message ?? "sin detalle"}`);
    process.exit(1);
  }

  try {
    await sql`insert into profiles (user_id, email, nombre, rol, sucursal_default_id, activo)
              values (${data.user.id}, ${email}, ${nombre}, ${rol}, ${sucursalId}, true)`;
  } catch (e) {
    // Sin profile el usuario de Auth entra y se queda sin nada: getCurrentUser
    // devuelve null y lo rebota el proxy. Mejor dejarlo sin crear.
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.log(`No se pudo crear el profile, se revirtio el usuario de Auth: ${String(e)}`);
    process.exit(1);
  }

  console.log(`\nListo. Ya puede entrar en /dev/login con ese email.`);
  process.exit(0);
}

main();
