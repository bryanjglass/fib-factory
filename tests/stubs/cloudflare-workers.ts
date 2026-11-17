/** Minimal stand-in for the `cloudflare:workers` module so Worker routing can be tested in Node. */
export class DurableObject<Env = unknown> {
  constructor(
    public ctx: unknown,
    public env: Env,
  ) {}
}
