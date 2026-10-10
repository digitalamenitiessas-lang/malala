import { redirect } from "next/navigation";
import { GiftCardForm } from "@/components/forms/gift-card-form";
import { emitirGiftCard, sugerirCodigoGiftCard } from "@/lib/data/gift-cards";
import { listCuentas } from "@/lib/data/cuentas-bancarias";
import { listMediosPago } from "@/lib/data/medios-pago";
import { listClientes } from "@/lib/data/clientes";
import { getActiveSucursal, requireUser } from "@/lib/auth/session";
import { buildAccessScope } from "@/lib/auth/access";
import { vencimientoPorDefecto } from "@/lib/gift-card-estado";

export default async function NuevaGiftCardPage() {
  const user = await requireUser();
  const scope = buildAccessScope(user);
  if (!scope.puedeVerCatalogos) redirect("/dashboard");

  const sucursal = await getActiveSucursal();
  if (!sucursal) redirect("/catalogos/gift-cards");

  const [codigoSugerido, mediosPago, cuentasBanco, clientes] =
    await Promise.all([
      sugerirCodigoGiftCard(sucursal.id),
      // Sin GIFT: no se compra una gift card pagando con otra gift card.
      // Con CC: Yerba Buena pidió poder fiarla, y ahí la plata no entra a una
      // cuenta sino que queda como deuda de quien la compró.
      listMediosPago({
        sucursalId: sucursal.id,
        soloActivos: true,
        excluirGiftCard: true,
        incluirCuentaCorriente: true,
      }),
      listCuentas({ sucursalId: sucursal.id, soloActivas: true }),
      listClientes({ sucursalId: sucursal.id }),
    ]);

  async function action(_prev: unknown, formData: FormData) {
    "use server";
    return await emitirGiftCard(formData);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <h1 className="font-display text-3xl tracking-[0.2em] uppercase">
          Emitir gift card
        </h1>
        <p className="text-sm text-muted-foreground">
          La plata entra a la caja ahora, pero todavía no es una venta: se cuenta
          como facturación cuando la clienta venga a canjearla.
        </p>
      </header>
      <GiftCardForm
        sucursalId={sucursal.id}
        codigoSugerido={codigoSugerido}
        vencePorDefecto={vencimientoPorDefecto()}
        mediosPago={mediosPago}
        cuentasBanco={cuentasBanco.filter((c) => c.tipo === "banco")}
        clientes={clientes}
        action={action}
        submitLabel="Emitir"
      />
    </div>
  );
}
