/** Recheck after an ordinary re-login; never read or copy authentication tokens. */
export function watchUniformAdminLogin(onRecheck: () => void, target: EventTarget = window) {
  const onStorage = (event: Event) => {
    if ('key' in event && (event.key === 'physiproof_uniform_admin_token' || event.key === null)) onRecheck();
  };
  target.addEventListener('storage', onStorage);
  target.addEventListener('focus', onRecheck);
  return () => {
    target.removeEventListener('storage', onStorage);
    target.removeEventListener('focus', onRecheck);
  };
}
