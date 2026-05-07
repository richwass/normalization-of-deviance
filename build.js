#!/usr/bin/env node
/* eslint-disable */
// Static site builder for Normalization of Deviance.
// Multi-album: reads src/tracks.json (with albums[]) + src/lyrics/*.txt
// + content/* and emits dist/.
// No dependencies. Run: node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');

const data = JSON.parse(fs.readFileSync(path.join(SRC, 'tracks.json'), 'utf8'));
const { site, band, albums } = data;

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

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

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
  return escapeHtml(raw).replace(
    /^\[(.+?)\]/gm,
    (_, label) => `<span class="section">[${label}]</span>`
  );
}

// ---------------------------------------------------------------------------
// asset resolver — single source of truth for audio + art lookup
// ---------------------------------------------------------------------------

function resolveAsset({ slug, audioSource, artSource, optimizedSlug }) {
  const result = { audio: null, art: null };
  const lookupSlug = optimizedSlug || slug;

  if (audioSource) {
    const audioPath = path.join(CONTENT, audioSource);
    if (fs.existsSync(audioPath)) {
      result.audio = { path: audioPath };
    } else {
      console.warn(`[warn] no audio for ${slug} (looked for ${audioSource})`);
    }
  }

  // Prefer optimized JPG named by slug; fall back to raw artSource if present.
  const optimizedJpg = path.join(CONTENT, 'optimized', `${lookupSlug}.jpg`);
  if (fs.existsSync(optimizedJpg)) {
    result.art = { path: optimizedJpg, ext: 'jpg' };
  } else if (artSource) {
    const artPath = path.join(CONTENT, artSource);
    if (fs.existsSync(artPath)) {
      const ext = path.extname(artPath).slice(1).toLowerCase() || 'png';
      result.art = { path: artPath, ext };
    }
  }
  if (!result.art) console.warn(`[warn] no art for ${slug}`);

  return result;
}

// ---------------------------------------------------------------------------
// build: copy assets, then emit HTML
// ---------------------------------------------------------------------------

rmDist();
ensureDir(path.join(DIST, 'audio'));
ensureDir(path.join(DIST, 'art'));

// Walk all albums + tracks + alts; copy assets and stash resolved paths on
// the in-memory objects so templates can reference them later.
let totalTracks = 0;
let totalAlts = 0;
const allAlternates = [];

for (const album of albums) {
  // Album cover (Full Kit Rock has one; Sins Against Throughput uses the band banner).
  if (album.albumArtSource) {
    const albumArt = resolveAsset({
      slug: `${album.slug}-album`,
      artSource: album.albumArtSource,
      optimizedSlug: `${album.slug}-album`,
    });
    if (albumArt.art) {
      const dest = path.join(DIST, 'art', `${album.slug}.${albumArt.art.ext}`);
      copyFile(albumArt.art.path, dest);
      album._albumArt = `/art/${album.slug}.${albumArt.art.ext}`;
      album._albumArtAbsoluteW = 1000;
      album._albumArtAbsoluteH = 1000;
    }
  }

  for (const t of album.tracks) {
    totalTracks++;
    const resolved = resolveAsset({
      slug: t.slug,
      audioSource: t.audioSource,
      artSource: t.artSource,
    });
    if (resolved.audio) {
      copyFile(resolved.audio.path, path.join(DIST, 'audio', `${t.slug}.mp3`));
      t._hasAudio = true;
    } else {
      t._hasAudio = false;
    }
    if (resolved.art) {
      copyFile(resolved.art.path, path.join(DIST, 'art', `${t.slug}.${resolved.art.ext}`));
      t._artExt = resolved.art.ext;
    } else {
      t._artExt = 'jpg';
    }
    t._album = album;

    if (Array.isArray(t.alternateVersions)) {
      for (const alt of t.alternateVersions) {
        const altSlug = `${t.slug}-${alt.slug}`;
        const altResolved = resolveAsset({
          slug: altSlug,
          audioSource: alt.audioSource,
          artSource: alt.artSource,
        });
        if (altResolved.audio) {
          copyFile(altResolved.audio.path, path.join(DIST, 'audio', `${altSlug}.mp3`));
          alt._hasAudio = true;
        } else {
          alt._hasAudio = false;
        }
        if (altResolved.art) {
          copyFile(altResolved.art.path, path.join(DIST, 'art', `${altSlug}.${altResolved.art.ext}`));
          alt._artExt = altResolved.art.ext;
        } else {
          alt._artExt = 'jpg';
        }
        alt._fullSlug = altSlug;
        alt._parent = t;
        alt._album = album;
        allAlternates.push(alt);
        totalAlts++;
      }
    }
  }
}

// Static site assets
const bannerOptimized = path.join(CONTENT, 'optimized', 'banner.jpg');
const bannerRaw = path.join(CONTENT, 'banner.jpg');
if (fs.existsSync(bannerOptimized)) copyFile(bannerOptimized, path.join(DIST, 'banner.jpg'));
else if (fs.existsSync(bannerRaw)) copyFile(bannerRaw, path.join(DIST, 'banner.jpg'));

const ogCard = path.join(CONTENT, 'optimized', 'og.jpg');
if (fs.existsSync(ogCard)) copyFile(ogCard, path.join(DIST, 'og.jpg'));

copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
const headersSrc = path.join(SRC, '_headers');
if (fs.existsSync(headersSrc)) copyFile(headersSrc, path.join(DIST, '_headers'));

// robots / sitemap
const allUrls = [site.siteUrl + '/'];
for (const album of albums) {
  allUrls.push(`${site.siteUrl}/albums/${album.slug}/`);
  for (const t of album.tracks) {
    allUrls.push(`${site.siteUrl}/tracks/${t.slug}/`);
    if (Array.isArray(t.alternateVersions)) {
      for (const alt of t.alternateVersions) {
        allUrls.push(`${site.siteUrl}/tracks/${t.slug}/${alt.slug}/`);
      }
    }
  }
}
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}/sitemap.xml\n`
);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

function head({ title, description, ogImage, ogImageW, ogImageH, ogImageAlt, canonical, bodyClass }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">

<meta property="og:type" content="music.album">
<meta property="og:site_name" content="Normalization of Deviance">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:secure_url" content="${escapeHtml(ogImage)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${ogImageW}">
<meta property="og:image:height" content="${ogImageH}">
<meta property="og:image:alt" content="${escapeHtml(ogImageAlt || title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:image:alt" content="${escapeHtml(ogImageAlt || title)}">

<meta name="theme-color" content="#0a0a0a">
<link rel="stylesheet" href="/styles.css">
</head>${bodyClass ? `\n<body class="${bodyClass}">` : '\n<body>'}`;
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
      <a href="/#releases">Releases</a>
      <a href="${escapeHtml(site.blogUrl)}" rel="noopener">Essay</a>
      <a href="mailto:${escapeHtml(site.contactEmail)}">Contact</a>
    </nav>
  </div>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <div class="site-footer__inner">
    <div>
      <span class="label">Disclosure</span>
      <p class="disclosure">${escapeHtml(site.disclosure)}</p>
      <p style="margin-top:14px"><a href="${escapeHtml(site.blogUrl)}" rel="noopener">${escapeHtml(site.blogLabel)} →</a></p>
    </div>
    <div>
      <span class="label">Contact</span>
      <p><a href="mailto:${escapeHtml(site.contactEmail)}">${escapeHtml(site.contactEmail)}</a></p>
      <p style="margin-top:14px; color: var(--ink-dim);">© ${new Date().getFullYear()} Normalization of Deviance.<br>All rights pulled.</p>
    </div>
  </div>
</footer>`;
}

// Track card (used on album pages and homepage). Aesthetic variant via parent class.
function trackCard(album, t) {
  const lyrics = renderLyrics(readLyrics(t.slug));
  const artSrc = `/art/${t.slug}.${t._artExt}`;
  const audioSrc = `/audio/${t.slug}.mp3`;
  const audioBlock = t._hasAudio
    ? `<audio controls preload="none" src="${audioSrc}"></audio>`
    : `<p class="audio-pending">[ Audio pending ]</p>`;
  const downloadBtn = t._hasAudio
    ? `<a class="btn btn--primary" href="${audioSrc}" download>↓ MP3</a>`
    : '';

  // Sins Against Throughput shows sin metadata; Full Kit Rock shows track number framing.
  const meta = album.aesthetic === 'industrial' && t.sin
    ? `<span class="sin-num">SIN ${t.sinNumber}</span> ${escapeHtml(t.sin)}`
    : `<span class="track-num">TRACK ${String(t.n).padStart(2, '0')}${t.isBonus ? ' • BONUS' : ''}</span>`;

  const altPills = Array.isArray(t.alternateVersions) && t.alternateVersions.length
    ? t.alternateVersions
        .map(
          (alt) => `<a class="alt-pill" href="/tracks/${escapeHtml(t.slug)}/${escapeHtml(alt.slug)}/" title="${escapeHtml(alt.byline)}"><span class="alt-pill__prefix">ALSO:</span> ${escapeHtml(alt.version)} <span class="alt-pill__arrow" aria-hidden="true">→</span></a>`
        )
        .join('')
    : '';

  const subtitleHtml = t.subtitle
    ? ` <span class="track-card__subtitle">${escapeHtml(t.subtitle)}</span>`
    : '';

  return `<article class="track-card${altPills ? ' has-alt' : ''}${t.isBonus ? ' is-bonus' : ''}" id="${escapeHtml(t.slug)}">
  <a class="track-card__art" href="/tracks/${escapeHtml(t.slug)}/" aria-label="${escapeHtml(t.title)} — open track page">
    <span class="badge">${t.isBonus ? 'BONUS' : `TRK ${String(t.n).padStart(2, '0')}`}</span>
    <img src="${artSrc}" alt="${escapeHtml(t.title)} cover art" loading="lazy" width="800" height="800">
  </a>
  <div class="track-card__body">
    <div class="track-card__meta">${meta}</div>
    <h2><a href="/tracks/${escapeHtml(t.slug)}/">${escapeHtml(t.title)}${subtitleHtml}</a></h2>
    ${altPills ? `<div class="track-card__alt-line">${altPills}</div>` : ''}
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

function lyricsToggleScript() {
  return `<script>
document.querySelectorAll('[data-toggle="lyrics"]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var id = btn.getAttribute('aria-controls');
    var pre = document.getElementById(id);
    var open = pre.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    pre.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.textContent = open ? '▾ Lyrics' : '▸ Lyrics';
  });
});
</script>`;
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

function homeHtml() {
  const ogImage = `${site.siteUrl}/og.jpg`;
  const description = `${band.tagline} Latest release: ${albums.find((a) => a.isLatest).title}.`;

  // Order albums for display: latest first, then by reverse n.
  const ordered = [...albums].sort((a, b) => {
    if (a.isLatest && !b.isLatest) return -1;
    if (!a.isLatest && b.isLatest) return 1;
    return (b.n || 0) - (a.n || 0);
  });
  const latest = ordered[0];
  const rest = ordered.slice(1);

  return `${head({
    title: `Normalization of Deviance — ${band.tagline}`,
    description,
    ogImage,
    ogImageW: 1200,
    ogImageH: 630,
    ogImageAlt: 'Normalization of Deviance — Sins Against Throughput',
    canonical: site.siteUrl + '/',
  })}
${siteHeader()}

<section class="banner" aria-label="Normalization of Deviance">
  <img src="/banner.jpg" alt="Normalization of Deviance" width="2400" height="1200">
</section>

<div class="hazard-stripe" aria-hidden="true"></div>

<section class="band-intro" aria-label="About">
  <p class="band-intro__tagline">${escapeHtml(band.tagline)}</p>
  <p class="band-intro__sub">Two records and a side-project EP. Industrial punk, Schoolhouse cowpunk, and a country alter-ego. Hit play. Pull the cord.</p>
</section>

<section class="releases" id="releases" aria-label="Releases">
  <h2 class="releases__title">// RELEASES</h2>

  <article class="release release--featured" data-aesthetic="${escapeHtml(latest.aesthetic)}">
    <div class="release__art">
      <a href="/albums/${escapeHtml(latest.slug)}/">
        <span class="release__badge">NEW RELEASE</span>
        <img src="${escapeHtml(latest._albumArt || '/banner.jpg')}" alt="${escapeHtml(latest.title)} album cover" loading="lazy">
      </a>
    </div>
    <div class="release__body">
      <div class="release__kicker">// ALBUM ${String(latest.n).padStart(2, '0')} • ${escapeHtml(String(latest.year))}</div>
      <h3 class="release__title"><a href="/albums/${escapeHtml(latest.slug)}/">${escapeHtml(latest.title)}</a></h3>
      <p class="release__subtitle">${escapeHtml(latest.subtitle)}</p>
      <p class="release__tagline">${escapeHtml(latest.tagline)}</p>
      <p class="release__description">${escapeHtml(latest.description)}</p>
      <div class="release__meta"><strong>${latest.tracks.length} tracks</strong></div>
      <div class="release__actions">
        <a class="btn btn--primary" href="/albums/${escapeHtml(latest.slug)}/">Open album →</a>
        <a class="btn" href="/tracks/${escapeHtml(latest.tracks[0].slug)}/">Start at track 01</a>
      </div>
    </div>
  </article>

  ${rest
    .map(
      (a) => `<article class="release" data-aesthetic="${escapeHtml(a.aesthetic)}">
    <div class="release__art">
      <a href="/albums/${escapeHtml(a.slug)}/">
        <img src="${escapeHtml(a._albumArt || '/banner.jpg')}" alt="${escapeHtml(a.title)} cover" loading="lazy">
      </a>
    </div>
    <div class="release__body">
      <div class="release__kicker">// ALBUM ${String(a.n).padStart(2, '0')} • ${escapeHtml(String(a.year))}</div>
      <h3 class="release__title"><a href="/albums/${escapeHtml(a.slug)}/">${escapeHtml(a.title)}</a></h3>
      <p class="release__subtitle">${escapeHtml(a.subtitle)}</p>
      <p class="release__tagline">${escapeHtml(a.tagline)}</p>
      <p class="release__description">${escapeHtml(a.description)}</p>
      <div class="release__meta">${a.tracks.length} tracks</div>
      <div class="release__actions">
        <a class="btn" href="/albums/${escapeHtml(a.slug)}/">Open album →</a>
      </div>
    </div>
  </article>`
    )
    .join('\n')}
</section>

${allAlternates.length ? bsidesSection() : ''}

${siteFooter()}

${lyricsToggleScript()}
</body>
</html>
`;
}

function bsidesSection() {
  const cards = allAlternates
    .map((alt) => {
      const t = alt._parent;
      const altSlug = alt._fullSlug;
      const trackUrl = `/tracks/${t.slug}/${alt.slug}/`;
      const artSrc = `/art/${altSlug}.${alt._artExt}`;
      const audioSrc = `/audio/${altSlug}.mp3`;
      const audioBlock = alt._hasAudio
        ? `<audio controls preload="none" src="${audioSrc}"></audio>`
        : `<p class="audio-pending">[ Audio pending ]</p>`;
      return `<article class="bside-card">
  <a class="bside-card__art" href="${trackUrl}" aria-label="${escapeHtml(t.title)} — ${escapeHtml(alt.version)}">
    <span class="bside-badge">ALT // ROADHOUSE</span>
    <img src="${artSrc}" alt="${escapeHtml(t.title)} — ${escapeHtml(alt.version)} cover art" loading="lazy" width="800" height="800">
  </a>
  <div class="bside-card__body">
    <div class="bside-card__meta">${escapeHtml(alt.byline)}</div>
    <h3><a href="${trackUrl}">${escapeHtml(t.title)}</a> <span class="version-tag">/ ${escapeHtml(alt.version)}</span></h3>
    <p class="oneliner">${escapeHtml(alt.oneliner)}</p>
    ${audioBlock}
    <div class="actions">
      <a class="btn btn--whiskey" href="${trackUrl}">Track page →</a>
      <a class="btn" href="/tracks/${t.slug}/">Original →</a>
    </div>
  </div>
</article>`;
    })
    .join('\n');

  return `<section class="bsides" id="bsides" aria-label="B-sides">
  <header class="bsides__header">
    <span class="bsides__kicker">// B-SIDES // ALTER EGO — THROUGHPUT MOJO</span>
    <h2 class="bsides__title">Bottleneck Saloon</h2>
    <p class="bsides__lede">When the rockers put down the andon cord and pick up a Telecaster. Cowpunk reinterpretations by the band's alter ego, <strong>Throughput Mojo</strong>. Same lyrics. Cold beer. So many avoidable regrets.</p>
  </header>
  <div class="bsides__grid">
    ${cards}
  </div>
</section>`;
}

function albumHtml(album) {
  const ogImage = album._albumArt
    ? `${site.siteUrl}${album._albumArt}`
    : `${site.siteUrl}/og.jpg`;
  const canonical = `${site.siteUrl}/albums/${album.slug}/`;
  const description = `${album.title} — ${album.tagline}`;

  // Specialized: industrial (Sins) vs WPA (Full Kit Rock)
  const isWpa = album.aesthetic === 'wpa';
  const bodyClass = isWpa ? 'album-page album-page--wpa' : 'album-page album-page--industrial';

  return `${head({
    title: `${album.title} — Normalization of Deviance`,
    description,
    ogImage,
    ogImageW: 1200,
    ogImageH: 630,
    ogImageAlt: `${album.title} album cover`,
    canonical,
    bodyClass,
  })}
${siteHeader()}

${isWpa ? wpaAlbumHero(album) : industrialAlbumHero(album)}

${isWpa && album.linerNotes ? wpaLinerNotes(album) : ''}
${!isWpa ? sinsFieldManual(album) : ''}

<main class="tracks ${isWpa ? 'tracks--wpa' : ''}" id="tracks" aria-label="Tracks">
${album.tracks.map((t) => trackCard(album, t)).join('\n')}
</main>

${isWpa && album.books ? wpaBooks(album) : ''}

${siteFooter()}

${lyricsToggleScript()}
</body>
</html>
`;
}

function wpaAlbumHero(album) {
  return `<section class="wpa-hero" aria-label="${escapeHtml(album.title)}">
  <div class="wpa-hero__inner">
    <div class="wpa-hero__art">
      <img src="${escapeHtml(album._albumArt)}" alt="${escapeHtml(album.title)} album cover" width="1000" height="1000">
    </div>
    <div class="wpa-hero__body">
      <div class="wpa-hero__kicker">A NORMALIZATION OF DEVIANCE RECORD</div>
      <h1 class="wpa-hero__title">${escapeHtml(album.title)}</h1>
      <p class="wpa-hero__subtitle">${escapeHtml(album.subtitle)}</p>
      <p class="wpa-hero__tagline">${escapeHtml(album.tagline)}</p>
      <p class="wpa-hero__description">${escapeHtml(album.description)}</p>
      <div class="wpa-hero__meta">${album.tracks.length} tracks · ${album.year}</div>
      <div class="wpa-hero__actions">
        <a class="wpa-btn wpa-btn--primary" href="#tracks">▸ Listen Now</a>
        <a class="wpa-btn" href="/">← All releases</a>
      </div>
    </div>
  </div>
</section>`;
}

function wpaLinerNotes(album) {
  const items = album.linerNotes
    .map((n) => {
      const t = album.tracks.find((tr) => tr.slug === n.trackSlug);
      if (!t) return '';
      return `<li class="wpa-rule">
        <span class="wpa-rule__num">TRACK ${String(t.n).padStart(2, '0')}${t.isBonus ? ' • BONUS' : ''}</span>
        <a class="wpa-rule__name" href="/tracks/${escapeHtml(t.slug)}/">${escapeHtml(t.title)}</a>
        <span class="wpa-rule__track">${escapeHtml(n.concept)}</span>
      </li>`;
    })
    .join('\n');
  return `<section class="wpa-notes" aria-label="Liner Notes">
  <header class="wpa-notes__header">
    <span class="wpa-notes__kicker">// SCHOOLHOUSE NOTES</span>
    <h2 class="wpa-notes__title">Liner Notes</h2>
    <p class="wpa-notes__lede">Eleven tracks. Goldratt's <em>Rules of Flow</em> on the chorus, <em>Critical Chain</em> on the bridge. Find the bottleneck. Strengthen the chain. Don't optimise the wrong link.</p>
  </header>
  <ol class="wpa-rules">${items}</ol>
</section>`;
}

function wpaBooks(album) {
  const essayBlock = album.essay
    ? `<div class="wpa-essay">
      <span class="wpa-essay__kicker">Liner Essay</span>
      <a class="wpa-essay__link" href="${escapeHtml(album.essay.url)}" rel="noopener" target="_blank">
        <span class="wpa-essay__title">${escapeHtml(album.essay.title)}</span>
        <span class="wpa-essay__cta">${escapeHtml(album.essay.label)} →</span>
      </a>
    </div>`
    : '';
  return `<section class="wpa-books" aria-label="Source material">
  <h2 class="wpa-books__title">// SOURCE MATERIAL</h2>
  <p class="wpa-books__lede">The album draws on two of Eli Goldratt's books. If you want the full theory behind the chorus, start here.</p>
  ${essayBlock}
  <ul class="wpa-books__list">
    ${album.books
      .map(
        (b) => `<li class="wpa-book">
      <span class="wpa-book__year">${b.year}</span>
      <a class="wpa-book__title" href="${escapeHtml(b.url)}" rel="noopener" target="_blank">${escapeHtml(b.title)}</a>
      <span class="wpa-book__author">by ${escapeHtml(b.author)}</span>
    </li>`
      )
      .join('\n')}
  </ul>
</section>`;
}

function industrialAlbumHero(album) {
  const cover = album._albumArt || '/banner.jpg';
  return `<section class="ind-hero" aria-label="${escapeHtml(album.title)}">
  <div class="ind-hero__inner">
    <div class="ind-hero__art">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(album.title)} album cover" width="1000" height="1000">
    </div>
    <div class="ind-hero__body">
      <span class="placard">// EP 01 // ${album.year} //</span>
      <h1 class="hero__album">Sins Against<br>Throughput</h1>
      <p class="hero__tagline">${escapeHtml(album.tagline)}</p>
      <p class="hero__sub">${escapeHtml(album.description)}</p>
      <div class="ind-hero__actions">
        <a class="btn btn--primary" href="#tracks">▸ Listen Now</a>
        <a class="btn" href="/">← All releases</a>
      </div>
    </div>
  </div>
</section>`;
}

function sinsFieldManual(album) {
  const sortedSins = [...album.tracks].sort((a, b) => a.sinNumber - b.sinNumber);
  return `<section class="sins" id="sins" aria-label="The Seven Sins Against Throughput">
  <h2 class="sins__title">Field Manual: The Seven Sins Against Throughput</h2>
  <div class="sins__grid">
${sortedSins
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
</section>`;
}

function trackPageHtml(album, t, idx) {
  const albumTracks = album.tracks;
  const prev = albumTracks[(idx - 1 + albumTracks.length) % albumTracks.length];
  const next = albumTracks[(idx + 1) % albumTracks.length];
  const ogImage = `${site.siteUrl}/art/${t.slug}.${t._artExt}`;
  const canonical = `${site.siteUrl}/tracks/${t.slug}/`;
  const lyrics = renderLyrics(readLyrics(t.slug));
  const artSrc = `/art/${t.slug}.${t._artExt}`;
  const audioSrc = `/audio/${t.slug}.mp3`;
  const isWpa = album.aesthetic === 'wpa';

  const audioBlock = t._hasAudio
    ? `<audio controls preload="metadata" src="${audioSrc}"></audio>
       <div class="actions actions--mono">
         <a class="btn btn--primary" href="${audioSrc}" download>↓ Download MP3</a>
         <a class="btn" href="/albums/${album.slug}/#${t.slug}">← Back to album</a>
       </div>`
    : `<p class="audio-pending">[ Audio pending ]</p>
       <div class="actions actions--mono">
         <a class="btn" href="/albums/${album.slug}/#${t.slug}">← Back to album</a>
       </div>`;

  const altCallout = Array.isArray(t.alternateVersions) && t.alternateVersions.length
    ? `<section class="alt-versions" aria-label="Alternate versions">
    <h2 class="alt-versions__title">// OTHER VERSIONS</h2>
    <div class="alt-versions__grid">
      ${t.alternateVersions
        .map((alt) => {
          const altSlug = alt._fullSlug;
          const altUrl = `/tracks/${t.slug}/${alt.slug}/`;
          return `<a class="alt-version-card" href="${altUrl}">
        <div class="alt-version-card__art">
          <img src="/art/${altSlug}.${alt._artExt}" alt="${escapeHtml(alt.version)} cover art" loading="lazy">
        </div>
        <div class="alt-version-card__body">
          <span class="alt-badge">ALT // ROADHOUSE</span>
          <div class="alt-version-card__name">${escapeHtml(alt.version)}</div>
          <div class="alt-version-card__byline">${escapeHtml(alt.byline)}</div>
          <p class="alt-version-card__oneliner">${escapeHtml(alt.oneliner)}</p>
        </div>
      </a>`;
        })
        .join('')}
    </div>
  </section>`
    : '';

  const meta = isWpa
    ? `<span class="track-num">TRACK ${String(t.n).padStart(2, '0')}${t.isBonus ? ' • BONUS' : ''}</span>`
    : `<span class="sin-num">SIN ${t.sinNumber}</span> Track ${String(t.n).padStart(2, '0')}`;

  const sinTag = !isWpa && t.sin
    ? `<span class="sin-name">${escapeHtml(t.sin)}</span>`
    : t.subtitle
      ? `<span class="track-subtitle">${escapeHtml(t.subtitle)}</span>`
      : '';

  return `${head({
    title: `${t.title} — ${album.title}`,
    description: t.oneliner,
    ogImage,
    ogImageW: 1000,
    ogImageH: 1000,
    ogImageAlt: `${t.title} cover art`,
    canonical,
    bodyClass: isWpa ? 'track-page-body track-page-body--wpa' : 'track-page-body track-page-body--industrial',
  })}
${siteHeader()}

<article class="track-page">
  <nav class="breadcrumbs">
    <a href="/">Album</a> &nbsp;/&nbsp;
    <a href="/albums/${album.slug}/">${escapeHtml(album.title)}</a> &nbsp;/&nbsp;
    Track ${String(t.n).padStart(2, '0')}${t.isBonus ? ' (Bonus)' : ''}
  </nav>

  <section class="track-hero">
    <div class="track-hero__art">
      <img src="${artSrc}" alt="${escapeHtml(t.title)} cover art" width="1000" height="1000">
    </div>
    <div>
      <div class="track-hero__meta">${meta}</div>
      <h1>${escapeHtml(t.title)}</h1>
      ${sinTag}
      <p class="description">${escapeHtml(t.description)}</p>
      ${audioBlock}
    </div>
  </section>

  ${altCallout}

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

function alternateTrackPageHtml(album, t, alt) {
  const altSlug = alt._fullSlug;
  const ogImage = `${site.siteUrl}/art/${altSlug}.${alt._artExt}`;
  const canonical = `${site.siteUrl}/tracks/${t.slug}/${alt.slug}/`;
  const lyrics = renderLyrics(readLyrics(t.slug));
  const artSrc = `/art/${altSlug}.${alt._artExt}`;
  const audioSrc = `/audio/${altSlug}.mp3`;
  const audioBlock = alt._hasAudio
    ? `<audio controls preload="metadata" src="${audioSrc}"></audio>
       <div class="actions actions--mono">
         <a class="btn btn--whiskey" href="${audioSrc}" download>↓ Download MP3</a>
         <a class="btn" href="/tracks/${t.slug}/">← Original version</a>
       </div>`
    : `<p class="audio-pending">[ Audio pending ]</p>`;

  return `${head({
    title: `${t.title} (${alt.version}) — Throughput Mojo`,
    description: alt.oneliner,
    ogImage,
    ogImageW: 1000,
    ogImageH: 1000,
    ogImageAlt: `${t.title} — ${alt.version} cover art`,
    canonical,
    bodyClass: 'alt-track',
  })}
${siteHeader()}

<article class="track-page">
  <nav class="breadcrumbs">
    <a href="/">Album</a> &nbsp;/&nbsp;
    <a href="/tracks/${t.slug}/">${escapeHtml(t.title)}</a> &nbsp;/&nbsp;
    ${escapeHtml(alt.version)}
  </nav>

  <section class="track-hero track-hero--alt">
    <div class="track-hero__art">
      <img src="${artSrc}" alt="${escapeHtml(t.title)} — ${escapeHtml(alt.version)} cover art" width="1000" height="1000">
    </div>
    <div>
      <div class="track-hero__meta track-hero__meta--alt">
        <span class="alt-badge">ALT // ROADHOUSE</span>
      </div>
      <h1>${escapeHtml(t.title)}</h1>
      <span class="alt-version-name">${escapeHtml(alt.version)}</span>
      <p class="alt-byline">${escapeHtml(alt.byline)}</p>
      <p class="description">${escapeHtml(alt.description)}</p>
      ${audioBlock}
    </div>
  </section>

  <section class="track-lyrics" aria-label="Lyrics">
    <h2>// LYRICS — same words, different bar</h2>
    <pre>${lyrics}</pre>
  </section>

  <nav class="track-nav" aria-label="Track navigation">
    <a href="/tracks/${t.slug}/"><span class="arrow">←</span> Original version</a>
    <a href="/#bsides">More B-sides <span class="arrow">→</span></a>
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

fs.writeFileSync(path.join(DIST, 'index.html'), homeHtml());

for (const album of albums) {
  const albumDir = path.join(DIST, 'albums', album.slug);
  ensureDir(albumDir);
  fs.writeFileSync(path.join(albumDir, 'index.html'), albumHtml(album));

  album.tracks.forEach((t, i) => {
    const dir = path.join(DIST, 'tracks', t.slug);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), trackPageHtml(album, t, i));

    if (Array.isArray(t.alternateVersions)) {
      for (const alt of t.alternateVersions) {
        const altDir = path.join(DIST, 'tracks', t.slug, alt.slug);
        ensureDir(altDir);
        fs.writeFileSync(path.join(altDir, 'index.html'), alternateTrackPageHtml(album, t, alt));
      }
    }
  });
}

const trackCount = albums.reduce((sum, a) => sum + a.tracks.length, 0);
console.log(`✓ Built ${albums.length} albums + ${trackCount} tracks + ${totalAlts} alts → dist/`);
console.log(`  Audio: ${albums.reduce((sum, a) => sum + a.tracks.filter((t) => t._hasAudio).length, 0)}/${trackCount} originals, ${allAlternates.filter((a) => a._hasAudio).length}/${totalAlts} alts`);
console.log(`  Art:   ${albums.reduce((sum, a) => sum + a.tracks.filter((t) => t._artExt).length, 0)}/${trackCount} originals, ${allAlternates.filter((a) => a._artExt).length}/${totalAlts} alts`);
