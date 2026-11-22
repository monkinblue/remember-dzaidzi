import type { VaultAssetEntry, VaultDescriptor, VaultPayload } from './types';

const STORAGE_KEY = 'rdz_vault_session_v1';

interface StoredVaultSession {
  saltB64: string;
  keyB64: string;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function fetchVaultDescriptor(): Promise<VaultDescriptor> {
  const res = await fetch('/vault/vault.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Archive descriptor unavailable (${res.status})`);
  }
  return (await res.json()) as VaultDescriptor;
}

export async function deriveVaultKey(password: string, descriptor: VaultDescriptor): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error('This browser context does not support Web Crypto decryption (HTTPS or localhost is required).');
  }
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(descriptor.saltB64),
      iterations: descriptor.iterations,
      hash: descriptor.hash,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );
}

export async function exportVaultKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importVaultKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(keyB64), { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

export async function decryptBinary(encryptedBuffer: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  if (encryptedBuffer.byteLength < 29) {
    throw new Error('Encrypted payload is truncated.');
  }
  const bytes = new Uint8Array(encryptedBuffer);
  const iv = bytes.slice(0, 12);
  const ciphertextWithTag = bytes.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertextWithTag);
}

export async function decryptVaultPayload(descriptor: VaultDescriptor, key: CryptoKey): Promise<VaultPayload> {
  const res = await fetch(descriptor.payloadPath, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Archive payload unavailable (${res.status})`);
  }
  const encryptedBuf = await res.arrayBuffer();
  const plainBuf = await decryptBinary(encryptedBuf, key);
  const text = new TextDecoder().decode(plainBuf);
  return JSON.parse(text) as VaultPayload;
}

function readFromStorage(storage: Storage, expectedSaltB64: string): string | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredVaultSession>;
    if (parsed.saltB64 === expectedSaltB64 && typeof parsed.keyB64 === 'string' && parsed.keyB64.length > 0) {
      return parsed.keyB64;
    }
    storage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function getSavedVaultKeyB64(expectedSaltB64: string): string | null {
  return (
    readFromStorage(window.sessionStorage, expectedSaltB64) ??
    readFromStorage(window.localStorage, expectedSaltB64)
  );
}

export function saveVaultKey(saltB64: string, keyB64: string, rememberDevice: boolean): void {
  clearSavedVaultKeys();
  const serialized = JSON.stringify({ saltB64, keyB64 } satisfies StoredVaultSession);
  try {
    if (rememberDevice) {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, serialized);
    }
  } catch {
    // Storage quota or private browsing restrictions should not block in-memory unlock
  }
}

export function clearSavedVaultKeys(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage access failures
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage access failures
  }
}

export class VaultAssetLoader {
  private readonly key: CryptoKey;
  private readonly assets: Record<string, VaultAssetEntry>;
  private readonly urlCache = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly observer: IntersectionObserver | null;
  private disposed = false;

  constructor(key: CryptoKey, assets: Record<string, VaultAssetEntry>) {
    this.key = key;
    this.assets = assets;

    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const img = entry.target as HTMLImageElement;
            this.observer?.unobserve(img);
            void this.loadImageElement(img);
          }
        },
        { rootMargin: '450px 0px' }
      );
    } else {
      this.observer = null;
    }
  }

  getCachedUrl(logicalPath: string): string | undefined {
    return this.urlCache.get(logicalPath);
  }

  async resolveUrl(logicalPath: string): Promise<string> {
    if (this.disposed) {
      throw new Error('Vault session closed.');
    }

    const cached = this.urlCache.get(logicalPath);
    if (cached) return cached;

    const existing = this.inflight.get(logicalPath);
    if (existing) return existing;

    const entry = this.assets[logicalPath];
    if (!entry) {
      throw new Error(`Asset not indexed in vault: ${logicalPath}`);
    }

    const promise = (async () => {
      const res = await fetch(entry.vaultPath);
      if (!res.ok) {
        throw new Error(`Encrypted asset unavailable (${res.status})`);
      }
      const encBuf = await res.arrayBuffer();
      const plainBuf = await decryptBinary(encBuf, this.key);

      const blob = new Blob([plainBuf], { type: entry.mimeType });
      const blobUrl = URL.createObjectURL(blob);

      if (this.disposed) {
        URL.revokeObjectURL(blobUrl);
        throw new Error('Vault session closed.');
      }

      this.urlCache.set(logicalPath, blobUrl);
      return blobUrl;
    })().finally(() => {
      this.inflight.delete(logicalPath);
    });

    this.inflight.set(logicalPath, promise);
    return promise;
  }

  hydrateImages(container: ParentNode): void {
    const imgs = container.querySelectorAll<HTMLImageElement>('img[data-vault-src]');
    imgs.forEach((img) => {
      const logicalPath = img.dataset.vaultSrc;
      if (!logicalPath) return;

      const cached = this.urlCache.get(logicalPath);
      if (cached) {
        img.src = cached;
        img.removeAttribute('data-vault-src');
        img.dataset.vaultLoaded = 'true';
        return;
      }

      if (img.dataset.vaultPriority === 'high' || !this.observer) {
        void this.loadImageElement(img);
      } else {
        this.observer.observe(img);
      }
    });
  }

  private async loadImageElement(img: HTMLImageElement): Promise<void> {
    const logicalPath = img.dataset.vaultSrc;
    if (!logicalPath || this.disposed) return;

    try {
      const url = await this.resolveUrl(logicalPath);
      if (this.disposed || !img.isConnected) return;
      img.src = url;
      img.removeAttribute('data-vault-src');
      img.dataset.vaultLoaded = 'true';
    } catch {
      // Ignore canceled loads when locking archive
    }
  }

  revokeAll(): void {
    this.disposed = true;
    this.observer?.disconnect();
    for (const url of this.urlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlCache.clear();
    this.inflight.clear();
  }
}
