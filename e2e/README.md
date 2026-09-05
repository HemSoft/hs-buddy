# Browser network fixtures

Run `bun run test:e2e` for the browser project. Its context fixture installs
`github-network.ts` before page scripts run. Known GitHub REST endpoints and
the `ViewerPRs` GraphQL fallback receive deterministic responses. The dashboard's
weather request also receives fixture data. All other external HTTP requests and
WebSockets are blocked and fail the test at teardown with their URLs, even when
the application catches the network error. Diagnostics retain the URL host and
path but redact query values, credentials, and fragments. Popups share the same boundary.

Only the configured Vite origin can reach a server. Browser contexts also use a
dead proxy with a loopback bypass, and block service workers so they cannot evade
interception. Keep mocks specific to the endpoints a test exercises. Unknown
GraphQL operations fail instead of receiving a generic successful response.

For intentional failures, register a test-local `page.route()` that fulfills a
specific endpoint with an error or aborts it. Remove that override to test
recovery. `github-network.spec.ts` exercises the real GitHub client through REST,
GraphQL, 401 responses, network retries, and recovery.

The `electron-cdp` project keeps its existing real connection and preload APIs.
It receives no browser proxy, service-worker restriction, or network fixtures.
