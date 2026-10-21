// Real TOTP enrollment for disposable local Auth tests only. Never accepts hosted credentials.
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
export type LocalTestFactor = { id: string; secret: string };
function assertLocal(origin: string) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Local MFA fixture origin required');
}
export async function enrollLocalTestMfa(client: SupabaseClient, origin: string): Promise<LocalTestFactor> {
  assertLocal(origin);
  const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Disposable CI authenticator' });
  if (result.error || result.data.type !== 'totp') throw new Error('Local test MFA enrollment failed');
  const factor = { id: result.data.id, secret: result.data.totp.secret };
  await verifyLocalTestMfa(client, origin, factor);
  return factor;
}
export async function verifyLocalTestMfa(client: SupabaseClient, origin: string, factor: LocalTestFactor) {
  assertLocal(origin);
  const verify = async () => {
    let bits = '';
    for (const character of factor.secret.toUpperCase().replace(/=+$/, '')) {
      const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
      if (value < 0) throw new Error('Invalid local MFA fixture');
      bits += value.toString(2).padStart(5, '0');
    }
    const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(value => parseInt(value, 2)));
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    return verified;
  };
  let verified = await verify();
  if (verified.error) {
    await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    verified = await verify();
  }
  if (verified.error) throw new Error('Local test MFA verification failed');
}
