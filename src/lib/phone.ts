/**
 * Normalización de teléfonos a E.164 Argentina.
 *
 * Formato destino: +549<codArea><numero> (móvil) o +54<codArea><numero> (fijo).
 * Para WhatsApp en Argentina ManyChat espera el "9" después del código país
 * en celulares — siempre lo agregamos si no está, asumiendo móvil.
 */

export class PhoneNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneNormalizationError";
  }
}

const AR_COUNTRY_CODE = "54";
const AR_MOBILE_PREFIX = "9";

/**
 * Código de área que se asume cuando el número viene sin él ("155123456",
 * "5123456"). Las dos sucursales están en San Miguel de Tucumán, y en el
 * mostrador es común anotarlo así.
 */
const AREA_LOCAL = "381";

/**
 * Normaliza un teléfono argentino a E.164.
 *
 * Acepta entradas como:
 *   "11 5555 6666", "11-5555-6666", "+54 9 11 5555 6666",
 *   "5491155556666", "541155556666", "01155556666",
 *   "381 15 5123456", "0381 15 5123456", "155123456", "5123456"
 *
 * Devuelve siempre "+549XXXXXXXXXX" para celulares.
 *
 * Reglas:
 *  - Si empieza con +, se respeta el código de país. Si es +54 sin "9", se agrega
 *    el "9" (asumimos móvil para WhatsApp).
 *  - Si no empieza con +, se asume Argentina.
 *  - El "0" inicial del código de área se descarta.
 *  - El "15" intermedio (formato viejo de celular argentino) se descarta, sea
 *    cual sea el largo del código de área (11, 381, 3865).
 *  - Sin código de área (7 dígitos, o 15 + 7) se asume el de Tucumán.
 *  - Un "+549" cargado dos veces ("+549549381…") se toma una sola vez.
 *  - El resultado tiene que ser código de área + número = 10 dígitos.
 *
 * Por qué importa: el control de clientas repetidas compara este valor. Con
 * "381 15 5123456" o "155123456" devolvía error, la ficha quedaba sin número
 * normalizado y el sistema dejaba cargar a la misma clienta otra vez. Malala
 * YB (19/11/2026): "en un cliente se pone +549 y en el otro no y te deja
 * sumarlo".
 */
export function normalizarTelefonoAR(input: string | null | undefined): string {
  if (!input) {
    throw new PhoneNormalizationError("Teléfono vacío");
  }

  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D+/g, "");

  if (digits.length === 0) {
    throw new PhoneNormalizationError("Teléfono sin dígitos");
  }

  if (hasPlus) {
    if (digits.startsWith(AR_COUNTRY_CODE)) {
      digits = digits.slice(AR_COUNTRY_CODE.length);
    } else {
      throw new PhoneNormalizationError(
        "Sólo se aceptan teléfonos de Argentina (+54)",
      );
    }
  } else if (digits.startsWith(AR_COUNTRY_CODE) && digits.length >= 12) {
    digits = digits.slice(AR_COUNTRY_CODE.length);
  }

  if (digits.startsWith(AR_MOBILE_PREFIX) && digits.length >= 11) {
    digits = digits.slice(AR_MOBILE_PREFIX.length);
  }

  // "+549 549 381…": el prefijo cargado dos veces.
  if (digits.startsWith(AR_COUNTRY_CODE) && digits.length >= 12) {
    digits = digits.slice(AR_COUNTRY_CODE.length);
    if (digits.startsWith(AR_MOBILE_PREFIX) && digits.length >= 11) {
      digits = digits.slice(AR_MOBILE_PREFIX.length);
    }
  }

  while (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  digits = stripLegacy15(digits);

  // Sin código de área: "15 512-3456" o "512-3456".
  if (digits.length === 9 && digits.startsWith("15")) {
    digits = AREA_LOCAL + digits.slice(2);
  } else if (digits.length === 7) {
    digits = AREA_LOCAL + digits;
  }

  if (digits.length < 10 || digits.length > 11) {
    throw new PhoneNormalizationError(
      "El teléfono debe tener 10 u 11 dígitos (código de área + número)",
    );
  }

  if (digits.length === 11 && digits.startsWith("15")) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10) {
    throw new PhoneNormalizationError(
      "Formato de teléfono argentino inválido",
    );
  }

  return `+${AR_COUNTRY_CODE}${AR_MOBILE_PREFIX}${digits}`;
}

/**
 * Saca el "15" que va entre el código de área y el número. Código de área +
 * número siempre suman 10 dígitos, así que con el 15 son 12: "11 15 55556666",
 * "381 15 5123456", "3865 15 123456". El único código de área de 2 dígitos es
 * el 11.
 */
function stripLegacy15(digits: string): string {
  if (digits.length !== 12) return digits;
  for (const len of [2, 3, 4]) {
    if (len === 2 && !digits.startsWith("11")) continue;
    if (digits.slice(len, len + 2) === "15") {
      return digits.slice(0, len) + digits.slice(len + 2);
    }
  }
  return digits;
}

export function tryNormalizarTelefonoAR(
  input: string | null | undefined,
): string | null {
  try {
    return normalizarTelefonoAR(input);
  } catch {
    return null;
  }
}

/**
 * Formato amigable para UI: "+54 9 11 5555-6666"
 */
export function formatearTelefonoAR(e164: string): string {
  if (!e164.startsWith(`+${AR_COUNTRY_CODE}${AR_MOBILE_PREFIX}`)) return e164;
  const rest = e164.slice(`+${AR_COUNTRY_CODE}${AR_MOBILE_PREFIX}`.length);
  if (rest.length !== 10) return e164;
  const area = rest.slice(0, 2);
  const a = rest.slice(2, 6);
  const b = rest.slice(6, 10);
  return `+54 9 ${area} ${a}-${b}`;
}
