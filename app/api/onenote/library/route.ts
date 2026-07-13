import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { graphGet } from "../../../../lib/onenote";

export const runtime = "nodejs";

function param(request: Request, name: string) {
  return new URL(request.url).searchParams.get(name)?.trim() || "";
}

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  try {
    const notebookId = param(request, "notebookId");
    const sectionId = param(request, "sectionId");
    const path = sectionId
      ? `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,links&$top=100`
      : notebookId
        ? `/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections?$select=id,displayName,lastModifiedDateTime&$top=100`
        : "/me/onenote/notebooks?$select=id,displayName,lastModifiedDateTime&$top=100";
    const response = await graphGet(path);
    const data = (await response.json()) as { value?: unknown[] };
    return Response.json({ value: Array.isArray(data.value) ? data.value : [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load OneNote library." }, { status: 500 });
  }
}
