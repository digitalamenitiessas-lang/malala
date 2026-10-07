/**
 * Cambia la contraseña de un usuario del back office.
 *
 * Existe porque la app no tiene "olvidé mi contraseña": el único camino era
 * crear el usuario con una contraseña y, si no entraba, no había salida. Lucía
 * quedó trabada así, y terminó mandando su contraseña por WhatsApp para que
 * alguien la ayudara. Eso es exactamente lo que no tiene que pasar: una
 * contraseña que viaja por un chat ya no es secreta y hay que cambiarla.
 *
 * De las 17 cuentas del sistema, 15 nunca iniciaron sesión. O sea que esto no
 * es el caso raro: es lo que va a pasar con cada persona que entre por primera
 * vez. La solución de fondo es un "olvidé mi contraseña" en la pantalla de
 * login; mientras tanto, esto destraba sin que nadie tenga que dictar nada por
 * chat.
 *
 * La contraseña se pasa por argumento y no se imprime, igual que en
 * crear-usuario.ts: no tiene que quedar en el repo ni en la salida del comando.
 * Quien la elige es la persona que la va a usar.
 *
 * Uso:
 *   npx tsx scripts/cambiar-password-usuario.ts --email X --password "..." [--aplicar]
 *   (sin --aplicar solo simula)
 */
import "../envConfig";
import { getSqlClient } from "../src/lib/db/client/postgres";
import { createSupabaseAdminClient } from "../src/lib/db/client/supabase-admin";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sql = getSqlClient();
  const email = arg("email")?.trim().toLowerCase();
  const password = arg("password");
  const aplicar = process.argv.includes("--aplicar");

  if (!email || !password) {
    console.log("Faltan datos. Uso:");
    console.log('  npx tsx scripts/cambiar-password-usuario.ts --email X --password "..." [--aplicar]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log("La contraseña tiene menos de 8 caracteres; Supabase la va a rechazar.");
    process.exit(1);
  }

  const filas = (await sql`
    select u.id, u.email, p.nombre, p.rol, p.activo
      from auth.users u
      left join profiles p on p.user_id = u.id
     where lower(u.email) = ${email}
  `) as any[];

  if (filas.length === 0) {
    console.log(`No hay ninguna cuenta con el email "${email}".`);
    console.log(`Ojo con los typos: un mail mal escrito deja la cuenta inaccesible y nadie se entera.`);
    process.exit(1);
  }

  const u = filas[0];
  console.log(`Cambio de contraseña`);
  console.log(`  email     ${u.email}`);
  console.log(`  nombre    ${u.nombre ?? "(sin profile)"}`);
  console.log(`  rol       ${u.rol ?? "(sin profile)"}`);
  console.log(`  activo    ${u.activo}`);
  console.log(`  password  (${password.length} caracteres, no se imprime)`);

  if (u.activo === false) {
    console.log(`\nOjo: el profile esta INACTIVO. Con la contraseña nueva va a poder`);
    console.log(`autenticarse pero la app lo va a rechazar igual hasta reactivarlo.`);
  }

  if (!aplicar) {
    console.log(`\n(simulacion, nada se cambio. Agregar --aplicar)`);
    process.exit(0);
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(u.id, { password });
  if (error) {
    console.log(`No se pudo cambiar la contraseña: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n✔ Contraseña cambiada. Que entre y, si la eligio otra persona, que la cambie.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
