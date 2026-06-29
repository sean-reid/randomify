/**
 * A fixed-size ring buffer of recently seen artist ids. The server is
 * stateless, so the client carries this short history and passes it on each
 * spin to avoid immediate repeats.
 */
export class RecentArtists {
  private readonly ids: string[] = [];

  constructor(private readonly max = 25) {}

  add(id: string): void {
    if (!id) return;
    const existing = this.ids.indexOf(id);
    if (existing !== -1) this.ids.splice(existing, 1);
    this.ids.push(id);
    while (this.ids.length > this.max) this.ids.shift();
  }

  /** Comma-separated value for the `exclude` query parameter. */
  toParam(): string {
    return this.ids.join(',');
  }

  get size(): number {
    return this.ids.length;
  }
}
