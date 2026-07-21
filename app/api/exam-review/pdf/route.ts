import katex from "katex";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { storageObjectToDataUrl } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

type ReviewFigure = {
  label?: string;
  lectureTitle?: string;
  name?: string;
  dataUrl?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
};

type ReviewSourceLink = {
  label?: string;
  href?: string;
  description?: string;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripMarkdownMarks(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function normalizeLatexEscapes(text: string) {
  return text
    .replace(/\\\\(?=[()[\]])/g, "\\")
    .replace(/\\\\(?=[a-zA-Z])/g, "\\");
}

function renderInlineMath(text: string) {
  return normalizeLatexEscapes(text)
    .split(/(\\\([\s\S]*?\\\))/g)
    .map((part) => {
      const inline = part.match(/^\\\(([\s\S]*?)\\\)$/);

      if (!inline) {
        return escapeHtml(part);
      }

      try {
        return katex.renderToString(inline[1], {
          displayMode: false,
          throwOnError: false
        });
      } catch {
        return escapeHtml(part);
      }
    })
    .join("");
}

function renderDisplayMath(math: string) {
  try {
    return katex.renderToString(math, {
      displayMode: true,
      throwOnError: false
    });
  } catch {
    return `<pre>${escapeHtml(math)}</pre>`;
  }
}

function renderReviewMarkdown(markdown: string) {
  const lines = normalizeLatexEscapes(markdown).trim().split(/\r?\n/);
  const html: string[] = [];
  let listItems: string[] = [];
  let displayMath: string[] = [];
  let inDisplayMath = false;

  function flushList() {
    if (!listItems.length) {
      return;
    }

    html.push(
      `<ul>${listItems
        .map((item) => `<li>${renderInlineMath(stripMarkdownMarks(item))}</li>`)
        .join("")}</ul>`
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "\\[") {
      flushList();
      inDisplayMath = true;
      displayMath = [];
      continue;
    }

    if (line === "\\]" && inDisplayMath) {
      html.push(`<div class="math-block">${renderDisplayMath(displayMath.join("\n"))}</div>`);
      inDisplayMath = false;
      displayMath = [];
      continue;
    }

    if (inDisplayMath) {
      displayMath.push(rawLine);
      continue;
    }

    if (line.startsWith("\\[") && line.endsWith("\\]") && line.length > 4) {
      flushList();
      html.push(`<div class="math-block">${renderDisplayMath(line.slice(2, -2).trim())}</div>`);
      continue;
    }

    if (!line) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      html.push(`<h${level}>${renderInlineMath(stripMarkdownMarks(heading[2]))}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    html.push(`<p>${renderInlineMath(stripMarkdownMarks(line))}</p>`);
  }

  flushList();
  return html.join("\n");
}

function figureHtml(figures: ReviewFigure[]) {
  if (!figures.length) {
    return "";
  }

  return `<section class="figures">
    <h2>Figure References</h2>
    ${figures
      .map((figure) => {
        const caption = `${cleanString(figure.label) || "Fig."}: ${
          cleanString(figure.name) || "Board image"
        }${
          cleanString(figure.lectureTitle)
            ? ` from ${cleanString(figure.lectureTitle)}`
            : ""
        }`;
        const dataUrl = cleanString(figure.dataUrl);
        const imageMarkup = dataUrl.startsWith("data:image/")
          ? `<img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(caption)}" />`
          : `<div class="missing-figure">Image file was not embedded in the archive. The reference is preserved for source review.</div>`;

        return `<figure>
          ${imageMarkup}
          <figcaption>${escapeHtml(caption)}</figcaption>
        </figure>`;
      })
      .join("\n")}
  </section>`;
}

function sourceLinksHtml(sourceLinks: ReviewSourceLink[]) {
  const links = sourceLinks.filter(
    (link) => cleanString(link.label) && cleanString(link.href)
  );

  if (!links.length) {
    return "";
  }

  return `<section class="source-links">
    <h2>Source Links</h2>
    <p>Open the linked original when you need to inspect a figure, replay a cited lecture moment, or check a textbook page.</p>
    <ul>
      ${links
        .map(
          (link) => `<li><a href="${escapeHtml(cleanString(link.href))}">${escapeHtml(
            cleanString(link.label)
          )}</a>${
            cleanString(link.description)
              ? ` <span>${escapeHtml(cleanString(link.description))}</span>`
              : ""
          }</li>`
        )
        .join("\n")}
    </ul>
  </section>`;
}

async function resolveFigureImages(figures: ReviewFigure[]) {
  const resolved: ReviewFigure[] = [];

  for (const figure of figures) {
    const dataUrl = cleanString(figure.dataUrl);

    if (dataUrl.startsWith("data:image/")) {
      resolved.push(figure);
      continue;
    }

    const storagePath = cleanString(figure.storagePath);
    const storageDataUrl = storagePath
      ? await storageObjectToDataUrl({
          bucket: cleanString(figure.storageBucket),
          mimeType: cleanString(figure.mimeType),
          path: storagePath
        })
      : null;

    resolved.push({
      ...figure,
      dataUrl: storageDataUrl || undefined
    });
  }

  return resolved;
}

function buildHtml({
  title,
  courseName,
  review,
  figures,
  sourceLinks
}: {
  title: string;
  courseName: string;
  review: string;
  figures: ReviewFigure[];
  sourceLinks: ReviewSourceLink[];
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css" />
  <style>
    @page { size: Letter; margin: 0.65in; }
    * { box-sizing: border-box; }
    body {
      color: #142033;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      line-height: 1.5;
      margin: 0;
    }
    h1 {
      border-bottom: 2px solid #172033;
      font-size: 17pt;
      line-height: 1.1;
      margin: 0 0 0.2in;
      padding-bottom: 0.12in;
    }
    h2 {
      break-after: avoid;
      color: #172033;
      font-size: 12pt;
      margin: 0.3in 0 0.08in;
    }
    h3, h4, h5 {
      break-after: avoid;
      color: #344054;
      font-size: 9pt;
      margin: 0.2in 0 0.05in;
    }
    p { margin: 0 0 0.1in; }
    ul { margin: 0.04in 0 0.14in 0.22in; padding-left: 0.18in; }
    li { margin: 0.04in 0; }
    .meta { color: #526071; font-size: 7pt; margin: -0.1in 0 0.22in; }
    .math-block { margin: 0.14in 0; overflow-wrap: anywhere; }
    figure { break-inside: avoid; margin: 0.25in 0; page-break-inside: avoid; }
    figure img {
      border: 1px solid #d0d5dd;
      display: block;
      max-height: 8in;
      max-width: 100%;
      object-fit: contain;
    }
    .missing-figure {
      border: 1px dashed #98a2b3;
      color: #526071;
      padding: 0.16in;
    }
    figcaption { color: #526071; font-size: 6.7pt; margin-top: 0.06in; }
    .source-links { break-inside: avoid; margin-top: 0.28in; page-break-inside: avoid; }
    .source-links p { color: #526071; font-size: 7pt; margin-bottom: 0.06in; }
    .source-links li { font-size: 7pt; }
    .source-links a { color: #0b5f79; text-decoration: underline; }
    .source-links span { color: #526071; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(courseName)}</div>
  <main>${renderReviewMarkdown(review)}</main>
  ${figureHtml(figures)}
  ${sourceLinksHtml(sourceLinks)}
</body>
</html>`;
}

function browserlessPdfUrl() {
  const token =
    cleanString(process.env.BROWSERLESS_TOKEN) ||
    cleanString(process.env.BROWSERLESS_API_KEY) ||
    cleanString(process.env.BROWSERLESS_KEY);

  if (!token) {
    return "";
  }

  const endpoint =
    cleanString(process.env.BROWSERLESS_PDF_ENDPOINT) ||
    "https://production-sfo.browserless.io/pdf";
  const url = new URL(endpoint);
  url.searchParams.set("token", token);
  return url.toString();
}

function browserlessConfigSummary() {
  const endpoint =
    cleanString(process.env.BROWSERLESS_PDF_ENDPOINT) ||
    "https://production-sfo.browserless.io/pdf";
  let endpointHost = "invalid endpoint";

  try {
    endpointHost = new URL(endpoint).host;
  } catch {
    endpointHost = endpoint || "not configured";
  }

  return [
    `BROWSERLESS_TOKEN present: ${Boolean(cleanString(process.env.BROWSERLESS_TOKEN))}`,
    `BROWSERLESS_API_KEY present: ${Boolean(cleanString(process.env.BROWSERLESS_API_KEY))}`,
    `BROWSERLESS_KEY present: ${Boolean(cleanString(process.env.BROWSERLESS_KEY))}`,
    `BROWSERLESS_PDF_ENDPOINT host: ${endpointHost}`
  ].join("; ");
}

export async function POST(request: Request) {
  const authError = requireAuthenticatedRequest(request);

  if (authError) {
    return authError;
  }

  const browserlessUrl = browserlessPdfUrl();

  if (!browserlessUrl) {
    return jsonError(
      `Server runtime does not see a Browserless token. ${browserlessConfigSummary()}. If Vercel shows the variable, redeploy the Production deployment after saving environment variables.`,
      500
    );
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      courseName?: string;
      review?: string;
      figures?: ReviewFigure[];
      sourceLinks?: ReviewSourceLink[];
    };
    const review = cleanString(body.review);

    if (!review) {
      return jsonError("No review text was provided.", 400);
    }

    const html = buildHtml({
      title: cleanString(body.title) || "Exam Review",
      courseName: cleanString(body.courseName),
      review,
      figures: await resolveFigureImages(Array.isArray(body.figures) ? body.figures : []),
      sourceLinks: Array.isArray(body.sourceLinks) ? body.sourceLinks : []
    });
    const response = await fetch(browserlessUrl, {
      method: "POST",
      headers: {
        "cache-control": "no-cache",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        html,
        options: {
          displayHeaderFooter: false,
          format: "Letter",
          margin: {
            top: "0.65in",
            right: "0.65in",
            bottom: "0.65in",
            left: "0.65in"
          },
          printBackground: true
        }
      })
    });

    if (!response.ok) {
      const message = (await response.text()).trim();
      return jsonError(
        message
          ? `Browserless PDF render failed (${response.status}): ${message.slice(0, 600)}`
          : `Browserless PDF render failed with status ${response.status}.`,
        502
      );
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        "content-disposition": 'attachment; filename="exam-review.pdf"',
        "content-type": "application/pdf"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not render exam review PDF.";
    return jsonError(message, 500);
  }
}
