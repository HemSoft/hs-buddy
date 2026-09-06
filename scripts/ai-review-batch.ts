/** Reconcile independent PRs with bounded API concurrency, continuing after individual failures. */
export async function reconcileBatch(
  numbers: readonly number[],
  reconcile: (number: number) => Promise<void>,
  reportError: (number: number, error: unknown) => void
): Promise<boolean> {
  let next = 0
  let failed = false
  async function worker() {
    for (;;) {
      const number = numbers[next++]
      if (number === undefined) return
      try {
        await reconcile(number)
      } catch (error: unknown) {
        failed = true
        reportError(number, error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, numbers.length) }, worker))
  return failed
}
