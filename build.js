#!/usr/bin/env node
/* eslint-disable */
// Static site builder for Normalization of Deviance — Sins Against Throughput.
// Reads src/tracks.json + src/lyrics/*.txt + content/* and emits dist/.
// No dependencies. Run: node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');

const data = JSON.parse(fs.readFileSync(path.join(SRC, 'tracks.json'), 'utf8'));
const { album, tracks } = data;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rmDist() {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function readLyrics(slug) {
  const p = path.join(SRC, 'lyrics', `${slug}.txt`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

function renderLyrics(raw) {
  if (!raw) return '<span class="pending">[ Lyrics pending ]</span>';
  if (raw.startsWith('[ Lyrics pending')) {
    return `<span class="pending">${escapeHtml(raw)}</span>`;
  }
  // Highlight section headers like [Verse 1], [Chorus], [Intro]
  return escapeHtml(raw).replace(
    /^\[(.+?)\]/gm,
    (_, label) => `<span class="section">[${label}]</span>`
  );
}

// ---------------------------------------------------------------------------
// asset map: source files in /content -> /dist filenames
// ---------------------------------------------------------------------------
//
// The content/ filenames have human-readable spaces; we rename to slugs in dist.
// If a slug-mapped file isn't present we'll leave the audio src dangling and
// note it in console — the page will still render with a broken player so
// it's obvious what's missing.

const AUDIO_MAP = {
  'stop-the-line': 'Stop the Line (Normalization of Deviance).mp3',
  'no-north-star': 'No North Star (Vacuum of Intent).mp3',
  'coordination-spaghetti': 'Coordination Spaghetti (Communication Complexity).mp3',
  'patched-not-fixed': 'Patched not Fixed (Perpetual Triage).mp3',
  'few-nodes-many-consequences': 'Few Nodes, Many Consequences (Fragility of the Few).mp3',
  'now-now-now': 'Now Now Now (Tyranny of the Urgent).mp3',
  'docs-or-it-didnt-happen': "Docs or it didn't happen (Oral Tradition).mp3",
};

const ART_MAP = {
  'stop-the-line': 'normalization-of-deviance_1800x1800.png',
  'no-north-star': 'vacuum-of-intent_1800x1800.png',
  'coordination-spaghetti': 'communication-complexity_1800x1800.png',
  'patched-not-fixed': 'perpetual-triage_1800x1800.png',
  'few-nodes-many-consequences': 'fragility-of-the-few_1800x1800.png',
  'now-now-now': 'tyranny-of-the-urgent_1800x1800.png',
  'docs-or-it-didnt-happen': 'oral-tradition_1800x1800_exact.png',
};

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

rmDist();

// Copy audio + art with slug-based names
ensureDir(path.join(DIST, 'audio'));
ensureDir(path.join(DIST, 'art'));

for (const t of tracks) {
  const audioSrcName = AUDIO_MAP[t.slug];
  const artSrcName = ART_MAP[t.slug];

  const audioSrc = audioSrcName && path.join(CONTENT, audioSrcName);
  const artSrc = artSrcName && path.join(CONTENT, artSrcName);

  // Prefer pre-compressed art under content/optimized/<slug>.{webp,jpg} if present.
  const optimizedJpg = path.join(CONTENT, 'optimized', `${t.slug}.jpg`);
  const optimizedWebp = path.join(CONTENT, 'optimized', `${t.slug}.webp`);

  if (fs.existsSync(optimizedJpg)) {
    copyFile(optimizedJpg, path.join(DIST, 'art', `${t.slug}.jpg`));
    t._artExt = 'jpg';
  } else if (audioSrc && fs.existsSync(artSrc)) {
    copyFile(artSrc, path.join(DIST, 'art', `${t.slug}.png`));
    t._artExt = 'png';
  } else if (artSrc && fs.existsSync(artSrc)) {
    copyFile(artSrc, path.join(DIST, 'art', `${t.slug}.png`));
    t._artExt = 'png';
  } else {
    console.warn(`[warn] no art for ${t.slug}`);
    t._artExt = 'png';
  }

  if (fs.existsSync(optimizedWebp)) {
    copyFile(optimizedWebp, path.join(DIST, 'art', `${t.slug}.webp`));
    t._hasWebp = true;
  }

  if (audioSrc && fs.existsSync(audioSrc)) {
    copyFile(audioSrc, path.join(DIST, 'audio', `${t.slug}.mp3`));
    t._hasAudio = true;
  } else {
    console.warn(`[warn] no audio for ${t.slug}`);
    t._hasAudio = false;
  }
}

// Banner
const bannerSrc = path.join(CONTENT, 'banner.jpg');
const bannerOptimized = path.join(CONTENT, 'optimized', 'banner.jpg');
if (fs.existsSync(bannerOptimized)) {
  copyFile(bannerOptimized, path.join(DIST, 'banner.jpg'));
} else if (fs.existsSync(bannerSrc)) {
  copyFile(bannerSrc, path.join(DIST, 'banner.jpg'));
}

// CSS
copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));

// Cloudflare Pages _headers (cache directives — enable edge range support for /audio/*)
const headersSrc = path.join(SRC, '_headers');
if (fs.existsSync(headersSrc)) {
  copyFile(headersSrc, path.join(DIST, '_headers'));
}

// robots / sitemap (basic)
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${album.siteUrl}/sitemap.xml\n`
);
const sitemapUrls = [
  album.siteUrl + '/',
  ...tracks.map((t) => `${album.siteUrl}/tracks/${t.slug}/`),
];
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

function head({ title, description, ogImage, canonical }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">

<meta property="og:type" content="music.album">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<meta name="theme-color" content="#0a0a0a">
<link rel="stylesheet" href="/styles.css">
</head>`;
}

function siteHeader() {
  return `<div class="hazard-stripe" aria-hidden="true"></div>
<header class="site-header">
  <div class="site-header__inner">
    <a class="site-header__brand" href="/">
      <span class="dot" aria-hidden="true"></span>
      Normalization of Deviance
    </a>
    <nav class="site-header__nav" aria-label="Primary">
      <a href="/#tracks">Tracks</a>
      <a href="/#sins">Sins</a>
      <a href="${escapeHtml(album.blogUrl)}" rel="noopener">Essay</a>
      <a href="mailto:${escapeHtml(album.contactEmail)}">Contact</a>
    </nav>
  </div>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <div class="site-footer__inner">
    <div>
      <span class="label">Disclosure</span>
      <p class="disclosure">${escapeHtml(album.disclosure)}</p>
      <p style="margin-top:14px"><a href="${escapeHtml(album.blogUrl)}" rel="noopener">${escapeHtml(album.blogLabel)} →</a></p>
    </div>
    <div>
      <span class="label">Contact</span>
      <p><a href="mailto:${escapeHtml(album.contactEmail)}">${escapeHtml(album.contactEmail)}</a></p>
      <p style="margin-top:14px; color: var(--ink-dim);">© ${new Date().getFullYear()} Normalization of Deviance.<br>All rights pulled.</p>
    </div>
  </div>
</footer>`;
}

function trackCard(t) {
  const lyrics = renderLyrics(readLyrics(t.slug));
  const artSrc = `/art/${t.slug}.${t._artExt}`;
  const audioSrc = `/audio/${t.slug}.mp3`;
  const audioBlock = t._hasAudio
    ? `<audio controls preload="none" src="${audioSrc}"></audio>`
    : `<p style="color: var(--ink-dim); font-family: var(--mono); font-size: 13px; margin: 0 0 14px;">[ Audio pending ]</p>`;

  const downloadBtn = t._hasAudio
    ? `<a class="btn btn--primary" href="${audioSrc}" download>↓ MP3</a>`
    : '';

  return `<article class="track-card" id="${escapeHtml(t.slug)}">
  <a class="track-card__art" href="/tracks/${escapeHtml(t.slug)}/" aria-label="${escapeHtml(t.title)} — open track page">
    <span class="badge">TRK ${String(t.n).padStart(2, '0')}</span>
    <img src="${artSrc}" alt="${escapeHtml(t.title)} cover art" loading="lazy" width="800" height="800">
  </a>
  <div class="track-card__body">
    <div class="track-card__meta">
      <span class="sin-num">SIN ${t.sinNumber}</span>
      ${escapeHtml(t.sin)}
    </div>
    <h2><a href="/tracks/${escapeHtml(t.slug)}/">${escapeHtml(t.title)}</a></h2>
    <p class="oneliner">${escapeHtml(t.oneliner)}</p>
    ${audioBlock}
    <div class="actions">
      <button type="button" class="btn btn--lyrics" aria-expanded="false" aria-controls="lyrics-${escapeHtml(t.slug)}" data-toggle="lyrics">▸ Lyrics</button>
      <a class="btn" href="/tracks/${escapeHtml(t.slug)}/">Track page →</a>
      ${downloadBtn}
    </div>
    <pre class="lyrics" id="lyrics-${escapeHtml(t.slug)}" aria-hidden="true">${lyrics}</pre>
  </div>
</article>`;
}

function indexHtml() {
  const ogImage = `${album.siteUrl}/banner.jpg`;
  const description = `${album.title} — a seven-track concept EP about the operational sins that kill throughput. ${album.tagline}`;
  return `${head({
    title: `${album.band} — ${album.title}`,
    description,
    ogImage,
    canonical: album.siteUrl + '/',
  })}
<body>
${siteHeader()}

<section class="banner" aria-label="Normalization of Deviance">
  <img src="/banner.jpg" alt="Normalization of Deviance" width="2400" height="1200">
</section>

<div class="hazard-stripe" aria-hidden="true"></div>

<section class="hero" aria-label="Album">
  <span class="placard">// CAUTION // EP 01 //</span>
  <h1 class="hero__album">Sins Against<br>Throughput</h1>
  <p class="hero__tagline">${escapeHtml(album.tagline)}</p>
  <p class="hero__sub">Seven tracks. Seven failure modes that quietly murder flow inside otherwise functional organizations. Hit play. Pull the cord.</p>
  <aside class="hero__legend">
    <span class="label">Operating Manual</span>
    Each track is one sin. Click a cover or title for the full incident report — lyrics, art, and the operational pattern in plain English. MP3 downloads on every track.
  </aside>
</section>

<section class="sins" id="sins" aria-label="The Seven Sins Against Throughput">
  <h2 class="sins__title">Field Manual: The Seven Sins Against Throughput</h2>
  <div class="sins__grid">
${tracks
  .slice()
  .sort((a, b) => a.sinNumber - b.sinNumber)
  .map(
    (t) => `    <div class="sin-entry">
      <div class="sin-entry__num">${t.sinNumber}</div>
      <div class="sin-entry__body">
        <h3>${escapeHtml(t.sin)}</h3>
        <p>${escapeHtml(t.description)}</p>
        <a class="sin-entry__link" href="/tracks/${escapeHtml(t.slug)}/">${escapeHtml(t.title)}</a>
      </div>
    </div>`
  )
  .join('\n')}
  </div>
</section>

<main class="tracks" id="tracks" aria-label="Tracks">
${tracks.map(trackCard).join('\n')}
</main>

${siteFooter()}

<script>
document.querySelectorAll('[data-toggle="lyrics"]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var id = btn.getAttribute('aria-controls');
    var pre = document.getElementById(id);
    var open = pre.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    pre.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.firstChild.nodeValue = open ? '▾ Lyrics' : '▸ Lyrics';
  });
});
</script>
</body>
</html>
`;
}

function trackPageHtml(t, idx) {
  const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
  const next = tracks[(idx + 1) % tracks.length];
  const ogImage = `${album.siteUrl}/art/${t.slug}.${t._artExt}`;
  const canonical = `${album.siteUrl}/tracks/${t.slug}/`;
  const lyrics = renderLyrics(readLyrics(t.slug));
  const artSrc = `/art/${t.slug}.${t._artExt}`;
  const audioSrc = `/audio/${t.slug}.mp3`;
  const audioBlock = t._hasAudio
    ? `<audio controls preload="metadata" src="${audioSrc}"></audio>
       <div class="actions" style="font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; display:flex; gap:10px;">
         <a class="btn btn--primary" href="${audioSrc}" download>↓ Download MP3</a>
         <a class="btn" href="/#${t.slug}">All tracks</a>
       </div>`
    : `<p style="color: var(--ink-dim); font-family: var(--mono); font-size: 13px;">[ Audio pending ]</p>
       <div class="actions" style="font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; display:flex; gap:10px;">
         <a class="btn" href="/#${t.slug}">All tracks</a>
       </div>`;

  return `${head({
    title: `${t.title} — ${album.band}`,
    description: t.oneliner,
    ogImage,
    canonical,
  })}
<body>
${siteHeader()}

<article class="track-page">
  <nav class="breadcrumbs"><a href="/">Album</a> &nbsp;/&nbsp; Track ${String(t.n).padStart(2, '0')}</nav>

  <section class="track-hero">
    <div class="track-hero__art">
      <img src="${artSrc}" alt="${escapeHtml(t.title)} cover art" width="1800" height="1800">
    </div>
    <div>
      <div class="track-hero__meta">
        <span class="sin-num">SIN ${t.sinNumber}</span> Track ${String(t.n).padStart(2, '0')}
      </div>
      <h1>${escapeHtml(t.title)}</h1>
      <span class="sin-name">${escapeHtml(t.sin)}</span>
      <p class="description">${escapeHtml(t.description)}</p>
      ${audioBlock}
    </div>
  </section>

  <section class="track-lyrics" aria-label="Lyrics">
    <h2>// LYRICS</h2>
    <pre>${lyrics}</pre>
  </section>

  <nav class="track-nav" aria-label="Track navigation">
    <a href="/tracks/${escapeHtml(prev.slug)}/"><span class="arrow">←</span> ${escapeHtml(prev.title)}</a>
    <a href="/tracks/${escapeHtml(next.slug)}/">${escapeHtml(next.title)} <span class="arrow">→</span></a>
  </nav>
</article>

${siteFooter()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml());

tracks.forEach((t, i) => {
  const dir = path.join(DIST, 'tracks', t.slug);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), trackPageHtml(t, i));
});

console.log(`✓ Built ${tracks.length} track pages + index → dist/`);
console.log(`  Audio: ${tracks.filter((t) => t._hasAudio).length}/${tracks.length}`);
console.log(`  Art:   ${tracks.filter((t) => t._artExt).length}/${tracks.length}`);
