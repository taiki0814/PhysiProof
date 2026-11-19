export interface GoogleIdentityServices {
  initialize: (options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential: string }) => void;
    ux_mode: 'popup';
    auto_select: false;
    itp_support: false;
  }) => void;
  renderButton: (element: HTMLElement, options: {
    type: 'standard';
    theme: 'outline';
    size: 'large';
    text: 'signin_with' | 'continue_with';
    width: number;
    locale: 'ja';
  }) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityServices } };
  }
}

let sdkPromise: Promise<GoogleIdentityServices> | undefined;

export function loadGoogleIdentity(): Promise<GoogleIdentityServices> {
  const identity = window.google?.accounts?.id;
  if (identity) return Promise.resolve(identity);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<GoogleIdentityServices>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    const timer = window.setTimeout(() => fail(), 15000);
    const cleanup = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(new Error('Googleの読み込みに失敗しました。通信環境を確認して再試行してください。'));
    };
    script.onerror = fail;
    script.onload = () => {
      const loaded = window.google?.accounts?.id;
      if (!loaded) { fail(); return; }
      cleanup();
      resolve(loaded);
    };
    document.head.appendChild(script);
  }).catch(error => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

export async function readGoogleResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Googleの認証を完了できませんでした。もう一度お試しください。';
    throw new Error(message);
  }
  return data;
}
