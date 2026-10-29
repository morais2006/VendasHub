import type { CacheKeyInfo, CacheReadResult, CacheStore } from '../../src/cache/cache-store.js';

/**
 * Dublê do Redis para testes unitários: mesmo contrato, em memória, com TTL
 * controlado por um relógio manual e chave para simular queda.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();
  private readyListeners: Array<() => void> = [];
  now = 0;
  down = false;
  reads = 0;
  writes = 0;

  status(): string {
    return this.down ? 'reconnecting' : 'ready';
  }

  isReady(): boolean {
    return !this.down;
  }

  advance(seconds: number): void {
    this.now += seconds * 1000;
  }

  setDown(down: boolean): void {
    const wasDown = this.down;
    this.down = down;
    if (wasDown && !down) for (const listener of this.readyListeners) listener();
  }

  private alive(key: string) {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.values.delete(key);
      return null;
    }
    return entry;
  }

  private assertUp(): void {
    if (this.down)
      throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
  }

  async read(key: string, generationKey: string): Promise<CacheReadResult> {
    this.assertUp();
    this.reads += 1;
    const entry = this.alive(key);
    const ttl = !entry
      ? -2
      : entry.expiresAt === null
        ? -1
        : Math.ceil((entry.expiresAt - this.now) / 1000);
    return {
      value: entry?.value ?? null,
      ttl,
      generation: this.alive(generationKey)?.value ?? null,
    };
  }

  async write(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.assertUp();
    this.writes += 1;
    this.values.set(key, { value, expiresAt: this.now + ttlSeconds * 1000 });
  }

  async bumpGenerations(generationKeys: readonly string[]): Promise<void> {
    this.assertUp();
    for (const key of generationKeys) {
      const current = Number(this.alive(key)?.value ?? 0);
      this.values.set(key, { value: String(current + 1), expiresAt: null });
    }
  }

  async listKeys(pattern: string): Promise<CacheKeyInfo[]> {
    this.assertUp();
    const prefix = pattern.replace(/\*$/, '');
    return [...this.values.keys()]
      .filter((key) => key.startsWith(prefix) && this.alive(key))
      .map((key) => ({ key, ttl: -1 }));
  }

  async ping(): Promise<number> {
    this.assertUp();
    return 0.1;
  }

  async serverVersion(): Promise<string | null> {
    return 'memory';
  }

  onReady(listener: () => void): void {
    this.readyListeners.push(listener);
  }
}

export const silentLogger = {
  level: 'silent',
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  silent: () => undefined,
  child() {
    return silentLogger;
  },
} as never;
