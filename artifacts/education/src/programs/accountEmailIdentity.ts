export function validAccountEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@<>,;:"\\]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

const owner = (username: string) => username.trim().toLowerCase();
const key = (username: string) => `ge_account_email_${encodeURIComponent(owner(username))}`;

/** Written only from a successful authenticated response, never from the
 * ownerless legacy ge_email value, which may belong to a different account. */
export function rememberAccountEmail(username: string, email: unknown): void {
  try {
    if (!owner(username)) return;
    if (typeof email !== 'string' || !validAccountEmail(email.trim())) {
      localStorage.removeItem(key(username));
      return;
    }
    localStorage.setItem(key(username), JSON.stringify({ owner: owner(username), email: email.trim() }));
  } catch { /* Storage failure must not turn a successful sign-in into failure. */ }
}

export function readAccountEmail(username: string): string {
  try {
    const record = JSON.parse(localStorage.getItem(key(username)) || 'null');
    return record?.owner === owner(username) && typeof record.email === 'string' && validAccountEmail(record.email)
      ? record.email : '';
  } catch { return ''; }
}
