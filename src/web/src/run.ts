// Every agent run goes through here: when the month's budget is spent the server refuses, and the
// designer decides whether to run anyway.
export async function withBudget<T>(run: (force?: boolean) => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (e) {
    const msg = (e as Error).message.replace(/^Error: /, '')
    if (!/^Monthly budget reached/.test(msg)) throw e
    if (!confirm(msg)) return undefined
    return run(true)
  }
}

/** "≈ 1 request" style estimate for a run, from what past runs of that agent cost. */
export const estimate = (perRun: Record<string, number> | undefined, stage: string) => {
  const n = perRun?.[stage] ?? 1
  return `≈ ${n} request${n === 1 ? '' : 's'}`
}
