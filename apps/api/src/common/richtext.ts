import sanitizeHtml from "sanitize-html";

/** Rich-text description sanitizer — Section 16: bold/italic/underline/lists/links only. */
export function sanitizeDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "p", "br", "span"],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["style"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}
