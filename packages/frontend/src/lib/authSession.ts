import { authSessionResponseSchema } from '@my-app/shared';

export function restoreAuthSession(value: unknown): '/admin' | '/dashboard' {
  const session = authSessionResponseSchema.parse(value);
  const { accessToken, uniformAdminToken, ...profile } = session;
  localStorage.setItem('physiproof_access_token', accessToken);
  localStorage.setItem('physiproof_user', JSON.stringify(profile));
  window.dispatchEvent(new Event('physiproof-session-restored'));
  localStorage.setItem('physiproof_test_uid', session.userId);
  localStorage.removeItem('physiproof_uniform_admin_token');
  if (typeof uniformAdminToken === 'string') {
    localStorage.setItem('physiproof_uniform_admin_token', uniformAdminToken);
  }
  return session.role === 'admin' ? '/admin' : '/dashboard';
}
