// ============================================================
//  Validadores de entrada
// ============================================================

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Contraseña requerida.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'La contraseña debe incluir al menos una mayúscula.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'La contraseña debe incluir al menos una minúscula.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'La contraseña debe incluir al menos un número.' };
  }
  return { valid: true, error: null };
}

module.exports = { validatePassword };
