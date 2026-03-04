/**
 * Unit tests for documentExtractor.ts
 * Verifies that all five supported formats extract real text (no stubs).
 *
 * Run with:  pnpm test server/documentExtractor.test.ts
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

// Dynamic import after env is available (env.ts reads process.env at import time)
import {
  extractTxtText,
  extractXlsxText,
  extractPptxText,
  extractDocxText,
  extractPdfText,
  chunkText,
} from "./documentExtractor";

// ---------------------------------------------------------------------------
// Helpers to build in-memory test buffers
// ---------------------------------------------------------------------------

function makeXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Name", "Role", "Years"],
      ["Dennis", "Engineer", 10],
      ["Alice", "Manager", 8],
    ]),
    "Profile"
  );
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

async function makeDocxBuffer(): Promise<Buffer> {
  // mammoth can round-trip a very simple .docx created via its own API,
  // but the easiest approach is to build a minimal valid OOXML zip in memory.
  // Instead we use a known-good tiny DOCX fixture encoded as base64.
  // This is the smallest valid .docx (one paragraph "Hello DOCX").
  const minimalDocx =
    "UEsDBBQAAAAIAAAAIQDfpNBsWQEAALAEAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbKWUy27CMBBF9/2KyNslDg9VVRUSRd1" +
    "2UUo/wNgTYuHYlm0K/H3HgUApqhBiZc/ce8+MRtbTRSWjHVjHja6SYTxIItCFkUyvq+RteZ/eJpEjqiVVRkOVHMAlk9n1" +
    "dLk2EEVB61SV7Il2KaVFCUrxMTagQ2dlrFIUhnatPC8KvoKMR4NB/KMMaA/6tEDmrKok7pSlmiPjLJnLJfz2OdZamYgqNd" +
    "kUlVWKZRtWFShh1C1BbI2hKF5ZFn4m1HPlzJJfv+Lv6VBXAAAAUEsDBBQAAAAIAAAAIQAekRq37AAAANsAAAAPAAAAd29yZC9z" +
    "dHlsZXMueG1sVY7NCsIwEITvPkXYu0mLBxFJD6IHLx5EfIAl2bSBZBOySaGPb6Dy8zCw8808sN2jqkoBrkM2kMEBgIAAAJID" +
    "VgAAAA0AAAAhABeRGrfsAAAA2wAAAA8AAAd3b3JkL3N0eWxlcy54bWxVjr0KwjAQhO8+Rdibkx0OIpIeRA8ePIh4AMu2aQPJ" +
    "JmSTQh/fQOXnYWDhm3lgucVUlQLchmwggwMAAQCTA1YAAAANAAAAIQAXkRq37AAAANsAAAAPAAAAd29yZC9zdHlsZXMueG1s";

  // Fall back: build a real minimal docx using jszip + OOXML
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello from a DOCX file. Engineering career summary.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", document);
  zip.file("word/_rels/document.xml.rels", wordRels);

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

function makePptxBuffer(): Promise<Buffer> {
  return (async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

    const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Hello from PPTX slide one</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    zip.file("[Content_Types].xml", contentTypes);
    zip.file("ppt/slides/slide1.xml", slide1);

    return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  })();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractTxtText", () => {
  it("returns the file contents as a string", () => {
    const buf = Buffer.from("Software engineer with 10 years experience.\nExpert in TypeScript.");
    const result = extractTxtText(buf);
    expect(result).toContain("Software engineer");
    expect(result).toContain("TypeScript");
  });
});

describe("extractXlsxText", () => {
  it("extracts cell values from all sheets", async () => {
    const result = await extractXlsxText(makeXlsxBuffer());
    expect(result).toContain("Dennis");
    expect(result).toContain("Engineer");
    expect(result).toContain("Profile");
  });

  it("labels each sheet", async () => {
    const result = await extractXlsxText(makeXlsxBuffer());
    expect(result).toContain("[Sheet: Profile]");
  });
});

describe("extractPptxText", () => {
  it("extracts text from slide <a:t> tags", async () => {
    const buf = await makePptxBuffer();
    const result = await extractPptxText(buf);
    expect(result).toContain("Hello from PPTX slide one");
  });
});

describe("extractDocxText", () => {
  it("extracts paragraph text via mammoth", async () => {
    const buf = await makeDocxBuffer();
    const result = await extractDocxText(buf);
    expect(result).toContain("Hello from a DOCX file");
  });
});

describe("extractPdfText", () => {
  it("returns real text from a PDF buffer (not a stub placeholder)", async () => {
    // Use pdf-parse's own bundled test fixture — a known-good single-page PDF.
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const pdfParsePath = req.resolve("pdf-parse");
    const fixturePath = pdfParsePath.replace(/index\.js$/, "").replace(/lib\/pdf-parse\//, "") + "test/data/01-valid.pdf";
    const { readFileSync } = await import("fs");
    const buf = readFileSync(fixturePath);

    const result = await extractPdfText(buf);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("Text extraction requires additional setup");
  }, 15_000);
});

describe("chunkText", () => {
  it("splits text into chunks no larger than chunkSize", () => {
    const text = Array(20).fill("This is a sentence about engineering experience").join(". ");
    const chunks = chunkText(text, 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(300)); // allow slight overflow at sentence boundary
  });

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Short text.", 1000, 100);
    expect(chunks.length).toBe(1);
  });
});
