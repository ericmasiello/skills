---
description: Run end to end tests with coverage report and analyze failures.
---

1. Ask the user if they wish to run the tests in interactive mode or headless mode. If they choose headless mode, ask them which tests they want to test. Do not run the entire test suite headlessly.

2. Verify that nothing is running on port 3000. If there is, ask the user if they want to stop it.

3. Start the app. If all the libraries were recently built, you can use `pnpm --filter ./apps/studio start`. If the libraries need to be recompiled, run `pnpm start` in the terminal. Wait for the app to be fully up and running before proceeding. If you're running `pnpm start`, it may take awhile.

4. If they chose interactive mode, open the test suite via `pnpm --filter ./apps/studio cypress-open`. If they chose headless mode, run the tests via `pnpm --filter ./apps/studio cypress-run` and filter the test to the associated test files that the user provides using the `--spec` flag.
