type PageLinks = {
  oneNoteWebUrl?: { href?: string };
  oneNoteClientUrl?: { href?: string };
};

type LinkedPage = { id: string; links?: PageLinks };

function parsePageLink(value: string) {
  const raw = value.trim().replace(/^onenote:/i, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Paste a complete OneNote page link copied from OneNote.");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(
    host === "onenote.com" || host.endsWith(".onenote.com") ||
    host === "onedrive.live.com" || host.endsWith(".sharepoint.com") ||
    host === "d.docs.live.net" || host === "1drv.ms"
  )) {
    throw new Error("Use a OneNote page link from Microsoft OneNote, OneDrive, or SharePoint.");
  }
  const parameters = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.slice(1).replace(/^[^=&?]*[&?]/, ""));
  let pageId = "";
  for (const [key, value] of [...parameters, ...fragment]) {
    if (/^page-?id$/i.test(key)) pageId = value.replace(/[{}]/g, "").toLowerCase();
  }
  return { url: url.href, pageId };
}

// Resolve through the connected account's Graph library. Never fetch a pasted URL
// or forward the account's access token to it.
export async function resolveOneNotePageLink(
  pageLink: string,
  get: (path: string) => Promise<Response>
) {
  const target = parsePageLink(pageLink);
  let path = "/me/onenote/pages?$select=id,links&$top=100";
  const visited = new Set<string>();
  while (path && !visited.has(path)) {
    visited.add(path);
    const response = await get(path);
    const data = await response.json() as { value?: LinkedPage[]; "@odata.nextLink"?: string };
    for (const page of data.value || []) {
      for (const link of [page.links?.oneNoteWebUrl?.href, page.links?.oneNoteClientUrl?.href]) {
        if (!link) continue;
        let candidate: ReturnType<typeof parsePageLink>;
        try { candidate = parsePageLink(link); } catch { continue; }
        if ((target.pageId && target.pageId === candidate.pageId) || target.url === candidate.url) return page.id;
      }
    }
    path = "";
    if (data["@odata.nextLink"]) {
      const next = new URL(data["@odata.nextLink"]);
      if (next.origin !== "https://graph.microsoft.com" || next.pathname !== "/v1.0/me/onenote/pages") {
        throw new Error("Microsoft returned an unsupported OneNote continuation link.");
      }
      path = next.pathname.slice("/v1.0".length) + next.search;
    }
  }
  throw new Error("Could not find this page in the connected OneNote account. Copy a link to the specific page (not a notebook or shortened sharing link), use the notebook browser, or attach a PDF/image export.");
}
