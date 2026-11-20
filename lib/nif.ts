// Spanish tax id validation (DNI / NIE / CIF), matching Contasimple's requirements.
// Returns { valid, message } — message describes the problem when invalid.

export function validateSpanishNif(raw: string | null | undefined): { valid: boolean; message?: string } {
  if (!raw || !raw.trim()) return { valid: false, message: "El NIF/CIF es obligatorio." };
  const nif = raw.trim().toUpperCase().replace(/[\s.-]/g, "");

  const dniRe = /^(\d{8})([A-Z])$/;
  const nieRe = /^([XYZ])(\d{7})([A-Z])$/;
  const cifRe = /^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/;
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dni = nif.match(dniRe);
  if (dni) {
    const expected = letters[parseInt(dni[1], 10) % 23];
    return dni[2] === expected
      ? { valid: true }
      : { valid: false, message: `La letra del DNI no es correcta (debería ser ${expected}).` };
  }

  const nie = nif.match(nieRe);
  if (nie) {
    const prefNum = nie[1] === "X" ? "0" : nie[1] === "Y" ? "1" : "2";
    const full = parseInt(prefNum + nie[2], 10);
    const expected = letters[full % 23];
    return nie[3] === expected
      ? { valid: true }
      : { valid: false, message: `La letra del NIE no es correcta (debería ser ${expected}).` };
  }

  const cif = nif.match(cifRe);
  if (cif) {
    const letter = cif[1];
    const digits = cif[2];
    const control = cif[3];
    let sumEven = 0; // positions 2,4,6 (0-based indices 1,3,5)
    let sumOdd = 0; // positions 1,3,5,7 (0-based indices 0,2,4,6), doubled
    for (let i = 0; i < 7; i++) {
      const d = parseInt(digits[i], 10);
      if (i % 2 === 0) {
        let x = d * 2;
        if (x > 9) x -= 9;
        sumOdd += x;
      } else {
        sumEven += d;
      }
    }
    const total = sumEven + sumOdd;
    const ctrlDigit = (10 - (total % 10)) % 10;
    const ctrlLetter = "JABCDEFGHI"[ctrlDigit];
    const onlyNumber = "ABEH";
    const onlyLetter = "KPQS";
    if (onlyLetter.includes(letter)) {
      return control === ctrlLetter
        ? { valid: true }
        : { valid: false, message: "El dígito de control del CIF no es correcto." };
    }
    if (onlyNumber.includes(letter)) {
      return control === String(ctrlDigit)
        ? { valid: true }
        : { valid: false, message: "El dígito de control del CIF no es correcto." };
    }
    return control === String(ctrlDigit) || control === ctrlLetter
      ? { valid: true }
      : { valid: false, message: "El dígito de control del CIF no es correcto." };
  }

  return { valid: false, message: "Formato de NIF/CIF no válido (ej: 12345678Z, X1234567L o B12345678)." };
}
