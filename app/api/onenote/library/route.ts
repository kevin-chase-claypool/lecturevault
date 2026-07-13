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
    const sectionGroupId = param(request, "sectionGroupId");
    const sectionId = param(request, "sectionId");
    if (sectionId) {
      const response = await graphGet(
        `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,links&$top=100`
      );
      const data = (await response.json()) as { value?: Array<Record<string, unknown>> };
      return Response.json({
        value: (data.value || []).map((item) => ({ ...item, kind: "page" }))
      });
    }

    const parentPath = sectionGroupId
      ? `/me/onenote/sectionGroups/${encodeURIComponent(sectionGroupId)}`
      : notebookId
        ? `/me/onenote/notebooks/${encodeURIComponent(notebookId)}`
        : "";

    if (parentPath) {
      const [groupsResponse, sectionsResponse] = await Promise.all([
        graphGet(`${parentPath}/sectionGroups?$select=id,displayName,lastModifiedDateTime&$top=100`),
        graphGet(`${parentPath}/sections?$select=id,displayName,lastModifiedDateTime&$top=100`)
      ]);
      const groups = (await groupsResponse.json()) as { value?: Array<Record<string, unknown>> };
      const sections = (await sectionsResponse.json()) as { value?: Array<Record<string, unknown>> };
      return Response.json({
        value: [
          ...(groups.value || []).map((item) => ({ ...item, kind: "sectionGroup" })),
          ...(sections.value || []).map((item) => ({ ...item, kind: "section" }))
        ]
      });
    }

    const response = await graphGet("/me/onenote/notebooks?$select=id,displayName,lastModifiedDateTime&$top=100");
    const data = (await response.json()) as { value?: Array<Record<string, unknown>> };
    return Response.json({
      value: (data.value || []).map((item) => ({ ...item, kind: "notebook" }))
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load OneNote library." }, { status: 500 });
  }
}
