// Password + phone rules shared by the auth and admin-user routes.

// Admins may use a short numeric PIN because they also carry phone sign-in;
// every other role must use a full text password.
export function passwordRuleError(role, password) {
  const pw = String(password || '');
  if (role === 'admin') {
    if (/^\d{4}$/.test(pw) || /^\d{6}$/.test(pw) || pw.length >= 8) return null;
    return 'Password must be a 4-digit PIN, a 6-digit PIN, or at least 8 characters';
  }
  return pw.length >= 8 ? null : 'Password must be at least 8 characters';
}

// Canonical form of a phone number: its last 10 digits, so "+91 98765-43210"
// and "9876543210" compare equal. Anything with fewer than 10 digits has no
// canonical form and never matches.
export function phoneKey(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}
