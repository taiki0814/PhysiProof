type AppBridge = { postMessage: (data: string) => void; onmessage: ((event: { data: string }) => void) | null };
declare global { interface Window { FoopeApp?: AppBridge } }

export const androidRequestId = (value: string | null) =>
  value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : null;

export function isAndroidApp() {
  return typeof window !== 'undefined' && (!!window.FoopeApp || !!window.PhysiProofMotion || !!window.PhysiProofHealth
    || /FoopeAndroid\//.test(navigator.userAgent));
}

export function androidLoginReturn(search: string) {
  const id = androidRequestId(new URLSearchParams(search).get('app_request'));
  return id ? '/app-login?request=' + id : null;
}

export async function createAndroidProof() {
  const proof = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof));
  const proof_hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { proof, proof_hash };
}

let installed: AppBridge | undefined;
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export async function openAndroidBrowser(requestId?: string): Promise<void> {
  const bridge = window.FoopeApp;
  if (!bridge) throw new Error('この操作には新しいfoopeアプリと最新のAndroid System WebViewが必要です。');
  if (requestId !== undefined && !androidRequestId(requestId)) throw new Error('ログインをやり直してください。');
  if (installed !== bridge) {
    installed = bridge;
    bridge.onmessage = event => {
      try {
        const reply = JSON.parse(event.data);
        const entry = pending.get(reply.id);
        if (!entry) return;
        clearTimeout(entry.timer); pending.delete(reply.id);
        if (reply.error || reply.data?.opened !== true) entry.reject(new Error('ブラウザーを開けません。端末のブラウザー設定を確認してください。'));
        else entry.resolve();
      } catch { /* Unrecognized replies do not complete an app request. */ }
    };
  }
  const id = crypto.randomUUID();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('ブラウザーを開けませんでした。もう一度お試しください。')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    try { bridge.postMessage(JSON.stringify({ id, command: requestId ? 'signin' : 'website', ...(requestId ? { request_id: requestId } : {}) })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error('アプリと通信できません。アプリを開き直してください。')); }
  });
}
