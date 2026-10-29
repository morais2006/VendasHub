const round2 = (value: number) => Math.round(value * 100) / 100;

export interface LatencySummary {
  name: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number;
}

/**
 * Guarda as últimas N medições de cada operação (janela deslizante) e calcula
 * média e percentis. Os números vêm de performance.now() em cada requisição
 * real; nada é estimado ou simulado.
 */
export class LatencyTracker {
  private readonly samples = new Map<string, number[]>();
  private readonly totals = new Map<string, number>();

  constructor(private readonly window = 200) {}

  record(name: string, durationMs: number): void {
    const list = this.samples.get(name) ?? [];
    list.push(durationMs);
    if (list.length > this.window) list.shift();
    this.samples.set(name, list);
    this.totals.set(name, (this.totals.get(name) ?? 0) + 1);
  }

  summary(name: string): LatencySummary | null {
    const list = this.samples.get(name);
    if (!list || list.length === 0) return null;
    const sorted = [...list].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    return {
      name,
      count: this.totals.get(name) ?? list.length,
      avgMs: round2(list.reduce((sum, value) => sum + value, 0) / list.length),
      p50Ms: round2(pick(0.5)),
      p95Ms: round2(pick(0.95)),
      maxMs: round2(sorted[sorted.length - 1]!),
      lastMs: round2(list[list.length - 1]!),
    };
  }

  all(): LatencySummary[] {
    return [...this.samples.keys()]
      .map((name) => this.summary(name))
      .filter((item): item is LatencySummary => item !== null)
      .sort((a, b) => b.count - a.count);
  }
}
