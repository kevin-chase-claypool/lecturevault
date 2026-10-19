import assert from "node:assert/strict";
import { resolveOneNotePageLink } from "../lib/onenote-page-link.ts";

const page = "ABC12345-1234-4321-ABCD-123456789012";
const web = `https://onedrive.live.com/view.aspx?resid=notebook&pageId=%7B${page}%7D`;
const desktop = `onenote:https://example.sharepoint.com/notes.one#Lesson&section-id={section}&page-id={${page.toLowerCase()}}&end`;
const record = { id: "graph-page-id", links: { oneNoteWebUrl: { href: web }, oneNoteClientUrl: { href: desktop } } };
const response = (data) => new Response(JSON.stringify(data));
let calls = [];
const get = async (path) => {
  calls.push(path);
  return response(calls.length === 1
    ? { value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=100" }
    : { value: [record] });
};
assert.equal(await resolveOneNotePageLink(desktop, get), record.id);
assert.equal(calls.length, 2, "follows Graph pagination");
assert.equal(calls[1], "/me/onenote/pages?$skip=100");
assert.equal(await resolveOneNotePageLink(web, async () => response({ value: [record] })), record.id);
assert.equal(await resolveOneNotePageLink(`https://example.sharepoint.com/notes.one#page-id={${page}}&section-id={section}`, async () => response({ value: [record] })), record.id);
for (const link of ["", "not a link", "https://attacker.example/?page-id=123", "https://onenote.com.attacker.example/", "http://onenote.com/page"]) {
  await assert.rejects(resolveOneNotePageLink(link, async () => assert.fail("invalid links must not call Graph")));
}
await assert.rejects(resolveOneNotePageLink(web, async () => response({ value: [], "@odata.nextLink": "https://attacker.example/pages" })), /unsupported/);
await assert.rejects(resolveOneNotePageLink(web, async () => response({ value: [] })), /Could not find this page/);
await assert.rejects(resolveOneNotePageLink(web, async () => { throw new Error("Connect OneNote"); }), /Connect OneNote/);
console.log("OneNote web/desktop links, pagination, invalid links, missing pages, and Graph errors passed.");
