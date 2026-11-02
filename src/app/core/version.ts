/**
 * Build details written into index.html at deploy time by
 * scripts/prepare-hosting.mjs. Local runs have none and show "dev".
 */
function meta(name: string): string | null {
  const value = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
  return value && !value.startsWith('__') ? value : null;
}

export const build = {
  /** package.json version, e.g. "0.0.1". */
  version: meta('app-version'),
  /** Pipeline run number; grows with every deployment. Null for manual deploys. */
  number: meta('app-build'),
  /** Full git commit hash. */
  commit: meta('app-commit'),
  /** ISO time of the deployment build. */
  builtAt: meta('app-built'),
  /** Firebase project id, e.g. "generations-uat". */
  project: meta('app-project'),
};

/** Short form for footers, e.g. "v0.1.0 build 42 (75c4bb8)". */
export const appVersion = build.version
  ? `v${build.version}${build.number ? ` build ${build.number}` : ''} (${build.commit?.slice(0, 7)})`
  : 'dev';
