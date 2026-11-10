// The once-across-all-devices check for printed reward cards. The code has already passed the
// on-device check; the server records it so another device can't use the same card. If the server
// can't be reached, the on-device check alone decides (the card still works offline).
// Only loaded when VITE_MP_URL is set.
import { api, ApiError } from './api.ts';

export async function claimOnce(code: string): Promise<'ok' | 'used' | 'offline'> {
  try {
    await api('/api/redeem', { body: { code } });
    return 'ok';
  } catch (e) {
    return e instanceof ApiError && e.status === 409 ? 'used' : 'offline';
  }
}
