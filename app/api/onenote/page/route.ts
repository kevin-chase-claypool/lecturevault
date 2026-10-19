import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { graphGet, htmlToText } from "../../../../lib/onenote";
import { resolveOneNotePageLink } from "../../../../lib/onenote-page-link";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;
  const params = new URL(request.url).searchParams;
  let pageId = params.get("pageId")?.trim();
  const pageLink = params.get("pageLink")?.trim();
  if (!pageId && !pageLink) return Response.json({ error: "A OneNote page link or pageId is required." }, { status: 400 });

  try {
    if (pageLink) pageId = await resolveOneNotePageLink(pageLink, graphGet);
    if (!pageId) return Response.json({ error: "Could not resolve the OneNote page." }, { status: 400 });
    const [metadataResponse, contentResponse] = await Promise.all([
      graphGet(`/me/onenote/pages/${encodeURIComponent(pageId)}?$select=id,title,createdDateTime,lastModifiedDateTime,links`),
      graphGet(`/me/onenote/pages/${encodeURIComponent(pageId)}/content?includeIDs=true`)
    ]);
    const metadata = (await metadataResponse.json()) as { id?: string; title?: string; links?: { oneNoteWebUrl?: { href?: string } } };
    const html = await contentResponse.text();
    return Response.json({
      html,
      pageId: metadata.id || pageId,
      text: htmlToText(html),
      title: metadata.title || "Untitled OneNote page",
      webUrl: metadata.links?.oneNoteWebUrl?.href || ""
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not import OneNote page." }, { status: 500 });
  }
}
