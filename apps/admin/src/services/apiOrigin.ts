/**
 * The deployed Benbax API.
 *
 * Kept in a module of its own, free of `import.meta.env`, so vite.config.ts can
 * import it while Node loads the config — where `import.meta.env` does not
 * exist. Runtime code should read API_ORIGIN from ./config instead, which
 * layers the build-time override on top of this.
 */
export const DEFAULT_API_ORIGIN = 'https://benbax-go.onrender.com';
