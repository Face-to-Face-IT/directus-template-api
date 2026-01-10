interface WaitOptions {
  errorMessage?: string
  interval?: number
  maxAttempts?: number
}

export async function waitFor(
  checkFn: () => Promise<boolean>,
  options: WaitOptions = {},
): Promise<boolean> {
  const {
    errorMessage = 'Operation timed out',
    interval = 2000,
    maxAttempts = 30,
  } = options

  for (let i = 0; i < maxAttempts; i++) {
    // eslint-disable-next-line no-await-in-loop -- Intentional sequential polling
    if (await checkFn()) return true
    // eslint-disable-next-line no-await-in-loop -- Intentional delay between attempts
    await new Promise(resolve => {
      setTimeout(resolve, interval)
    })
  }

  throw new Error(errorMessage)
}
