// Renders the policy documents to HTML for the /privacy, /terms and /security
// pages, so the app always shows the version of the branch it was built from.
// Runs before `npm start` and `npm run build` (prestart/prebuild). Output goes
// to src/generated/legal/ (git-ignored), published as /legal/*.html.
//
// Relative links are rewritten to GitHub URLs on the same branch: `main` for
// production builds, `development` otherwise. APP_REPO_REF overrides it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';

import { Marked } from 'marked';

const REPO = 'https://github.com/deepakdaneva/generations';
const OUT = 'src/generated/legal';
const DOCS = [
  ['docs/PRIVACY.md', 'privacy.html'],
  ['docs/TERMS.md', 'terms.html'],
  ['SECURITY.md', 'security.html'],
];

const ref = process.env.APP_REPO_REF || (process.env.GITHUB_REF_NAME === 'main' ? 'main' : 'development');
if (!/^[\w./-]+$/.test(ref)) throw new Error(`Invalid APP_REPO_REF: ${ref}`);

/** Links between the documents stay in the app; other relative links go to GitHub. */
const IN_APP = Object.fromEntries(DOCS.map(([source, target]) => [source, `/${target.replace('.html', '')}`]));

function rewriteHref(href, source) {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  const [path, hash] = href.split('#');
  const resolved = posix.normalize(posix.join(posix.dirname(source), path));
  if (resolved.startsWith('..')) return '#';
  if (IN_APP[resolved]) return IN_APP[resolved] + (hash ? `#${hash}` : '');
  return `${REPO}/${href.endsWith('/') ? 'tree' : 'blob'}/${ref}/${resolved}${hash ? `#${hash}` : ''}`;
}

mkdirSync(OUT, { recursive: true });
for (const [source, target] of DOCS) {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link') token.href = rewriteHref(token.href, source);
    },
    renderer: {
      // Raw HTML in the markdown is not passed through.
      html: () => '',
      // External links open in a new tab without leaking the opener.
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safe = href.replace(/"/g, '%22');
        return /^(https?:|mailto:)/i.test(href)
          ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : `<a href="${safe}">${text}</a>`;
      },
    },
  });
  writeFileSync(`${OUT}/${target}`, await marked.parse(readFileSync(source, 'utf8')));
}
console.log(`Rendered ${DOCS.length} policy documents into ${OUT} (links to ${ref})`);
