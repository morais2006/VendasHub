import type { Redis } from 'ioredis';

export interface CacheReadResult {
  value: string | null;
  /** Segundos restantes; -2 quando a chave não existe. */
  ttl: number;
  generation: string | null;
}

export interface CacheKeyInfo {
  key: string;
  ttl: number;
}

/** Operações de cache usadas pela aplicação (o Redis real ou um dublê nos testes). */
export interface CacheStore {
  status(): string;
  isReady(): boolean;
  /** Lê valor, TTL e geração numa única ida ao Redis. */
  read(key: string, generationKey: string): Promise<CacheReadResult>;
  write(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Incrementa os contadores de geração (invalidação O(1)). */
  bumpGenerations(generationKeys: readonly string[]): Promise<void>;
  listKeys(pattern: string, limit: number): Promise<CacheKeyInfo[]>;
  ping(): Promise<number>;
  serverVersion(): Promise<string | null>;
  onReady(listener: () => void): void;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export class RedisCacheStore implements CacheStore {
  constructor(private readonly client: Redis) {}

  status(): string {
    return this.client.status;
  }

  isReady(): boolean {
    return this.client.status === 'ready';
  }

  async read(key: string, generationKey: string): Promise<CacheReadResult> {
    const results = await this.client.multi().get(key).ttl(key).get(generationKey).exec();
    if (!results) throw new Error('Transação do Redis abortada');
    for (const [error] of results) if (error) throw error;
    const [value, ttl, generation] = results.map(([, result]) => result);
    return {
      value: (value as string | null) ?? null,
      ttl: Number(ttl),
      generation: (generation as string | null) ?? null,
    };
  }

  async write(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async bumpGenerations(generationKeys: readonly string[]): Promise<void> {
    const pipeline = this.client.multi();
    for (const key of generationKeys) pipeline.incr(key);
    const results = await pipeline.exec();
    if (!results) throw new Error('Transação do Redis abortada');
    for (const [error] of results) if (error) throw error;
  }

  async listKeys(pattern: string, limit: number): Promise<CacheKeyInfo[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== '0' && keys.length < limit);

    const selected = keys.sort().slice(0, limit);
    if (selected.length === 0) return [];
    const pipeline = this.client.pipeline();
    for (const key of selected) pipeline.ttl(key);
    const ttls = (await pipeline.exec()) ?? [];
    return selected.map((key, index) => ({ key, ttl: Number(ttls[index]?.[1] ?? -2) }));
  }

  async ping(): Promise<number> {
    const started = performance.now();
    await this.client.ping();
    return round2(performance.now() - started);
  }

  async serverVersion(): Promise<string | null> {
    const info = await this.client.info('server');
    return /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? null;
  }

  onReady(listener: () => void): void {
    this.client.on('ready', listener);
  }
}
