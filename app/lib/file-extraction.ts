export const OFFICE_FILE = /\.(docx|xlsx|pptx|odt|ods|odp|rtf)$/i;
export const TEXT_FILE = /\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|xml|yaml|yml|toml|ini|cfg|conf|log|sql|html|htm|css|scss|sass|less|svg|tex|bib|eml|ics|vcf|js|jsx|mjs|cjs|ts|tsx|py|ipynb|java|c|cc|cpp|cxx|h|hpp|cs|go|rs|rb|php|swift|kt|kts|dart|lua|r|sh|bash|zsh|fish|ps1|bat|cmd|vue|svelte)$/i;

const xmlText = (xml: string) => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(document.querySelectorAll("p, h, t, table-row")).map(node => (node.textContent || "").trim()).filter(Boolean).join("\n");
};

export async function extractOfficeText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
  }
  if (extension === "xlsx") {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets.map(({ sheet, data }) => `## Sheet: ${sheet}\n${data.map(row => row.map(cell => cell instanceof Date ? cell.toISOString() : String(cell ?? "").replace(/\t/g, " ")).join("\t")).join("\n")}`).join("\n\n");
  }
  if (extension === "rtf") return new TextDecoder().decode(buffer).replace(/\\par[d]?/g, "\n").replace(/\\'[0-9a-fA-F]{2}/g, " ").replace(/\\[a-z]+-?\d* ?/g, "").replace(/[{}]/g, "").trim();
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  if (extension === "pptx") {
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a,b)=>a.localeCompare(b, undefined, { numeric:true }));
    return (await Promise.all(slides.map(async (name,index)=>`## Slide ${index+1}\n${xmlText(await zip.file(name)!.async("text"))}`))).join("\n\n");
  }
  const content = zip.file("content.xml");
  if (!content) throw new Error("Không tìm thấy nội dung trong tệp OpenDocument.");
  return xmlText(await content.async("text"));
}
