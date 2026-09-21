"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, AlertTriangle, Scissors, Package, CreditCard, Tags } from "lucide-react";
import { createIngreso } from "@/lib/data/ingresos-actions";
import { createClienteQuick } from "@/lib/data/clientes";
import { persistFlashToast, useToast } from "@/components/feedback/toast-provider";
import { LoadingButton } from "@/components/forms/field";
import type {
  Cliente,
  CuentaBancaria,
  Empleado,
  GiftCard,
  Insumo,
  MedioPago,
  MotivoDescuento,
  Promocion,
  Servicio,
  ServicioHorario,
} from "@/lib/types";
import { estaVigente } from "@/lib/promo-vigencia";
import { esCanjeable, estadoGiftCard, hoyAr } from "@/lib/gift-card-estado";
import { formatARS } from "@/lib/utils";
import { CurrencyInput } from "@/components/forms/currency-input";
import { ClienteCombobox } from "@/components/forms/cliente-combobox";

type LineaServicioForm = {
  tempId: string;
  tipo: "servicio";
  servicio_id: string;
  empleado_id: string;
  precio: number;
  precio_tipo: "lista" | "efectivo";
  comision_pct: number;
  soporta_descuento: boolean;
  // Si la línea proviene de una promo: id del servicio-promo y su nombre (display).
  promo_servicio_id?: string;
  promo_nombre?: string;
};

type LineaProductoForm = {
  tempId: string;
  tipo: "producto";
  insumo_id: string;
  cantidad: number;
  precio: number;
  // Igual que en los servicios. Solo se puede mover a "efectivo" si el producto
  // tiene cargado un precio efectivo; si no, la línea queda siempre en "lista".
  precio_tipo: "lista" | "efectivo";
};

type LineaForm = LineaServicioForm | LineaProductoForm;

interface Props {
  sucursalId: string;
  sucursalNombre: string;
  clientes: Cliente[];
  servicios: Servicio[];
  empleados: Empleado[];
  mediosPago: MedioPago[];
  productos: Insumo[];
  motivosDescuento: MotivoDescuento[];
  cuentasBanco: CuentaBancaria[];
  promociones: Promocion[];
  promoHorariosById: Record<string, ServicioHorario[]>;
  /** Tarjetas canjeables. Incluye las vencidas: se avisa, no se bloquea. */
  giftCards: GiftCard[];
}

const newLineaServicio = (): LineaServicioForm => ({
  tempId: crypto.randomUUID(),
  tipo: "servicio",
  servicio_id: "",
  empleado_id: "",
  precio: 0,
  precio_tipo: "lista",
  comision_pct: 30,
  soporta_descuento: true,
});

// ¿El medio de pago impacta en una cuenta de banco? (habilita elegir a cuál).
// Efectivo (EF), Cuenta corriente (CC) y Gift card (GIFT) no van a bancos, así
// que no muestran selector de cuenta; el resto (tarjeta, transferencia, etc.) sí.
// En el canje de una gift card no entra plata: entró cuando se vendió.
/**
 * Medio de pago con el que arranca la venta.
 *
 * Antes esto era `efectivo?.id ?? mediosNormales[0]?.id ?? ""`, y ese fallback
 * al primero de la lista hizo daño real: en Centro no existe el medio "EF", así
 * que caía en el primero por orden alfabético — CHEQUE, con 4% de recargo — y
 * toda venta se facturaba 4% por encima de lo cobrado. La única venta real que
 * hay en la base salió así ($31.250 cobrados, $32.500 registrados).
 *
 * Ahora, si no hay efectivo, no se elige nada: la operadora tiene que decir con
 * qué cobró. Un recargo puede aplicarse porque alguien lo eligió, nunca porque
 * el formulario lo puso por descarte.
 */
function medioPorDefecto(
  efectivo: MedioPago | undefined,
  medios: MedioPago[],
): string {
  if (efectivo) return efectivo.id;
  const sinRecargo = medios.find((m) => (m.recargo_pct ?? 0) === 0);
  return sinRecargo?.id ?? "";
}

function usaCuentaBanco(mp: MedioPago | undefined): boolean {
  if (!mp) return false;
  const cod = mp.codigo.toUpperCase();
  return cod !== "EF" && cod !== "CC" && cod !== "GIFT";
}

const newLineaProducto = (): LineaProductoForm => ({
  tempId: crypto.randomUUID(),
  tipo: "producto",
  insumo_id: "",
  cantidad: 1,
  precio: 0,
  precio_tipo: "lista",
});

/** El precio del producto según el botón elegido, con "lista" de respaldo. */
function precioProducto(p: Insumo, tipo: "lista" | "efectivo"): number {
  if (tipo === "efectivo" && p.precio_venta_efectivo != null) {
    return p.precio_venta_efectivo;
  }
  return p.precio_venta ?? 0;
}

function subtotalLinea(l: LineaForm): number {
  const precio = Number(l.precio) || 0;
  if (l.tipo === "producto") return precio * (Number(l.cantidad) || 0);
  return precio;
}

// Comisión de una línea de servicio, reflejando la regla del servidor:
//   soporta_descuento = true  → comisión sobre el precio final pagado (desc. prorrateado)
//   soporta_descuento = false → comisión sobre el precio de lista (regular)
function comisionLineaServicio(
  l: LineaServicioForm,
  precioLista: number,
  subtotalLineas: number,
  descMonto: number,
): number {
  const sub = Number(l.precio) || 0;
  const descProrrateado =
    subtotalLineas > 0 ? descMonto * (sub / subtotalLineas) : 0;
  const base = l.soporta_descuento ? sub - descProrrateado : precioLista;
  return base * ((Number(l.comision_pct) || 0) / 100);
}

export function NuevaVentaForm({
  sucursalId,
  sucursalNombre,
  clientes,
  servicios,
  empleados,
  mediosPago,
  productos,
  motivosDescuento,
  cuentasBanco,
  promociones,
  promoHorariosById,
  giftCards,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { notifySuccess, notifyError } = useToast();

  // Header
  const [clientesList, setClientesList] = useState<Cliente[]>(clientes);
  const [clienteId, setClienteId] = useState("");
  const [observacion, setObservacion] = useState("");

  // Satisfacción del cliente (la marca quien registra la venta).
  const [clienteSatisfecho, setClienteSatisfecho] = useState(true);
  const [satisfaccionNota, setSatisfaccionNota] = useState("");

  // Modal nuevo cliente
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newClienteNombre, setNewClienteNombre] = useState("");
  const [newClienteTel, setNewClienteTel] = useState("");
  const [newClienteSaving, setNewClienteSaving] = useState(false);
  const [newClienteError, setNewClienteError] = useState<string | null>(null);
  const newClienteNombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewCliente) {
      setTimeout(() => newClienteNombreRef.current?.focus(), 50);
    }
  }, [showNewCliente]);

  async function handleCreateCliente() {
    setNewClienteError(null);
    const nombre = newClienteNombre.trim();
    if (!nombre) {
      setNewClienteError("Nombre requerido");
      return;
    }
    setNewClienteSaving(true);
    try {
      const res = await createClienteQuick({
        nombre,
        telefono: newClienteTel.trim() || undefined,
      });
      if (!res.ok) {
        const message =
          Object.values(res.errors).flat().join(", ") || "Error al crear";
        setNewClienteError(message);
        notifyError(message);
        return;
      }
      setClientesList((prev) =>
        [...prev, res.cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      setClienteId(res.cliente.id);
      // Un cliente recién creado no tiene CC: si había un medio en CC, lo reseteamos.
      if (medioCc) {
        if (mp1Id === medioCc.id) {
          setMp1Id(medioPorDefecto(efectivo, mediosNormales));
        }
        if (mp2Id === medioCc.id) setMp2Id("");
      }
      setShowNewCliente(false);
      setNewClienteNombre("");
      setNewClienteTel("");
      notifySuccess("Cliente creado");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error inesperado";
      setNewClienteError(message);
      notifyError(message);
    } finally {
      setNewClienteSaving(false);
    }
  }

  // Líneas
  const [lineas, setLineas] = useState<LineaForm[]>([newLineaServicio()]);

  // Descuento
  const [descTipo, setDescTipo] = useState<"pct" | "monto">("pct");
  const [descValor, setDescValor] = useState(0);
  const [descMotivoId, setDescMotivoId] = useState("");

  // Cuenta corriente: el medio con código "CC" es especial (genera deuda, no
  // entra a bancos) y solo se ofrece si el cliente elegido tiene CC habilitada.
  const medioCc = mediosPago.find((m) => m.codigo === "CC");
  const mediosNormales = mediosPago.filter((m) => m.codigo !== "CC");

  // Pagos
  const efectivo = mediosNormales.find((m) => m.codigo === "EF");
  const [mp1Id, setMp1Id] = useState(
    medioPorDefecto(efectivo, mediosNormales),
  );
  const [valor1, setValor1] = useState<number>(0);
  const [mp1CuentaId, setMp1CuentaId] = useState("");
  const [mp2Id, setMp2Id] = useState("");
  const [valor2, setValor2] = useState<number>(0);
  const [mp2CuentaId, setMp2CuentaId] = useState("");

  // Qué tarjeta se canjea en cada tramo, cuando el medio es GIFT.
  const [giftCard1Id, setGiftCard1Id] = useState("");
  const [giftCard2Id, setGiftCard2Id] = useState("");

  // Resultado server
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [warnings, setWarnings] = useState<string[]>([]);

  // ----- Cálculos derivados -----
  const subtotal = lineas.reduce((acc, l) => acc + subtotalLinea(l), 0);
  const descMonto =
    descTipo === "pct"
      ? subtotal * (Number(descValor) / 100)
      : Number(descValor) || 0;
  const total = Math.max(0, subtotal - descMonto); // neto de servicios/productos (antes de recargo)

  const comisionDe = (l: LineaServicioForm) => {
    const s = servicios.find((x) => x.id === l.servicio_id);
    return comisionLineaServicio(
      l,
      s?.precio_lista ?? (Number(l.precio) || 0),
      subtotal,
      descMonto,
    );
  };
  const totalComisiones = lineas.reduce(
    (acc, l) => (l.tipo === "servicio" ? acc + comisionDe(l) : acc),
    0,
  );
  const paraElLocal = total - totalComisiones;

  // Cliente seleccionado y si admite cuenta corriente.
  const clienteSel = clientesList.find((c) => c.id === clienteId);
  const clienteTieneCc =
    !!medioCc && !!clienteSel?.cuenta_corriente_habilitada;
  // saldo_cc negativo = plata que la clienta dejó a cuenta.
  const saldoAFavorCliente =
    clienteTieneCc && clienteSel && clienteSel.saldo_cc < -0.01
      ? -clienteSel.saldo_cc
      : 0;
  const mp1EsCc = !!medioCc && mp1Id === medioCc.id;
  const mp2EsCc = !!medioCc && mp2Id === medioCc.id;
  const usaCc = mp1EsCc || mp2EsCc;
  const montoFiado =
    (mp1EsCc ? Number(valor1) || 0 : 0) + (mp2EsCc ? Number(valor2) || 0 : 0);

  // Gift card: el medio "GIFT" tampoco cobra plata, descuenta el saldo de una
  // tarjeta ya vendida. Hay que decir cuál.
  const medioGift = mediosPago.find((m) => m.codigo === "GIFT");
  const mp1EsGift = !!medioGift && mp1Id === medioGift.id;
  const mp2EsGift = !!medioGift && mp2Id === medioGift.id;
  const giftCard1 = giftCards.find((g) => g.id === giftCard1Id);
  const giftCard2 = giftCards.find((g) => g.id === giftCard2Id);

  // Recargo automático por medio de pago (ej. tarjeta de crédito).
  const mp1 = mediosPago.find((m) => m.id === mp1Id);
  const mp2 = mp2Id ? mediosPago.find((m) => m.id === mp2Id) : undefined;
  const recargo1 = (Number(valor1) || 0) * ((mp1?.recargo_pct ?? 0) / 100);
  const recargo2 = mp2 ? (Number(valor2) || 0) * ((mp2.recargo_pct ?? 0) / 100) : 0;
  const recargoTotal = recargo1 + recargo2;
  const totalACobrar = total + recargoTotal;

  const pagado = (Number(valor1) || 0) + (Number(valor2) || 0);
  const diff = total - pagado;
  const pagosOk = Math.abs(diff) < 0.01;

  // Medios sin cuenta asignada: la venta se registra pero la plata no impacta
  // en la caja del día, y hasta ahora eso pasaba en silencio. Fiado (CC) y gift
  // card quedan afuera: esos NO tienen que mover plata, es su comportamiento
  // correcto.
  const sinCuenta = [
    { mp: mp1, esCc: mp1EsCc, esGift: mp1EsGift, override: mp1CuentaId, monto: Number(valor1) || 0 },
    { mp: mp2, esCc: mp2EsCc, esGift: mp2EsGift, override: mp2CuentaId, monto: Number(valor2) || 0 },
  ]
    .filter((p) => p.mp && !p.esCc && !p.esGift && !p.mp.cuenta_id && !p.override && p.monto > 0)
    .map((p) => p.mp!.nombre);

  // Gift card: hay que haber elegido cuál, y no se puede cobrar más de lo que
  // le queda. La base lo frena igual con el UPDATE condicional, pero ahí ya se
  // perdió la carga entera; acá se ve antes de apretar Guardar.
  const giftFalta = (mp1EsGift && !giftCard1Id) || (mp2EsGift && !giftCard2Id);
  const giftSinSaldo =
    (!!giftCard1 && (Number(valor1) || 0) > giftCard1.saldo + 0.005) ||
    (!!giftCard2 && (Number(valor2) || 0) > giftCard2.saldo + 0.005);
  const giftOk = !giftFalta && !giftSinSaldo;

  // Aviso (no bloquea): descuento manual + línea a precio efectivo = 20% + otro descuento.
  const hayLineaEfectivo = lineas.some((l) => l.precio_tipo === "efectivo");
  const avisoDobleDescuento = descMonto > 0 && hayLineaEfectivo;

  // Advertencia (no bloquea): promos en el carrito fuera de franja o vencidas.
  const promosEnCarrito = Array.from(
    new Set(
      lineas
        .filter(
          (l): l is LineaServicioForm =>
            l.tipo === "servicio" && !!l.promo_servicio_id,
        )
        .map((l) => l.promo_servicio_id as string),
    ),
  );
  const avisosPromo = promosEnCarrito
    .map((promoId) => {
      const promo = promociones.find((p) => p.id === promoId);
      if (!promo) return null;
      const { vigente, motivo } = estaVigente(
        promo,
        promoHorariosById[promoId] ?? [],
      );
      return vigente ? null : { nombre: promo.nombre, motivo: motivo ?? "" };
    })
    .filter((x): x is { nombre: string; motivo: string } => x !== null);

  // Comisiones por empleado en este ticket
  const comisionPorEmpleado = lineas.reduce<
    Map<string, { nombre: string; total: number; lineas: number }>
  >((acc, l) => {
    if (l.tipo !== "servicio" || !l.empleado_id) return acc;
    const emp = empleados.find((e) => e.id === l.empleado_id);
    if (!emp) return acc;
    const com = comisionDe(l);
    const cur = acc.get(emp.id) ?? { nombre: emp.nombre, total: 0, lineas: 0 };
    cur.total += com;
    cur.lineas += 1;
    acc.set(emp.id, cur);
    return acc;
  }, new Map());
  const repartoEmpleados = Array.from(comisionPorEmpleado.values()).sort(
    (a, b) => b.total - a.total,
  );

  // Cuando no hay mp2, valor1 = total automáticamente
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!mp2Id) {
        setValor1(total);
        setValor2(0);
      } else {
        setValor2(Math.max(0, total - (Number(valor1) || 0)));
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [mp2Id, total, valor1]);

  // ----- Helpers de líneas -----
  function updateLinea(idx: number, patch: Partial<LineaForm>) {
    setLineas((prev) =>
      prev.map((l, i) => (i === idx ? ({ ...l, ...patch } as LineaForm) : l)),
    );
  }

  function handleServicioChange(idx: number, servicioId: string) {
    const l = lineas[idx];
    if (l.tipo !== "servicio") return;
    const s = servicios.find((x) => x.id === servicioId);
    if (!s) {
      updateLinea(idx, { servicio_id: "" });
      return;
    }
    const empleado = empleados.find((e) => e.id === l.empleado_id);
    updateLinea(idx, {
      servicio_id: servicioId,
      precio: l.precio_tipo === "efectivo" ? s.precio_efectivo : s.precio_lista,
      // La comisión la define solo el % del empleado (el servicio ya no aporta %).
      comision_pct: empleado?.porcentaje_default ?? 0,
    });
  }

  function handlePrecioTipoChange(idx: number, tipo: "lista" | "efectivo") {
    const l = lineas[idx];
    if (l.tipo !== "servicio") return;
    const s = servicios.find((x) => x.id === l.servicio_id);
    updateLinea(idx, {
      precio_tipo: tipo,
      precio: s ? (tipo === "efectivo" ? s.precio_efectivo : s.precio_lista) : l.precio,
    });
  }

  function handleEmpleadoChange(idx: number, empleadoId: string) {
    const l = lineas[idx];
    if (l.tipo !== "servicio") return;
    const e = empleados.find((x) => x.id === empleadoId);
    updateLinea(idx, {
      empleado_id: empleadoId,
      comision_pct: e?.porcentaje_default ?? l.comision_pct,
    });
  }

  function handleProductoChange(idx: number, insumoId: string) {
    const l = lineas[idx];
    if (l.tipo !== "producto") return;
    const p = productos.find((x) => x.id === insumoId);
    if (!p) {
      updateLinea(idx, { insumo_id: "" });
      return;
    }
    // Si el producto elegido no tiene precio efectivo, la línea vuelve a lista:
    // si no, quedaría marcada en "efectivo" cobrando el precio de lista.
    const tipo =
      l.precio_tipo === "efectivo" && p.precio_venta_efectivo != null
        ? "efectivo"
        : "lista";
    updateLinea(idx, {
      insumo_id: insumoId,
      precio_tipo: tipo,
      precio: precioProducto(p, tipo),
    });
  }

  function handlePrecioTipoProducto(idx: number, tipo: "lista" | "efectivo") {
    const l = lineas[idx];
    if (l.tipo !== "producto") return;
    const p = productos.find((x) => x.id === l.insumo_id);
    updateLinea(idx, {
      precio_tipo: tipo,
      precio: p ? precioProducto(p, tipo) : l.precio,
    });
  }

  function addLineaServicio() {
    setLineas((prev) => [...prev, newLineaServicio()]);
  }

  function addLineaProducto() {
    setLineas((prev) => [...prev, newLineaProducto()]);
  }

  // Agrega una promo: la explota en una línea de servicio por componente, con el
  // precio combo prorrateado según el peso del precio de lista de cada uno (el
  // ajuste de redondeo va en la última línea para que la suma == precio combo).
  function addPromo(promoId: string) {
    const promo = promociones.find((p) => p.id === promoId);
    if (!promo || promo.componentes.length === 0) return;
    const sumaLista = promo.componentes.reduce(
      (acc, c) => acc + c.precio_lista,
      0,
    );
    let acumulado = 0;
    const nuevas: LineaServicioForm[] = promo.componentes.map((c, i) => {
      const esUltima = i === promo.componentes.length - 1;
      const proporcion = sumaLista > 0 ? c.precio_lista / sumaLista : 1 / promo.componentes.length;
      const precio = esUltima
        ? Math.round((promo.precio_efectivo - acumulado) * 100) / 100
        : Math.round(promo.precio_efectivo * proporcion * 100) / 100;
      acumulado += precio;
      return {
        tempId: crypto.randomUUID(),
        tipo: "servicio",
        servicio_id: c.servicio_id,
        empleado_id: "",
        precio,
        precio_tipo: "efectivo",
        comision_pct: 0, // la define el % del empleado al asignarlo a la línea
        soporta_descuento: true,
        promo_servicio_id: promo.id,
        promo_nombre: promo.nombre,
      };
    });
    setLineas((prev) => {
      // Si la única línea es una de servicio vacía inicial, la reemplazamos.
      const base =
        prev.length === 1 &&
        prev[0].tipo === "servicio" &&
        !prev[0].servicio_id
          ? []
          : prev;
      return [...base, ...nuevas];
    });
  }

  function removeLinea(idx: number) {
    setLineas((prev) => {
      const objetivo = prev[idx];
      // Si la línea pertenece a una promo, quitar una parte saca la promo entera.
      const promoId =
        objetivo?.tipo === "servicio" ? objetivo.promo_servicio_id : undefined;
      let next: LineaForm[];
      if (promoId) {
        next = prev.filter(
          (l) => !(l.tipo === "servicio" && l.promo_servicio_id === promoId),
        );
      } else {
        if (prev.length <= 1) return prev;
        next = prev.filter((_, i) => i !== idx);
      }
      // Nunca dejar el ticket sin líneas.
      return next.length > 0 ? next : [newLineaServicio()];
    });
  }

  // Si un medio estaba en CC y el cliente ya no admite cuenta corriente, lo
  // reseteamos para no dejar una venta fiada a un cliente sin CC.
  function resetCcSiNoCorresponde(nuevoClienteId: string) {
    if (!medioCc) return;
    const nuevo = clientesList.find((c) => c.id === nuevoClienteId);
    if (nuevo?.cuenta_corriente_habilitada) return;
    if (mp1Id === medioCc.id) {
      setMp1Id(medioPorDefecto(efectivo, mediosNormales));
    }
    if (mp2Id === medioCc.id) setMp2Id("");
  }

  function handleClienteChange(nuevoId: string) {
    setClienteId(nuevoId);
    resetCcSiNoCorresponde(nuevoId);
  }

  // ----- Submit -----
  function handleSubmit(formData: FormData) {
    setErrors({});
    setWarnings([]);

    // Validación cliente-side mínima
    const lineaInvalida = lineas.some((l) => {
      if (l.tipo === "servicio") return !l.servicio_id || !l.empleado_id;
      return !l.insumo_id || !(Number(l.cantidad) > 0);
    });
    if (lineaInvalida) {
      setErrors({
        lineas: [
          "Revisá las líneas: los servicios necesitan servicio + empleado y los productos necesitan producto + cantidad > 0",
        ],
      });
      notifyError("Revisá las líneas antes de guardar");
      return;
    }

    formData.set("sucursal_id", sucursalId);
    formData.set("cliente_id", clienteId);
    formData.set(
      "lineas",
      JSON.stringify(
        lineas.map((l) => {
          if (l.tipo === "producto") {
            return {
              tipo: "producto" as const,
              insumo_id: l.insumo_id,
              cantidad: Number(l.cantidad) || 0,
              precio_efectivo: Number(l.precio) || 0,
            };
          }
          return {
            tipo: "servicio" as const,
            servicio_id: l.servicio_id,
            empleado_id: l.empleado_id,
            precio_efectivo: Number(l.precio) || 0,
            comision_pct: Number(l.comision_pct) || 0,
            soporta_descuento: l.soporta_descuento,
            promo_servicio_id: l.promo_servicio_id,
          };
        }),
      ),
    );
    formData.set("descuento_tipo", descTipo);
    formData.set("descuento_valor", String(Number(descValor) || 0));
    formData.set("descuento_motivo_id", descMonto > 0 ? descMotivoId : "");
    formData.set("mp1_id", mp1Id);
    formData.set("valor1", String(Number(valor1) || 0));
    formData.set(
      "mp1_cuenta_id",
      usaCuentaBanco(mp1) ? mp1CuentaId : "",
    );
    formData.set("gift_card_1_id", mp1EsGift ? giftCard1Id : "");
    if (mp2Id) {
      formData.set("mp2_id", mp2Id);
      formData.set("valor2", String(Number(valor2) || 0));
      formData.set(
        "mp2_cuenta_id",
        usaCuentaBanco(mp2) ? mp2CuentaId : "",
      );
      formData.set("gift_card_2_id", mp2EsGift ? giftCard2Id : "");
    }
    formData.set("observacion", observacion);
    formData.set("cliente_satisfecho", clienteSatisfecho ? "true" : "false");
    formData.set(
      "satisfaccion_nota",
      !clienteSatisfecho ? satisfaccionNota : "",
    );

    startTransition(async () => {
      const result = await createIngreso(formData);
      if (!result.ok) {
        setErrors(result.errors);
        notifyError("No se pudo guardar la venta");
        return;
      }
      if (result.warnings) {
        setWarnings(result.warnings);
        setTimeout(() => {
          if (result.ingresoId) {
            persistFlashToast({
              type: "success",
              message: "Venta guardada con advertencias",
            });
            router.push(`/ventas/${result.ingresoId}`);
          }
        }, 1500);
        return;
      }
      if (result.ingresoId) {
        persistFlashToast({
          type: "success",
          message: "Venta guardada",
        });
        router.push(`/ventas/${result.ingresoId}`);
      }
    });
  }

  const empleadosActivos = empleados.filter((e) => e.activo);
  const serviciosActivos = servicios.filter((s) => s.activo);

  const nServicios = lineas.filter((l) => l.tipo === "servicio").length;
  const nProductos = lineas.filter((l) => l.tipo === "producto").length;

  return (
    <>
    <form action={handleSubmit} className="space-y-8">
      {/* Header: cliente + sucursal info */}
      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Datos del ticket
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cliente
            </label>
            <div className="flex gap-2">
              <ClienteCombobox
                clientes={clientesList}
                value={clienteId}
                onChange={handleClienteChange}
              />
              <button
                type="button"
                onClick={() => setShowNewCliente(true)}
                className="px-3 py-2 border border-border rounded-md text-xs uppercase tracking-wider hover:bg-cream transition-colors whitespace-nowrap"
              >
                + Nuevo
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sucursal
            </label>
            <div className="px-3 py-2 border border-border rounded-md bg-cream/40 text-sm">
              {sucursalNombre}
            </div>
          </div>
        </div>
      </section>

      {/* Líneas */}
      <section className="space-y-3">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Líneas del ticket
            </h2>
            {nServicios > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sage-100 text-sage-800">
                <Scissors className="h-3 w-3 stroke-[1.5]" />
                {nServicios} servicio{nServicios !== 1 ? "s" : ""}
              </span>
            )}
            {nProductos > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warning/10 text-brown-700">
                <Package className="h-3 w-3 stroke-[1.5]" />
                {nProductos} producto{nProductos !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {promociones.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addPromo(e.target.value);
                  e.currentTarget.value = "";
                }}
                title="Agregar una promoción (se explota en sus servicios)"
                className="inline-flex items-center rounded-md border border-sage-700 bg-sage-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-sage-700 hover:bg-sage-100 transition-colors"
              >
                <option value="">+ Agregar promo</option>
                {promociones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {formatARS(p.precio_efectivo)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={addLineaServicio}
              className="inline-flex items-center gap-1.5 rounded-md bg-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-white hover:bg-sage-900 transition-colors"
            >
              <Scissors className="h-3.5 w-3.5 stroke-[1.5]" />
              Agregar servicio
            </button>
            <button
              type="button"
              onClick={addLineaProducto}
              disabled={productos.length === 0}
              title={
                productos.length === 0
                  ? "No hay productos cargados como vendibles en stock"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-sage-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-sage-700 hover:bg-sage-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Package className="h-3.5 w-3.5 stroke-[1.5]" />
              Agregar producto
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {lineas.map((l, idx) => (
            <div
              key={l.tempId}
              className={`bg-card border border-border rounded-md p-3 border-l-4 ${
                l.tipo === "servicio"
                  ? "border-l-sage-700"
                  : "border-l-amber-500"
              }`}
            >
              {l.tipo === "servicio" ? (
                <LineaServicioRow
                  linea={l}
                  servicios={serviciosActivos}
                  empleados={empleadosActivos}
                  comision={comisionDe(l)}
                  promoNombre={l.promo_nombre}
                  locked={!!l.promo_servicio_id}
                  onServicio={(id) => handleServicioChange(idx, id)}
                  onEmpleado={(id) => handleEmpleadoChange(idx, id)}
                  onPrecio={(v) => updateLinea(idx, { precio: v })}
                  onPrecioTipo={(t) => handlePrecioTipoChange(idx, t)}
                  onSoporta={(v) => updateLinea(idx, { soporta_descuento: v })}
                  onRemove={() => removeLinea(idx)}
                  removable={lineas.length > 1 || !!l.promo_servicio_id}
                />
              ) : (
                <LineaProductoRow
                  linea={l}
                  productos={productos}
                  onProducto={(id) => handleProductoChange(idx, id)}
                  onCantidad={(v) => updateLinea(idx, { cantidad: v })}
                  onPrecio={(v) => updateLinea(idx, { precio: v })}
                  onPrecioTipo={(t) => handlePrecioTipoProducto(idx, t)}
                  onRemove={() => removeLinea(idx)}
                  removable={lineas.length > 1}
                />
              )}
            </div>
          ))}
        </div>

        {errors.lineas && (
          <p className="text-xs text-destructive">{errors.lineas.join(", ")}</p>
        )}
      </section>

      {/* Resumen + descuento + pagos en grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Descuento */}
        <section className="bg-card border border-border rounded-md p-5 space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Descuento
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tipo
              </label>
              <select
                value={descTipo}
                onChange={(e) =>
                  setDescTipo(e.target.value as "pct" | "monto")
                }
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
              >
                <option value="pct">Porcentaje (%)</option>
                <option value="monto">Monto ($)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Valor
              </label>
              {descTipo === "monto" ? (
                <CurrencyInput
                  value={descValor}
                  onChange={setDescValor}
                  min={0}
                  className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={descValor}
                  onChange={(e) => setDescValor(Number(e.target.value))}
                  className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
          </div>
          {errors.descuento_valor && (
            <p className="text-xs text-destructive">
              {errors.descuento_valor.join(", ")}
            </p>
          )}
          {descMonto > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Motivo del descuento *
              </label>
              {motivosDescuento.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay motivos cargados. Pedí a un administrador que los cree en
                  Catálogos → Motivos de descuento.
                </p>
              ) : (
                <select
                  value={descMotivoId}
                  onChange={(e) => setDescMotivoId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Elegí un motivo —</option>
                  {motivosDescuento.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
              {errors.descuento_motivo_id && (
                <p className="text-xs text-destructive">
                  {errors.descuento_motivo_id.join(", ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                Descuento aplicado: {formatARS(descMonto)}
              </p>
            </div>
          )}
        </section>

        {/* Resumen / totales con reparto */}
        <section className="bg-cream/40 border border-border rounded-md p-5 space-y-3 text-sm">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Resumen y reparto
          </h2>

          <div className="space-y-1.5">
            <div className="flex justify-between tabular-nums">
              <span>Subtotal</span>
              <span>{formatARS(subtotal)}</span>
            </div>
            {descMonto > 0 && (
              <div className="flex justify-between tabular-nums text-muted-foreground">
                <span>Descuento</span>
                <span>− {formatARS(descMonto)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-2xl pt-2 border-t border-border tabular-nums">
              <span>Total</span>
              <span>{formatARS(total)}</span>
            </div>
          </div>

          {/* Reparto: empleados + local */}
          <div className="pt-3 border-t border-border space-y-1.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Reparto del ticket
            </p>

            {repartoEmpleados.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Asigná empleados a las líneas de servicio para ver el reparto.
              </p>
            ) : (
              repartoEmpleados.map((r) => (
                <div
                  key={r.nombre}
                  className="flex justify-between items-center tabular-nums text-sm"
                >
                  <span>
                    {r.nombre}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {r.lineas} línea{r.lineas !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <span style={{ color: "var(--sage-700)" }}>
                    {formatARS(r.total)}
                  </span>
                </div>
              ))
            )}

            <div
              className="flex justify-between items-center pt-2 mt-2 border-t border-border tabular-nums"
              style={{ borderTopStyle: "dashed" }}
            >
              <span className="text-xs uppercase tracking-wider font-medium">
                Para el local
              </span>
              <span
                className="font-display text-xl"
                style={{
                  color:
                    paraElLocal >= 0 ? "var(--ink)" : "var(--danger)",
                }}
              >
                {formatARS(paraElLocal)}
              </span>
            </div>

            {total > 0 && repartoEmpleados.length > 0 && (
              <p className="text-[10px] text-muted-foreground tabular-nums pt-1">
                Equipo {((totalComisiones / total) * 100).toFixed(0)}% · Local{" "}
                {((paraElLocal / total) * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Aviso: doble descuento (no bloquea) */}
      {avisoDobleDescuento && (
        <div
          className="border rounded-md p-4 flex items-start gap-3"
          style={{
            backgroundColor: "rgb(201 169 97 / 0.08)",
            borderColor: "var(--warning)",
          }}
        >
          <AlertTriangle
            className="h-5 w-5 stroke-[1.5] shrink-0"
            style={{ color: "var(--warning)" }}
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium" style={{ color: "var(--warning)" }}>
              Cuidado: estás acumulando descuentos
            </p>
            <p className="text-xs text-muted-foreground">
              Hay líneas a precio <strong>Efectivo</strong> (que ya incluye el
              descuento del 20%) y además aplicaste un descuento manual. Revisá
              que no estés sumando los dos descuentos. Si el cliente tiene el
              descuento manual, las líneas deberían ir a precio de{" "}
              <strong>Lista</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Aviso: promo fuera de franja / vencida (no bloquea) */}
      {avisosPromo.length > 0 && (
        <div
          className="border rounded-md p-4 flex items-start gap-3"
          style={{
            backgroundColor: "rgb(201 169 97 / 0.08)",
            borderColor: "var(--warning)",
          }}
        >
          <AlertTriangle
            className="h-5 w-5 stroke-[1.5] shrink-0"
            style={{ color: "var(--warning)" }}
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium" style={{ color: "var(--warning)" }}>
              Promo fuera de vigencia
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {avisosPromo.map((a) => (
                <li key={a.nombre}>
                  <strong>{a.nombre}</strong>: {a.motivo}. Podés vender igual.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Pagos */}
      <section className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Medios de pago
        </h2>

        {/* La plata a favor no se descuenta sola: se cobra con el medio "CC",
            que genera el cargo que la consume. Si no se avisa acá, nadie se
            entera de que estaba. */}
        {sinCuenta.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
            <p className="text-xs font-medium text-brown-900">
              {sinCuenta.join(" y ")}{" "}
              {sinCuenta.length > 1 ? "no tienen" : "no tiene"} cuenta asignada
            </p>
            <p className="mt-1 text-xs text-brown-700">
              La venta se va a guardar, pero{" "}
              <strong>esa plata no va a aparecer en la caja del día</strong>.
              Asignale una cuenta en Catálogos → Medios de pago.
            </p>
          </div>
        )}

        {saldoAFavorCliente > 0 && (
          <p className="rounded-md border border-sage-300 bg-sage-50 px-3 py-2 text-xs text-sage-900">
            <strong>{clienteSel?.nombre}</strong> tiene{" "}
            <strong className="tabular-nums">
              {formatARS(saldoAFavorCliente)}
            </strong>{" "}
            a favor. Para usarlo, cobrá esa parte con <strong>CC</strong>.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Medio 1
            </label>
            <select
              value={mp1Id}
              onChange={(e) => {
                setMp1Id(e.target.value);
                // Si deja de ser gift card, la tarjeta elegida no aplica más.
                if (!medioGift || e.target.value !== medioGift.id) setGiftCard1Id("");
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
              required
            >
              {/* Sólo cuando no se pudo elegir uno seguro por defecto: obliga a
                  decidir en vez de aplicar un recargo por descarte. */}
              {!mp1Id && <option value="">— Elegí cómo cobrás —</option>}
              {mediosNormales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo} — {m.nombre}
                  {m.recargo_pct > 0 ? ` (+${m.recargo_pct}%)` : ""}
                </option>
              ))}
              {clienteTieneCc && medioCc && (
                <option value={medioCc.id}>CC — Cuenta corriente</option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Valor 1
            </label>
            <CurrencyInput
              value={valor1}
              min={0}
              onChange={(v) => {
                setValor1(v);
                if (mp2Id) setValor2(Math.max(0, total - v));
              }}
              className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {recargo1 > 0 && (
              <p className="text-[10px] text-warning tabular-nums">
                + recargo {mp1?.recargo_pct}% = {formatARS(valor1 + recargo1)} a cobrar
              </p>
            )}
          </div>
        </div>

        {usaCuentaBanco(mp1) && (
          <BancoSelector
            cuentas={cuentasBanco}
            value={mp1CuentaId}
            onChange={setMp1CuentaId}
            label="Cuenta de cobro (Medio 1)"
          />
        )}

        {mp1EsGift && (
          <GiftCardSelector
            label="Gift card (Medio 1)"
            giftCards={giftCards}
            value={giftCard1Id}
            error={errors.gift_card_1_id}
            onChange={(id) => {
              setGiftCard1Id(id);
              // Se propone lo máximo que cubre la tarjeta: si no alcanza para
              // todo, el resto queda para el medio 2.
              const g = giftCards.find((x) => x.id === id);
              if (g) {
                const aplica = Math.min(g.saldo, total);
                setValor1(aplica);
                if (mp2Id) setValor2(Math.max(0, total - aplica));
              }
            }}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Medio 2 (opcional)
            </label>
            <select
              value={mp2Id}
              onChange={(e) => {
                const v = e.target.value;
                setMp2Id(v);
                if (!medioGift || v !== medioGift.id) setGiftCard2Id("");
                if (!v) {
                  setValor1(total);
                  setValor2(0);
                } else {
                  setValor2(Math.max(0, total - (Number(valor1) || 0)));
                }
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm"
            >
              <option value="">— Ninguno —</option>
              {mediosNormales
                .filter((m) => m.id !== mp1Id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} — {m.nombre}
                  </option>
                ))}
              {clienteTieneCc && medioCc && !mp1EsCc && (
                <option value={medioCc.id}>CC — Cuenta corriente</option>
              )}
            </select>
          </div>
          {mp2Id && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Valor 2
              </label>
              <CurrencyInput
                value={valor2}
                min={0}
                onChange={(v) => {
                  setValor2(v);
                  setValor1(Math.max(0, total - v));
                }}
                className="w-full px-3 py-2 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {recargo2 > 0 && (
                <p className="text-[10px] text-warning tabular-nums">
                  + recargo {mp2?.recargo_pct}% = {formatARS(valor2 + recargo2)} a cobrar
                </p>
              )}
            </div>
          )}
        </div>

        {mp2Id && usaCuentaBanco(mp2) && (
          <BancoSelector
            cuentas={cuentasBanco}
            value={mp2CuentaId}
            onChange={setMp2CuentaId}
            label="Cuenta de cobro (Medio 2)"
          />
        )}

        {mp2EsGift && (
          <GiftCardSelector
            label="Gift card (Medio 2)"
            giftCards={giftCards.filter((g) => g.id !== giftCard1Id)}
            value={giftCard2Id}
            error={errors.gift_card_2_id}
            onChange={(id) => {
              setGiftCard2Id(id);
              const g = giftCards.find((x) => x.id === id);
              if (g) {
                const aplica = Math.min(g.saldo, Math.max(0, total - (Number(valor1) || 0)));
                setValor2(aplica);
              }
            }}
          />
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border text-sm tabular-nums">
          <span className="text-muted-foreground">Pagado · Total · Diferencia</span>
          <span>
            {formatARS(pagado)} · {formatARS(total)} ·{" "}
            <span
              style={{
                color: pagosOk
                  ? "var(--sage-700)"
                  : "var(--danger)",
              }}
            >
              {formatARS(diff)}
            </span>
          </span>
        </div>
        {recargoTotal > 0 && (
          <div className="flex items-center justify-between text-sm tabular-nums">
            <span className="text-warning uppercase tracking-wider text-xs">
              Recargo · Total a cobrar
            </span>
            <span className="text-warning">
              + {formatARS(recargoTotal)} ·{" "}
              <span className="font-display text-lg text-foreground">
                {formatARS(totalACobrar)}
              </span>
            </span>
          </div>
        )}
        {errors.valor1 && (
          <p className="text-xs text-destructive">{errors.valor1.join(", ")}</p>
        )}

        {usaCc && montoFiado > 0 && (
          <div
            className="border rounded-md p-3 flex items-start gap-2.5 text-sm"
            style={{
              backgroundColor: "rgb(201 169 97 / 0.08)",
              borderColor: "var(--warning)",
            }}
          >
            <CreditCard
              className="h-4 w-4 stroke-[1.5] shrink-0 mt-0.5"
              style={{ color: "var(--warning)" }}
            />
            <p className="text-xs">
              Se generará una deuda de{" "}
              <strong className="tabular-nums">{formatARS(montoFiado)}</strong> en
              la cuenta corriente de{" "}
              <strong>{clienteSel?.nombre ?? "el cliente"}</strong>. Esta parte no
              entra a bancos hasta que se salde.
            </p>
          </div>
        )}
      </section>

      {/* Observación */}
      <section className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Observación
        </label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </section>

      {/* Satisfacción del cliente */}
      <section className="bg-card border border-border rounded-md p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={clienteSatisfecho}
            onChange={(e) => setClienteSatisfecho(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-sage-500"
          />
          <span>El cliente quedó satisfecho</span>
        </label>
        {!clienteSatisfecho && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Motivo (opcional)
            </label>
            <textarea
              value={satisfaccionNota}
              onChange={(e) => setSatisfaccionNota(e.target.value)}
              rows={2}
              placeholder="Ej. disconforme con el color; hubo que repasar y se usó más insumo…"
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </section>

      {/* Warnings de stock */}
      {warnings.length > 0 && (
        <div
          className="border rounded-md p-4 flex items-start gap-3"
          style={{
            backgroundColor: "rgb(201 169 97 / 0.08)",
            borderColor: "var(--warning)",
          }}
        >
          <AlertTriangle
            className="h-5 w-5 stroke-[1.5] shrink-0"
            style={{ color: "var(--warning)" }}
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium" style={{ color: "var(--warning)" }}>
              Venta guardada con advertencias de stock
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Redirigiendo al detalle…
            </p>
          </div>
        </div>
      )}

      {/* Errores globales / cualquier error no mostrado inline */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-destructive/10 border border-destructive rounded-md p-4 text-sm text-destructive space-y-1">
          <p className="font-medium">No se pudo guardar la venta:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {Object.entries(errors).flatMap(([campo, msgs]) =>
              (msgs ?? []).map((m, i) => (
                <li key={`${campo}-${i}`}>{m}</li>
              )),
            )}
          </ul>
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-2">
        <LoadingButton
          type="submit"
          pending={pending}
          pendingLabel="Guardando..."
          disabled={!pagosOk || !giftOk || !mp1Id || lineas.length === 0 || pending}
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700 disabled:cursor-not-allowed"
        >
          Guardar venta
        </LoadingButton>
        {!pending && !pagosOk && (
          <span className="text-xs text-destructive">
            La suma de pagos no coincide con el total ({formatARS(diff)} de
            diferencia).
          </span>
        )}
        {!pending && pagosOk && giftFalta && (
          <span className="text-xs text-destructive">
            Elegí qué gift card se está canjeando.
          </span>
        )}
        {!pending && pagosOk && !giftFalta && giftSinSaldo && (
          <span className="text-xs text-destructive">
            La gift card no tiene saldo suficiente para ese monto.
          </span>
        )}
        <Link
          href="/ventas"
          className="px-4 py-2.5 rounded-md text-sm font-medium border border-border hover:bg-cream transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>

    {showNewCliente && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => !newClienteSaving && setShowNewCliente(false)}
      >
        <div
          className="bg-card border border-border rounded-md shadow-lg w-full max-w-md p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <h3 className="font-display text-lg tracking-[0.15em] uppercase">
              Nuevo cliente
            </h3>
            <button
              type="button"
              onClick={() => setShowNewCliente(false)}
              disabled={newClienteSaving}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nombre *
              </label>
              <input
                ref={newClienteNombreRef}
                type="text"
                value={newClienteNombre}
                onChange={(e) => setNewClienteNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCliente();
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Teléfono
              </label>
              <input
                type="tel"
                value={newClienteTel}
                onChange={(e) => setNewClienteTel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCliente();
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {newClienteError && (
            <p className="text-xs text-destructive">{newClienteError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewCliente(false)}
              disabled={newClienteSaving}
              className="px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-cream transition-colors"
            >
              Cancelar
            </button>
            <LoadingButton
              type="button"
              onClick={handleCreateCliente}
              pending={newClienteSaving}
              pendingLabel="Guardando..."
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-brown-700"
            >
              Crear
            </LoadingButton>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function LineaServicioRow({
  linea,
  servicios,
  empleados,
  comision,
  promoNombre,
  locked,
  onServicio,
  onEmpleado,
  onPrecio,
  onPrecioTipo,
  onSoporta,
  onRemove,
  removable,
}: {
  linea: LineaServicioForm;
  servicios: Servicio[];
  empleados: Empleado[];
  comision: number;
  promoNombre?: string;
  locked: boolean;
  onServicio: (id: string) => void;
  onEmpleado: (id: string) => void;
  onPrecio: (v: number) => void;
  onPrecioTipo: (t: "lista" | "efectivo") => void;
  onSoporta: (v: boolean) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const servicio = servicios.find((s) => s.id === linea.servicio_id);
  return (
    <div className="space-y-2">
      {promoNombre && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-ink text-white">
          <Tags className="h-3 w-3 stroke-[1.5]" />
          Promo · {promoNombre}
        </span>
      )}
      <div className="grid grid-cols-12 gap-2 items-start">
        <div className="col-span-12 sm:col-span-2 flex items-center">
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded bg-sage-100 text-sage-800 ring-1 ring-inset ring-sage-700/30">
            <Scissors className="h-3.5 w-3.5 stroke-[1.5]" />
            Servicio
          </span>
        </div>
        <div className="col-span-12 sm:col-span-3">
          {locked ? (
            <div className="w-full px-2 py-1.5 border border-border rounded-md bg-cream/40 text-sm truncate">
              {servicio?.nombre ?? "Servicio de promo"}
            </div>
          ) : (
            <select
              value={linea.servicio_id}
              onChange={(e) => onServicio(e.target.value)}
              className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Servicio —</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="col-span-12 sm:col-span-3">
          <select
            value={linea.empleado_id}
            onChange={(e) => onEmpleado(e.target.value)}
            className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Empleado —</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-6 sm:col-span-2">
          {locked ? (
            <div
              className="w-full px-2 py-1.5 text-right tabular-nums border border-border rounded-md bg-cream/40 text-sm"
              title="El precio lo define la promo"
            >
              {formatARS(linea.precio)}
            </div>
          ) : (
            <CurrencyInput
              value={linea.precio}
              onChange={onPrecio}
              min={0}
              className="w-full px-2 py-1.5 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </div>
        <div className="col-span-5 sm:col-span-1 text-right tabular-nums text-sm self-center">
          <span
            style={{
              color: comision > 0 ? "var(--sage-700)" : "var(--muted-foreground)",
              fontWeight: comision > 0 ? 500 : 400,
            }}
          >
            {formatARS(comision)}
          </span>
          {linea.servicio_id && (
            <p className="text-[10px] text-muted-foreground">
              {linea.comision_pct || 0}%
            </p>
          )}
        </div>
        <div className="col-span-1 self-center text-center">
          <button
            type="button"
            onClick={onRemove}
            disabled={!removable}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
            title="Quitar línea"
          >
            <X className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>
      </div>

      {/* En líneas de promo el precio es fijo (lo define la promo). */}
      {locked && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground sm:pl-[16.67%]">
          Precio fijo por promo · prorrateado del precio combo
        </p>
      )}

      {/* Controles de precio y comisión por descuento */}
      {linea.servicio_id && !locked && (
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 sm:col-start-3 sm:col-span-4 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Precio
            </span>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onPrecioTipo("lista")}
                className={`px-2.5 py-1 transition-colors ${
                  linea.precio_tipo === "lista"
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                Lista
                {servicio ? ` · ${formatARS(servicio.precio_lista)}` : ""}
              </button>
              <button
                type="button"
                onClick={() => onPrecioTipo("efectivo")}
                className={`px-2.5 py-1 border-l border-border transition-colors ${
                  linea.precio_tipo === "efectivo"
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                Efectivo
                {servicio ? ` · ${formatARS(servicio.precio_efectivo)}` : ""}
              </button>
            </div>
          </div>
          <div className="col-span-12 sm:col-span-5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              ¿Empleada absorbe el descuento?
            </span>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onSoporta(true)}
                title="Comisión sobre el precio final pagado"
                className={`px-2.5 py-1 transition-colors ${
                  linea.soporta_descuento
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => onSoporta(false)}
                title="Comisión sobre el precio de lista (regular)"
                className={`px-2.5 py-1 border-l border-border transition-colors ${
                  !linea.soporta_descuento
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BancoSelector({
  cuentas,
  value,
  onChange,
  label,
}: {
  cuentas: CuentaBancaria[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {cuentas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay cuentas bancarias cargadas. Cargá Macro / Galicia en Catálogos →
          Cuentas bancarias.
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Cuenta por defecto del medio —</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Qué gift card se está canjeando.
 *
 * Muestra TAMBIÉN las que no se pueden usar, deshabilitadas y con el motivo al
 * lado ("ya canjeada", "anulada"). Una lista vacía y una tarjeta falsa se ven
 * igual desde el mostrador; el motivo visible le dice a la recepcionista qué
 * pasó y le evita el papelón de decirle a la clienta "no existe" cuando en
 * realidad ya la usó.
 *
 * Las vencidas SÍ se pueden elegir: el salón hace excepciones con la fecha.
 * Aparecen con el aviso de que el canje va a quedar registrado fuera de término.
 */
function GiftCardSelector({
  label,
  giftCards,
  value,
  error,
  onChange,
}: {
  label: string;
  giftCards: GiftCard[];
  value: string;
  error?: string[];
  onChange: (v: string) => void;
}) {
  const hoy = hoyAr();
  const elegida = giftCards.find((g) => g.id === value);
  const chequeo = elegida ? esCanjeable(elegida, hoy) : undefined;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {giftCards.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay gift cards emitidas en esta sucursal. Se emiten en Catálogos →
          Gift cards.
        </p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Elegí la tarjeta —</option>
          {giftCards.map((g) => {
            const estado = estadoGiftCard(g, hoy);
            const usable = esCanjeable(g, hoy).canjeable;
            const quien = g.beneficiaria ? ` · ${g.beneficiaria}` : "";
            const detalle = usable
              ? `saldo ${formatARS(g.saldo)}${estado === "vencida" ? " · VENCIDA" : ""}`
              : estado === "canjeada"
                ? "ya canjeada"
                : "anulada";
            return (
              <option key={g.id} value={g.id} disabled={!usable}>
                {g.codigo}{quien} · {detalle}
              </option>
            );
          })}
        </select>
      )}
      {chequeo?.advertencia && (
        <p className="text-[10px] text-warning">{chequeo.advertencia}</p>
      )}
      {elegida && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          Le quedan {formatARS(elegida.saldo)}
          {elegida.emitida_pre_sistema
            ? " · se vendió antes del sistema: su venta ya se contó como facturación"
            : ""}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error.join(", ")}</p>}
    </div>
  );
}

function LineaProductoRow({
  linea,
  productos,
  onProducto,
  onCantidad,
  onPrecio,
  onPrecioTipo,
  onRemove,
  removable,
}: {
  linea: LineaProductoForm;
  productos: Insumo[];
  onProducto: (id: string) => void;
  onCantidad: (v: number) => void;
  onPrecio: (v: number) => void;
  onPrecioTipo: (tipo: "lista" | "efectivo") => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const subtotal = subtotalLinea(linea);
  const producto = productos.find((p) => p.id === linea.insumo_id);
  // El botón solo aparece si el producto tiene los dos precios cargados.
  const dosPrecios =
    producto?.precio_venta != null && producto.precio_venta_efectivo != null;
  return (
    <div className="space-y-2">
    <div className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-12 sm:col-span-2 flex items-center">
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded bg-warning/10 text-brown-700 ring-1 ring-inset ring-warning/40">
          <Package className="h-3.5 w-3.5 stroke-[1.5]" />
          Producto
        </span>
      </div>
      <div className="col-span-12 sm:col-span-4">
        <select
          value={linea.insumo_id}
          onChange={(e) => onProducto(e.target.value)}
          className="w-full px-2 py-1.5 border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Producto —</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.precio_venta != null ? ` · ${formatARS(p.precio_venta)}` : ""}
              {p.precio_venta_efectivo != null
                ? ` / ${formatARS(p.precio_venta_efectivo)} ef.`
                : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-4 sm:col-span-2">
        <input
          type="number"
          step="1"
          min="1"
          value={linea.cantidad}
          onChange={(e) => onCantidad(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">
          Cantidad
        </p>
      </div>
      <div className="col-span-7 sm:col-span-2">
        <CurrencyInput
          value={linea.precio}
          onChange={onPrecio}
          min={0}
          className="w-full px-2 py-1.5 text-right tabular-nums border border-border rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">
          Precio unitario
        </p>
      </div>
      <div className="col-span-12 sm:col-span-1 text-right tabular-nums text-sm self-center">
        <span className="font-medium">{formatARS(subtotal)}</span>
        <p className="text-[10px] text-muted-foreground">Subtotal</p>
      </div>
      <div className="col-span-12 sm:col-span-1 self-center text-center">
        <button
          type="button"
          onClick={onRemove}
          disabled={!removable}
          className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
          title="Quitar línea"
        >
          <X className="h-4 w-4 stroke-[1.5]" />
        </button>
      </div>
    </div>

      {dosPrecios && producto && (
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 sm:col-start-3 sm:col-span-6 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Precio
            </span>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onPrecioTipo("lista")}
                className={`px-2.5 py-1 transition-colors ${
                  linea.precio_tipo === "lista"
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                Lista · {formatARS(producto.precio_venta!)}
              </button>
              <button
                type="button"
                onClick={() => onPrecioTipo("efectivo")}
                className={`px-2.5 py-1 border-l border-border transition-colors ${
                  linea.precio_tipo === "efectivo"
                    ? "bg-ink text-white"
                    : "bg-card hover:bg-cream"
                }`}
              >
                Efectivo · {formatARS(producto.precio_venta_efectivo!)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
