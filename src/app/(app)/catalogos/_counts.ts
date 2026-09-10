// Re-exports para que la página índice consulte conteos sin tirar del proxy "use server"
// directamente con todas las dependencias.
export { listServicios } from "@/lib/data/servicios";
export { listPromociones } from "@/lib/data/promociones";
export { listInsumos } from "@/lib/data/insumos";
// Clientes van por conteo y no por listado: son casi 2000 filas (~645 KB) y
// esta pantalla sólo imprime el número.
export { contarClientes } from "@/lib/data/clientes";
export { listEmpleados } from "@/lib/data/empleados";
export { listProveedores } from "@/lib/data/proveedores";
export { listMediosPago } from "@/lib/data/medios-pago";
export { listRubrosGasto } from "@/lib/data/rubros-gasto";
export { listMotivosDescuento } from "@/lib/data/motivos-descuento";
export { listCuentas } from "@/lib/data/cuentas-bancarias";
export { listGiftCards } from "@/lib/data/gift-cards";
