"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "message" | "task" | "decision" | "result" | "file";
type Entry = { id: string; kind: Kind; title?: string; text: string; time: string; meta?: string; role?: "user" | "ai" };
type Attachment = { name: string; size: number; text: string };
type LocalProject = { id: string; name: string; folderName?: string; entries: Entry[] };
type WorkspaceFile = { path: string; handle: FileSystemFileHandle };
type PendingPatch = { path: string; content: string; summary: string };

const initialEntries: Entry[] = [
  { id: "m1", kind: "message", role: "user", text: "Mình muốn bộ chuyển PDF sang DOCX chạy hoàn toàn local và giữ đúng bố cục bảng.", time: "06 Aug · 09:14" },
  { id: "d1", kind: "decision", title: "Kiến trúc OCR", text: "Tách phần tính toán hình học khỏi luồng OCR để có thể thay engine mà không ảnh hưởng việc tái dựng bảng.", time: "06 Aug · 10:02", meta: "Quyết định · Kiến trúc" },
  { id: "t1", kind: "task", title: "Đánh giá các engine OCR", text: "Đã so sánh PaddleOCR và MinerU trên 24 tài liệu mẫu. MinerU giữ bố cục tốt hơn ở tài liệu nhiều cột.", time: "06 Aug · 14:36", meta: "Công việc #18 · Hoàn tất" },
  { id: "m2", kind: "message", role: "user", text: "Từ giờ dùng MinerU. Nhưng khi sửa phần DOCX thì tuyệt đối đừng thay đổi OCR module nhé.", time: "07 Aug · 08:41" },
  { id: "d2", kind: "decision", title: "Ràng buộc đang áp dụng", text: "Không sửa module OCR khi xử lý lỗi bảng DOCX. Quyết định này thay thế cấu hình PaddleOCR trước đó.", time: "07 Aug · 08:42", meta: "Ràng buộc · Đã ghim" },
  { id: "t2", kind: "task", title: "Sửa căn chỉnh ô gộp", text: "Phân tích build_table() và phát hiện độ lệch bị áp dụng hai lần khi ô trải qua nhiều cột.", time: "07 Aug · 15:20", meta: "Công việc #24 · Hoàn tất" },
  { id: "f1", kind: "file", title: "table_geometry.py", text: "Cập nhật calculate_merged_bounds() và thêm kiểm tra cho nested merged cells.", time: "07 Aug · 15:48", meta: "+18 −6 · Python" },
  { id: "r1", kind: "result", title: "Kiểm thử thành công", text: "12/12 kiểm thử hình học bảng đã đạt. Luồng OCR không thay đổi.", time: "07 Aug · 15:52", meta: "Kết quả · Đã duyệt" },
  { id: "m3", kind: "message", role: "user", text: "Table vẫn hơi lệch ở tài liệu có merged cell nằm sát lề phải. Sửa tiếp giúp mình.", time: "Today · 09:03" },
  { id: "t3", kind: "task", title: "Sửa ô gộp sát lề phải", text: "Đang kiểm tra sai số làm tròn khi chuyển đổi chiều rộng DOCX. Đã lấy 2 quyết định, 3 symbol và 1 kiểm thử liên quan.", time: "Hôm nay · 09:04", meta: "Công việc #31 · Đang chạy" },
  { id: "m4", kind: "message", role: "ai", text: "Mình đã cô lập lỗi trong phép đổi pixel sang twip. Constraint không sửa OCR đang được giữ nguyên.", time: "Today · 09:06" },
  { id: "security-policy", kind: "decision", title: "Security baseline", text: "Local-first, quyền tối thiểu, tự động che secret trước khi gửi provider và mọi thay đổi file đều cần user xác nhận.", time: "Hôm nay", meta: "Bảo mật · Đã ghim" },
];

const seedProjects: LocalProject[] = [
  { id: "pdf", name: "PDF Converter", entries: initialEntries },
  { id: "finance", name: "Financial Analyzer", entries: [] },
  { id: "automation", name: "Automation Tool", entries: [] },
];
const providerGuides: Record<string, { keyUrl: string; billingUrl: string; keyLabel?: string; note: string }> = {
  OpenRouter: { keyUrl: "https://openrouter.ai/keys", billingUrl: "https://openrouter.ai/settings/credits", keyLabel: "Tạo API key", note: "Key thường bắt đầu bằng sk-or-v1-." },
  OpenAI: { keyUrl: "https://platform.openai.com/api-keys", billingUrl: "https://platform.openai.com/settings/organization/billing/overview", note: "ChatGPT Plus/Pro không bao gồm credit API; billing API là riêng." },
  Anthropic: { keyUrl: "https://console.anthropic.com/settings/keys", billingUrl: "https://console.anthropic.com/settings/billing", note: "Gói Claude chat và Claude API được tính phí riêng." },
  Google: { keyUrl: "https://aistudio.google.com/app/apikey", billingUrl: "https://console.cloud.google.com/billing", note: "Tạo key trong Google AI Studio; billing được quản lý bằng Google Cloud project." },
  DeepSeek: { keyUrl: "https://platform.deepseek.com/api_keys", billingUrl: "https://platform.deepseek.com/top_up", note: "DeepSeek API dùng số dư trả trước trên Open Platform." },
  Qwen: { keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=dashboard#/api-key", billingUrl: "https://billing-cost.console.alibabacloud.com/", note: "Tạo Model Studio API key đúng region; app dùng endpoint quốc tế." },
  Kimi: { keyUrl: "https://platform.moonshot.ai/console/api-keys", billingUrl: "https://platform.moonshot.ai/console/info", note: "Kimi chat subscription và Moonshot API là hai dịch vụ thanh toán riêng." },
};
const filters: { label: string; value: "all" | Kind }[] = [
  { label: "Tất cả", value: "all" }, { label: "Tin nhắn", value: "message" },
  { label: "Tasks", value: "task" }, { label: "Decisions", value: "decision" },
  { label: "Files", value: "file" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3.5 3.5 0 0 0 .5 6.96A3 3 0 0 0 9 18.5V5.2M14.5 4.5A3 3 0 0 1 19 7a3.5 3.5 0 0 1-.5 6.96A3 3 0 0 1 15 18.5V5.2M9 9h3M12 14h3"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    command: <><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) => part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part);
}

function buildUsagePlan(input: string) {
  const q = input.toLowerCase();
  const research = /nghiên cứu|bài báo|luận văn|số liệu|thống kê|citation|trích dẫn/.test(q);
  const coding = /code|bug|lỗi|repo|function|api|script/.test(q);
  const finance = /tài chính|đầu tư|cổ phiếu|doanh thu|lợi nhuận/.test(q);
  const legal = /pháp lý|luật|hợp đồng|điều khoản/.test(q);
  if (research) return { profile: "Research", risk: "Cao", priority: "Độ chính xác > sáng tạo", tool: /số liệu|thống kê|phân tích/.test(q) ? "Python/R trước · LLM sau" : "Search có nguồn · LLM", verification: "Kiểm chứng cao", source: "Mọi factual claim cần nguồn", inference: "Phải gắn nhãn suy luận", output: "Kết quả / Diễn giải / Giới hạn" };
  if (coding) return { profile: "Coding", risk: "Trung bình", priority: "Đúng và kiểm thử được", tool: "Repo tools + tests · LLM", verification: "Test thay cho phỏng đoán", source: "Code và log là nguồn chính", inference: "Nêu giả định kỹ thuật", output: "Patch tối thiểu + kết quả test" };
  if (finance || legal) return { profile: finance ? "Finance" : "Legal", risk: "Cao", priority: "Nguồn và tính cập nhật", tool: "Search chính thống + tính toán", verification: "Kiểm chứng cao", source: "Không claim thiếu nguồn", inference: "Tách fact khỏi nhận định", output: "Kết luận / Căn cứ / Rủi ro" };
  return { profile: "General Work", risk: "Thấp", priority: "Phù hợp mục tiêu", tool: "LLM cân bằng chi phí", verification: "Kiểm tra tiêu chuẩn", source: "Yêu cầu nguồn khi có factual claim", inference: "Nêu rõ khi suy luận", output: "Ngắn gọn, đúng định dạng" };
}

function redactSecrets(input: string) {
  const patterns = [
    /sk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
    /AIza[0-9A-Za-z_-]{30,}/g,
    /gh[opusr]_[A-Za-z0-9]{20,}/g,
    /(?:Bearer\s+)[A-Za-z0-9._-]{16,}/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /((?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*)[^\s"']+/gi,
  ];
  let text = input; let count = 0;
  for (const pattern of patterns) text = text.replace(pattern, match => { count += 1; const prefix = match.match(/^[^:=]+[:=]\s*/)?.[0] || ""; return `${prefix}[REDACTED_SECRET]`; });
  return { text, count };
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [projectList, setProjectList] = useState<LocalProject[]>(seedProjects);
  const [activeProjectId, setActiveProjectId] = useState("pdf");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState("");
  const [workspaceFileText, setWorkspaceFileText] = useState("");
  const [executionMode, setExecutionMode] = useState<"analyze" | "execute">("analyze");
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [lastRedactions, setLastRedactions] = useState(0);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [credentialProvider, setCredentialProvider] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [clarifiedScope, setClarifiedScope] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [selected, setSelected] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderHandlesRef = useRef<Record<string, FileSystemDirectoryHandle>>({});

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return entries.filter(e => (filter === "all" || e.kind === filter) && (!q || `${e.title || ""} ${e.text} ${e.meta || ""}`.toLowerCase().includes(q)));
  }, [query, filter]);

  const clarification = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return null;
    const ambiguous = ["sửa tiếp", "cái đó", "phần đó", "hôm qua", "như cũ"].some(term => q.includes(term));
    if (ambiguous && !clarifiedScope) return { needed: true, reason: "Chưa xác định chính xác phạm vi cần xử lý." };
    return { needed: false, summary: clarifiedScope || (q.includes("audit") ? "Kiểm tra dự án và báo cáo vấn đề" : "Thực hiện yêu cầu theo nội dung đã nhập") };
  }, [draft, clarifiedScope]);
  const usagePlan = useMemo(() => buildUsagePlan(draft), [draft]);
  const providerGuide = providerGuides[credentialProvider];
  const activeProject = projectList.find(project => project.id === activeProjectId) || projectList[0];

  useEffect(() => {
    const savedProjects = localStorage.getItem("minimum-projects");
    if (savedProjects) { try { const parsed = (JSON.parse(savedProjects) as LocalProject[]).map(project => ({ ...project, entries: project.entries.some(entry => entry.id === "security-policy") ? project.entries : [...project.entries, initialEntries.find(entry => entry.id === "security-policy")!] })); setProjectList(parsed); setActiveProjectId(parsed[0]?.id || "pdf"); setEntries(parsed[0]?.entries || []); } catch {} }
    const savedProvider = sessionStorage.getItem("minimum-provider") || "";
    const savedModel = sessionStorage.getItem("minimum-model") || "";
    if (savedProvider && savedModel) { setProvider(savedProvider); setModel(savedModel); }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 20); }
      if (e.key === "Escape") setSearchOpen(false);
      if (searchOpen && e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (searchOpen && e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (searchOpen && e.key === "Enter" && results[selected]) jumpTo(results[selected].id);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, results, selected]);

  useEffect(() => {
    setProjectList(prev => prev.map(project => project.id === activeProjectId ? { ...project, entries } : project));
  }, [entries]);

  useEffect(() => { localStorage.setItem("minimum-projects", JSON.stringify(projectList)); }, [projectList]);

  const selectProject = async (id: string) => {
    const next = projectList.find(project => project.id === id); if (!next) return;
    const handle = folderHandlesRef.current[id] || null;
    setActiveProjectId(id); setEntries(next.entries); setFolderHandle(handle); setWorkspaceFiles([]); setSelectedWorkspaceFile(""); setWorkspaceFileText(""); setPendingPatch(null); setExecutionMode("analyze");
    if (handle) await scanFolder(handle);
  };

  const createProject = () => {
    const name = newProjectName.trim(); if (!name) return;
    const project: LocalProject = { id: `project-${Date.now()}`, name, entries: [] };
    setProjectList(prev => [...prev, project]); setActiveProjectId(project.id); setEntries([]); setNewProjectName(""); setNewProjectOpen(false);
  };

  const scanFolder = async (root: FileSystemDirectoryHandle) => {
    const found: WorkspaceFile[] = []; const allowed = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|sql|log)$/i;
    const walk = async (dir: FileSystemDirectoryHandle, prefix = "") => {
      for await (const [name, handle] of dir.entries()) {
        if (found.length >= 200 || name === "node_modules" || name === ".git" || name === "dist") continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") await walk(handle as FileSystemDirectoryHandle, path);
        else if (allowed.test(name)) found.push({ path, handle: handle as FileSystemFileHandle });
      }
    };
    await walk(root); setWorkspaceFiles(found); return found;
  };

  const chooseFolder = async () => {
    setWorkspaceError("");
    try {
      if (!("showDirectoryPicker" in window)) throw new Error("Trình duyệt này không hỗ trợ chọn folder. Hãy dùng Chrome hoặc Edge desktop.");
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" }) as FileSystemDirectoryHandle;
      folderHandlesRef.current[activeProjectId] = handle; setFolderHandle(handle); const found = await scanFolder(handle);
      setProjectList(prev => prev.map(project => project.id === activeProjectId ? { ...project, folderName: handle.name } : project));
      if (found[0]) await openWorkspaceFile(found[0]);
    } catch (error) { if ((error as DOMException)?.name !== "AbortError") setWorkspaceError(error instanceof Error ? error.message : "Không thể mở folder."); }
  };

  const openWorkspaceFile = async (item: WorkspaceFile) => {
    const file = await item.handle.getFile(); if (file.size > 500_000) { setWorkspaceError("File lớn hơn 500 KB, chưa đưa vào context để tránh vượt chi phí."); return; }
    setSelectedWorkspaceFile(item.path); setWorkspaceFileText(await file.text()); setWorkspaceError("");
  };

  const applyPendingPatch = async () => {
    if (!pendingPatch) return; const item = workspaceFiles.find(file => file.path === pendingPatch.path); if (!item) { setWorkspaceError("Không tìm thấy file đích trong folder đã cấp quyền."); return; }
    try { const writable = await item.handle.createWritable(); await writable.write(pendingPatch.content); await writable.close(); setWorkspaceFileText(pendingPatch.content); setEntries(prev => [...prev, { id: `file-${Date.now()}`, kind: "file", title: pendingPatch.path, text: pendingPatch.summary || "Đã áp dụng thay đổi sau khi user xác nhận.", time: "Vừa xong", meta: "File · Đã ghi thật" }]); setPendingPatch(null); }
    catch { setWorkspaceError("Không thể ghi file. Hãy cấp lại quyền read/write cho folder."); }
  };

  const jumpTo = (id: string) => {
    setSearchOpen(false); setFlash(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    setTimeout(() => setFlash(null), 2200);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if ((!text && !attachments.length) || !provider) { setProvidersOpen(true); return; }
    if (clarification?.needed) return;
    const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: "Vừa xong" };
    setEntries(prev => [...prev, userEntry]); setDraft(""); setSending(true);
    setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
    if (executionMode === "execute" && (!folderHandle || !selectedWorkspaceFile)) { setWorkspaceError("Hãy kết nối folder và chọn một file trước khi yêu cầu thực thi."); setSending(false); return; }
    const executionPolicy = executionMode === "execute" ? `EXECUTION MODE: PATCH_PREVIEW\nReturn ONLY valid JSON: {"path":"${selectedWorkspaceFile}","content":"complete updated file content","summary":"short change summary"}. Never use markdown fences. Modify only the supplied file.` : "EXECUTION MODE: ANALYZE_ONLY (do not claim files were changed)";
    const policy = `${executionPolicy}\nUSAGE PROFILE: ${usagePlan.profile}\nPRIORITY: ${usagePlan.priority}\nTOOL STRATEGY: ${usagePlan.tool}\nVERIFICATION: ${usagePlan.verification}\nSOURCE POLICY: ${usagePlan.source}\nINFERENCE POLICY: ${usagePlan.inference}\nOUTPUT CONTRACT: ${usagePlan.output}`;
    let redactions = 0;
    const files = attachments.map(file => { const safe = redactSecrets(file.text); redactions += safe.count; return `\n\n--- ATTACHED FILE: ${file.name} ---\n${safe.text}`; }).join("");
    const safeWorkspace = redactSecrets(workspaceFileText); redactions += safeWorkspace.count; setLastRedactions(redactions);
    const workspaceContext = executionMode === "execute" ? `\n\n--- WORKSPACE FILE: ${selectedWorkspaceFile} ---\n${safeWorkspace.text}` : "";
    fetch("/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey, model, prompt: `${policy}\n\nUSER GOAL:\n${text || "Phân tích các file đính kèm."}${clarifiedScope ? `\n\nPhạm vi đã làm rõ: ${clarifiedScope}` : ""}${files}${workspaceContext}` }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không thể xử lý yêu cầu."); return data; })
      .then(data => { if (executionMode === "execute") { try { const patch = JSON.parse(data.text) as PendingPatch; if (patch.path !== selectedWorkspaceFile || typeof patch.content !== "string") throw new Error(); setPendingPatch(patch); setEntries(prev => [...prev, { id: `patch-${Date.now()}`, kind: "result", title: "Patch đang chờ xác nhận", text: patch.summary || `Đã tạo bản xem trước cho ${patch.path}. Chưa ghi vào file.`, time: "Vừa xong", meta: "Preview · Chưa áp dụng" }]); } catch { throw new Error("Model không trả patch JSON hợp lệ. File chưa bị thay đổi."); } } else setEntries(prev => [...prev, { id: `ai-${Date.now()}`, kind: "message", role: "ai", text: data.text, time: "Vừa xong" }]); })
      .catch(error => setEntries(prev => [...prev, { id: `error-${Date.now()}`, kind: "result", title: "Yêu cầu thất bại", text: error.message, time: "Vừa xong", meta: `${provider} · Lỗi` }]))
      .finally(() => { setSending(false); setClarifiedScope(""); setAttachments([]); setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30); });
  };

  const attachFiles = async (list: FileList | null) => {
    if (!list) return;
    setUploadError("");
    const allowed = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|sql|log)$/i;
    const picked = Array.from(list).slice(0, 5);
    const invalid = picked.find(file => !allowed.test(file.name) || file.size > 2_000_000);
    if (invalid) { setUploadError(`Không thể đọc ${invalid.name}. Hiện hỗ trợ file text/code tối đa 2 MB.`); return; }
    const loaded = await Promise.all(picked.map(async file => ({ name: file.name, size: file.size, text: await file.text() })));
    setAttachments(prev => [...prev, ...loaded].slice(0, 5));
    if (fileRef.current) fileRef.current.value = "";
  };

  const connectProvider = async () => {
    if (!credentialProvider || !apiKey.trim()) return;
    setConnecting(true); setConnectionError("");
    try {
      const response = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: credentialProvider, apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kết nối thất bại.");
      setAvailableModels(data.models || [data.model]); setModel(data.model);
    } catch (error) { setConnectionError(error instanceof Error ? error.message : "Kết nối thất bại."); }
    finally { setConnecting(false); }
  };

  const saveProvider = () => {
    if (!credentialProvider || !apiKey.trim() || !model) return;
    setProvider(credentialProvider);
    sessionStorage.setItem("minimum-provider", credentialProvider); sessionStorage.setItem("minimum-model", model); sessionStorage.removeItem("minimum-api-key");
    setProvidersOpen(false); setCredentialProvider(""); setAvailableModels([]);
  };

  const disconnectProvider = () => {
    setProvider(""); setModel(""); setApiKey("");
    sessionStorage.removeItem("minimum-provider"); sessionStorage.removeItem("minimum-model"); sessionStorage.removeItem("minimum-api-key");
  };

  return <main className="shell">
    <aside className="projects">
      <div className="brand"><div className="brandmark">M</div><span>Minimum</span></div>
      <button className="new-project" onClick={()=>setNewProjectOpen(true)}><Icon name="plus"/> Dự án mới</button>
      <button className="provider-button" onClick={()=>setProvidersOpen(true)}>⌘ <span>{provider || "Kết nối model"}</span><b>{provider ? "✓" : "0"}</b></button>
      <p className="section-label">DỰ ÁN</p>
      <nav>{projectList.map(project => <button key={project.id} onClick={()=>selectProject(project.id)} className={project.id === activeProjectId ? "project active" : "project"}><span className="project-dot">{project.name[0]}</span><span>{project.name}</span>{project.id === activeProjectId && <span className="live-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button><span>?</span> Trợ giúp</button><div className="profile"><div>HT</div><span><b>Huy Tran</b><small>Local workspace</small></span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">DỰ ÁN</span><h1>{activeProject?.name || "Dự án"} <span>{folderHandle ? folderHandle.name : "Chưa kết nối folder"}</span></h1></div><button className="search-trigger" onClick={() => {setSearchOpen(true); setTimeout(()=>searchRef.current?.focus(), 20)}}><Icon name="search"/><span>Tìm trong dự án...</span><kbd>Ctrl K</kbd></button></header>
      <div className="timeline" id="timeline" ref={timelineRef}>
        <div className="demo-notice"><b>Dữ liệu minh họa</b><span>Timeline bên dưới dùng để trình diễn giao diện, không phải kết quả xử lý thật.</span></div>
        <div className="day"><span>06 THÁNG 8</span></div>
        {entries.map((e, i) => <div key={e.id} id={e.id} className={`entry ${e.kind} ${e.role || ""} ${flash === e.id ? "flash" : ""}`}>
          {e.kind === "message" ? <>
            <div className="avatar">{e.role === "user" ? "HT" : "M"}</div><div className="message-body"><div className="message-head"><b>{e.role === "user" ? "Bạn" : "Minimum"}</b><time>{e.time}</time></div><p>{e.text}</p></div>
          </> : <><div className="rail"><span>{e.kind === "decision" ? "◆" : e.kind === "task" ? "✓" : e.kind === "file" ? "↗" : "●"}</span></div><div className="card"><div className="card-top"><div><small>{e.meta}</small><h3>{e.title}</h3></div><time>{e.time}</time></div><p>{e.text}</p>{e.kind === "task" && i === 9 && <div className="progress"><i/><span>Đang thực thi</span></div>}</div></>}
        </div>)}
      </div>
      <div className="composer-wrap">
        {draft.trim() && <div className="usage-plan"><div className="usage-plan-head"><span>USAGE PROFILE</span><b>{usagePlan.profile}</b><em>Risk: {usagePlan.risk}</em></div><div className="usage-grid"><div><small>ƯU TIÊN</small><b>{usagePlan.priority}</b></div><div><small>CÔNG CỤ</small><b>{usagePlan.tool}</b></div><div><small>KIỂM CHỨNG</small><b>{usagePlan.verification}</b></div><div><small>OUTPUT</small><b>{usagePlan.output}</b></div></div><p>✓ Fact cần nguồn · ✓ Suy luận phải gắn nhãn · ✓ Tự chọn tool trước khi chọn model <span>Phân tích cục bộ · 0 token</span></p></div>}
        {clarification && (clarification.needed ? <div className="clarify-card"><div className="clarify-head"><span>?</span><div><b>Cần làm rõ trước khi thực hiện</b><small>{clarification.reason} · Rule cục bộ · 0 token</small></div><em>Auto</em></div><p>Bạn muốn tiếp tục phần nào?</p><div className="clarify-options"><button onClick={()=>setClarifiedScope("Sửa căn chỉnh ô gộp sát lề phải")}>Căn chỉnh ô gộp <small>Đề xuất</small></button><button onClick={()=>setClarifiedScope("Sửa đường viền của bảng")}>Đường viền bảng</button><button onClick={()=>setClarifiedScope("Kiểm tra cả căn chỉnh và đường viền")}>Cả hai</button></div><div className="kept-constraint">✓ Giữ nguyên ràng buộc: không sửa module OCR</div></div> : <div className="task-preview"><span>✓</span><p><b>Đã hiểu yêu cầu</b> {clarification.summary}</p><button onClick={()=>setClarifiedScope("")}>Chỉnh lại</button></div>)}
        {!provider ? <div className="connection-warning"><span>!</span><p><b>Chưa có model được kết nối</b> Hãy nhập API key để bắt đầu xử lý thật.</p><button onClick={()=>setProvidersOpen(true)}>Kết nối model</button></div> : <div className="connected-bar"><span>✓</span><p><b>{provider}</b> · {model}</p><button onClick={disconnectProvider}>Ngắt kết nối</button></div>}
        <div className="execution-mode"><div><b>{executionMode === "execute" ? "Thực thi có xác nhận" : "Chat & phân tích"}</b><span>{executionMode === "execute" ? `Tạo patch cho ${selectedWorkspaceFile || "file đã chọn"}; chỉ ghi sau khi bạn duyệt` : "Đọc file đính kèm và trả kết quả trong timeline"}</span></div><button disabled={!folderHandle} onClick={()=>setExecutionMode(mode=>mode === "analyze" ? "execute" : "analyze")}>{executionMode === "execute" ? "Chuyển sang Analyze" : folderHandle ? "Bật Execute" : "Kết nối folder để Execute"}</button></div>{pendingPatch&&<div className="patch-preview"><div><b>Patch chờ duyệt · {pendingPatch.path}</b><span>{pendingPatch.summary}</span></div><button onClick={()=>setPendingPatch(null)}>Hủy</button><button className="apply" onClick={applyPendingPatch}>Áp dụng vào file</button></div>}{attachments.length>0&&<div className="attachment-list">{attachments.map(file=><span key={file.name}>↗ {file.name} <small>{Math.ceil(file.size/1024)} KB</small><button onClick={()=>setAttachments(prev=>prev.filter(item=>item.name!==file.name))}>×</button></span>)}</div>}{uploadError&&<div className="upload-error">{uploadError}</div>}<div className="composer"><textarea aria-label="Nhập yêu cầu" value={draft} onChange={e=>{setDraft(e.target.value);setClarifiedScope("")}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder={provider ? "Nêu mục tiêu hoặc đính kèm file để phân tích..." : "Kết nối model trước khi gửi yêu cầu..."}/><div className="composer-actions"><div><select aria-label="Chọn hãng hoặc model" value={provider || ""} disabled><option>{provider ? `${provider} · ${model}` : "Chưa có model"}</option></select><input ref={fileRef} className="file-input" type="file" multiple accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.log,text/*" onChange={e=>attachFiles(e.target.files)}/><button onClick={()=>fileRef.current?.click()}>＋ Đính kèm file</button><button className="context-on"><i/> Context tự động</button></div><button className="send" aria-label="Gửi" onClick={sendMessage} disabled={!provider || (!draft.trim()&&!attachments.length) || sending || Boolean(clarification?.needed)}><Icon name="send"/></button></div></div><p>Clarification: Auto · Execute luôn yêu cầu duyệt trước khi ghi file</p>
      </div>
    </section>

    <aside className="brain"><div className="brain-title"><Icon name="brain"/><div><span>BỘ NHỚ DỰ ÁN</span><b>Đang đồng bộ</b></div><i/></div><div className="brain-tabs"><button className="active">Hiện tại</button><button>Bộ nhớ</button><button>Sử dụng</button></div>
      <section><label>SECURITY GATE</label><div className="security-status"><b>✓ Local-first protection</b><span>API key chỉ ở bộ nhớ tab</span><span>Secret tự động được che trước khi gửi</span><span>File chỉ ghi sau khi bạn xác nhận</span>{lastRedactions>0&&<em>Đã che {lastRedactions} secret trong request gần nhất</em>}</div></section><section><label>WORKSPACE FOLDER</label><button className="folder-connect" onClick={chooseFolder}>{folderHandle ? `✓ ${folderHandle.name}` : "＋ Chọn folder trên máy"}</button>{workspaceError&&<p className="workspace-error">{workspaceError}</p>}<div className="workspace-files">{workspaceFiles.slice(0,40).map(file=><button key={file.path} className={selectedWorkspaceFile===file.path?"active":""} onClick={()=>openWorkspaceFile(file)}>↗ {file.path}</button>)}{folderHandle&&!workspaceFiles.length&&<small>Không tìm thấy file text/code được hỗ trợ.</small>}</div></section><section><label>CẤU HÌNH SỬ DỤNG AI</label><div className="state-card"><span className="pulse"/><div><b>{draft.trim() ? usagePlan.profile : "Auto profile"}</b><small>{draft.trim() ? usagePlan.tool : "Nêu mục tiêu, hệ thống tự cấu hình"}</small></div></div></section>
      <section><div className="section-row"><label>RÀNG BUỘC ĐANG ÁP DỤNG</label><span>2</span></div><div className="memory-item"><i>!</i><p>Không sửa module OCR khi xử lý bảng DOCX.</p></div><div className="memory-item"><i>⌁</i><p>Phần tính toán hình học phải tách khỏi OCR.</p></div></section>
      <section><div className="section-row"><label>CONTEXT CỦA YÊU CẦU NÀY</label><button>Kiểm tra</button></div><div className="metric"><span>Context đã chọn</span><b>4,218 <small>token</small></b></div><div className="bar"><i/></div><div className="saved"><span>Context đã tránh</span><b>83.8%</b></div><div className="sources"><span>2 quyết định</span><span>3 symbol</span><span>1 kiểm thử</span></div></section>
      <section><label>QUYẾT ĐỊNH GẦN ĐÂY</label><button className="decision-link"><i/> Use MinerU for layout detection <Icon name="chevron"/></button></section>
      <button className="inspect-memory"><Icon name="brain"/> Kiểm tra bộ nhớ dự án</button>
    </aside>

    {searchOpen && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSearchOpen(false)}><div className="search-panel">
      <div className="search-input"><Icon name="search"/><input ref={searchRef} value={query} onChange={e => {setQuery(e.target.value);setSelected(0)}} placeholder="Tìm tin nhắn, task, quyết định hoặc file..."/><button onClick={()=>setSearchOpen(false)}><Icon name="close"/></button></div>
      <div className="filter-row">{filters.map(f => <button key={f.value} className={filter === f.value ? "active" : ""} onClick={()=>{setFilter(f.value);setSelected(0)}}>{f.label}</button>)}</div>
      <div className="results"><div className="results-head"><span>{query ? `${results.length} KẾT QUẢ` : "NỘI DUNG GẦN ĐÂY"}</span><small>↑↓ để chọn · Enter để mở</small></div>
        {results.length ? results.map((r, i) => <button key={r.id} className={i === selected ? "result selected" : "result"} onMouseEnter={()=>setSelected(i)} onClick={()=>jumpTo(r.id)}><span className={`result-icon ${r.kind}`}>{r.kind === "decision" ? "◆" : r.kind === "task" ? "✓" : r.kind === "file" ? "↗" : r.kind === "result" ? "●" : r.role === "user" ? "HT" : "M"}</span><span className="result-copy"><span><b>{highlight(r.title || (r.role === "user" ? "Bạn" : "Minimum"), query)}</b><time>{r.time}</time></span><p>{highlight(r.text, query)}</p><small>{r.meta || (r.kind === "message" ? "Message · PDF Converter" : r.kind)}</small></span><Icon name="chevron"/></button>) : <div className="empty"><Icon name="search"/><b>Không tìm thấy nội dung phù hợp</b><span>Thử từ khóa ngắn hơn hoặc chọn bộ lọc khác.</span></div>}
      </div><footer><span><kbd>↵</kbd> Mở trong timeline</span><span><kbd>Esc</kbd> Đóng</span><button>Hỏi AI về lịch sử →</button></footer>
    </div></div>}
    {providersOpen && <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setProvidersOpen(false)}><div className="provider-modal"><header><div><small>KẾT NỐI MODEL</small><h2>Một key, nhiều model</h2><p>Khuyến nghị OpenRouter để dùng nhiều hãng qua một kết nối duy nhất.</p></div><button onClick={()=>setProvidersOpen(false)}><Icon name="close"/></button></header><div className="provider-list"><div className="router-callout"><b>Khuyến nghị · OpenRouter</b><span>Một API key cho Gemini, Claude, GPT, DeepSeek, Qwen, Kimi và nhiều model khác.</span><button onClick={()=>{setCredentialProvider("OpenRouter");setApiKey("");setModel("");setAvailableModels([]);setConnectionError("")}}>Dùng OpenRouter</button></div>{[
      ["OpenAI", "GPT models", "API key"], ["Anthropic", "Claude models", "API key"], ["Google", "Gemini models", "API key"],
      ["DeepSeek", "DeepSeek Chat & Reasoner", "API key"], ["Qwen", "Alibaba Cloud Model Studio", "DashScope key"],
      ["Kimi", "Moonshot AI models", "API key"], ["OpenRouter", "Nhiều hãng qua một key", "Khuyến nghị"]
    ].map(([name,desc,method])=><div className={`provider-row ${credentialProvider===name?"chosen":""}`} key={name}><span className="provider-logo">{name[0]}</span><div><b>{name}</b><small>{desc} · {method}</small></div><button onClick={()=>{setCredentialProvider(name);setApiKey("");setModel("");setAvailableModels([]);setConnectionError("")}}>{provider===name?"Kết nối lại":"Chọn"}</button></div>)}<div className="provider-row local-row"><span className="provider-logo">9</span><div><b>9Router · Local gateway</b><small>Quản lý key, subscription và fallback tại localhost:20128</small></div><button disabled>Cần Companion</button></div>{providerGuide && <div className="key-guide"><div><b>Lấy API key {credentialProvider} trong 3 bước</b><ol><li>Mở trang chính thức bằng nút bên dưới và đăng nhập.</li><li>Tạo key mới, đặt tên “Minimum”, rồi sao chép.</li><li>Quay lại đây, dán key và nhấn “Kiểm tra key”.</li></ol></div><div className="key-guide-actions"><a href={providerGuide.keyUrl} target="_blank" rel="noreferrer">{providerGuide.keyLabel || "Mở trang API key"} ↗</a><a href={providerGuide.billingUrl} target="_blank" rel="noreferrer">Billing / Credit ↗</a></div><small>{providerGuide.note} Không gửi key qua chat hoặc lưu vào project.</small></div>}{credentialProvider && <div className="credential-form"><label>API key của {credentialProvider}</label><div><input type="password" value={apiKey} onChange={e=>{setApiKey(e.target.value);setAvailableModels([])}} placeholder="Dán API key tại đây" autoComplete="off"/><button onClick={connectProvider} disabled={!apiKey.trim()||connecting}>{connecting?"Đang kiểm tra...":"Kiểm tra key"}</button></div><small>Key chỉ tồn tại trong phiên tab này; không lưu vào project hay database.</small>{availableModels.length>0&&<div className="model-picker"><label>Chọn model</label><select value={model} onChange={e=>setModel(e.target.value)}>{availableModels.map(item=><option value={item} key={item}>{item}</option>)}</select><button onClick={saveProvider}>Lưu & kết nối</button></div>}{connectionError&&<p>{connectionError}</p>}</div>}</div><footer><span>OpenRouter chạy ngay; 9Router cần Local Companion để website gọi máy bạn an toàn.</span><button onClick={()=>setProvidersOpen(false)}>Đóng</button></footer></div></div>}
    {newProjectOpen&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setNewProjectOpen(false)}><div className="new-project-modal"><h2>Tạo dự án mới</h2><p>Mỗi dự án có lịch sử và folder làm việc riêng trên thiết bị này.</p><label>Tên dự án</label><input autoFocus value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createProject()} placeholder="Ví dụ: Research Paper"/><div><button onClick={()=>setNewProjectOpen(false)}>Hủy</button><button className="primary" onClick={createProject} disabled={!newProjectName.trim()}>Tạo dự án</button></div></div></div>}
  </main>;
}
