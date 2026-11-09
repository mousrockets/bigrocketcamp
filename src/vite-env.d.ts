/// <reference types="vite/client" />

/** The short commit this build comes from (Workers Builds), or "dev" for a local build. */
declare const __APP_COMMIT__: string;

/** The fingerprint of the code that builds a stored match (scripts/match-build-code.ts), or "test" in the tests. */
declare const __MATCH_BUILD_CODE__: string;
