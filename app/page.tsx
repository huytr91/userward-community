"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "message" | "task" | "decision" | "result" | "file";
type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };
type Entry = { id: string; kind: Kind; title?: string; text: string; time: string; meta?: string; role?: "user" | "ai"; usage?: TokenUsage };
type Attachment = { name: string; size: number; text?: string; dataUrl?: string; mime?: string };
type LocalProject = { id: string; name: string; kind?: "chat" | "project"; folderName?: string; entries: Entry[] };
type WorkspaceFile = { path: string; handle: FileSystemFileHandle };
type PatchFile = { path: string; content: string; operation: "create" | "update" };
type PendingPatch = { files: PatchFile[]; summary: string };
type InterviewQuestion = { id: string; label: string; ask: string; options: string[]; multi?: boolean };

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
  { id: "pdf", name: "PDF Converter", entries: initialEntries.filter(entry => entry.id === "security-policy") },
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
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string,string>>({});
  const [clarificationOverride, setClarificationOverride] = useState("");
  const [commentingEntry, setCommentingEntry] = useState("");
  const [entryComments, setEntryComments] = useState<Record<string,string>>({});
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(true);
  const [credentialProvider, setCredentialProvider] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [budgetTier, setBudgetTier] = useState<"economy" | "balanced" | "quality">("balanced");
  const [projectBriefConfirmed, setProjectBriefConfirmed] = useState(false);
  const [lastBudgetMode, setLastBudgetMode] = useState<"free-first" | "economy" | "balanced" | "quality">("balanced");
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
  const interviewQuestions = useMemo(() => {
    const q = draft.toLowerCase();
    const actionable = /tạo|làm|sửa|xây|viết|chạy|tự động|automation|workflow|phân tích/.test(q);
    if (!actionable) return [];
    const questions: InterviewQuestion[] = [];
    const emailFlow = /email|gmail|outlook|inbox|imap/.test(q);
    const softwareFlow = /app|ứng dụng|website|phần mềm|code|script/.test(q);
    if (softwareFlow && !/web|mobile|ios|android|desktop|windows|macos/.test(q)) questions.push({ id: "platform", label: "Ứng dụng chạy ở đâu?", ask: "Chọn một nền tảng; không cần mô tả bằng câu.", options: ["Web", "Mobile", "Desktop", "Chưa xác định"] });
    if (/âm lịch|lịch âm/.test(q) && !/đổi ngày|ngày tốt|nhắc lịch|sự kiện/.test(q)) questions.push({ id: "features", label: "Cần những chức năng nào?", ask: "Có thể tích nhiều lựa chọn.", options: ["Xem lịch âm", "Đổi Dương ↔ Âm", "Ngày tốt/xấu", "Nhắc lịch/sự kiện"], multi: true });
    if (softwareFlow && !/cá nhân|gia đình|doanh nghiệp|nội bộ|khách hàng|người dùng/.test(q)) questions.push({ id: "audience", label: "Ai sẽ sử dụng?", ask: "Chọn nhóm gần đúng nhất.", options: ["Cá nhân", "Gia đình", "Nội bộ công ty", "Người dùng công khai"] });
    if (emailFlow && !/gmail|outlook|imap|email nguồn/.test(q)) questions.push({ id: "source", label: "Email lấy từ đâu?", ask: "Không rõ thì chọn “Chưa xác định”, app sẽ không tự đoán.", options: ["Gmail", "Outlook", "Email công ty", "Chưa xác định"] });
    if (emailFlow && (!/folder|thư mục/.test(q) || !/[a-z]:\\|onedrive|google drive|sharepoint/i.test(draft))) questions.push({ id: "destination", label: "Muốn lưu ở đâu?", ask: "Chọn nơi kết quả cần xuất hiện.", options: ["Folder trên máy", "Google Drive", "OneDrive", "Chưa xác định"] });
    if (/tự động|automation|workflow|email|inbox/.test(q) && !/mỗi |hàng |khi có|theo giờ|ngày|tuần|bấm chạy/.test(q)) questions.push({ id: "schedule", label: "Khi nào cần chạy?", ask: "Chọn cách vận hành mong muốn.", options: ["Khi tôi bấm chạy", "Khi có dữ liệu mới", "Mỗi ngày", "Chưa xác định"] });
    if (emailFlow && !/pdf|excel|xlsx|eml|đính kèm|nội dung|tiêu đề|subject|người gửi|toàn bộ email/.test(q)) questions.push({ id: "scope", label: "Kết quả cần chứa gì?", ask: "Chọn phương án gần đúng nhất.", options: ["Toàn bộ email", "Chỉ file đính kèm", "Nội dung + file", "Chưa xác định"] });
    if (executionMode === "execute" && !/được sửa|không sửa|ghi đè|tạo mới|giữ nguyên/.test(q)) questions.push({ id: "existing", label: "Có được sửa file hiện có không?", ask: "Nếu chọn Không, app chỉ được tạo file mới.", options: ["Có", "Không"] });
    return questions.slice(0, 4);
  }, [draft, executionMode]);
  const interviewComplete = interviewQuestions.length === 0 || interviewQuestions.every(question => interviewAnswers[question.id]?.trim()) || Boolean(clarificationOverride.trim());
  const usagePlan = useMemo(() => buildUsagePlan(draft), [draft]);
  const projectIntent = useMemo(() => { const q=draft.toLowerCase(); const active=Boolean(draft.trim())&&(executionMode==="execute"||/(tạo|xây|làm|viết|sản xuất|phát triển).*(video|website|app|ứng dụng|phần mềm|script|code|dự án|automation|workflow|nghiên cứu|báo cáo)/.test(q)); const type=/video|clip|phim/.test(q)?"Sản xuất video":/code|script|website|app|phần mềm/.test(q)?"Phát triển phần mềm":/nghiên cứu|báo cáo|dữ liệu/.test(q)?"Nghiên cứu & dữ liệu":"Dự án nhiều bước"; const strategy=type==="Sản xuất video"?"Model mạnh lập brief/storyboard · model chuyên dụng tạo media · model rẻ tạo biến thể":type==="Phát triển phần mềm"?"Model coding lập kế hoạch và tạo patch · công cụ chạy test · model rẻ cho việc lặp lại":"Model mạnh cho quyết định · công cụ xác minh · model rẻ cho tổng hợp"; const expensive=/video|clip|phim|hình ảnh|audio|giọng nói|toàn bộ repo|production|pháp lý|tài chính|y tế|nghiên cứu chuyên sâu|nhiều phiên bản|ứng dụng|\bapp\b|website/.test(q); const explicitlySmall=/dự án nhỏ|app nhỏ|tool nhỏ|script ngắn|đơn giản|demo|prototype|thử nghiệm|một file|1 file/.test(q); const freeEligible=active&&explicitlySmall&&!expensive; return {active,type,strategy,freeEligible}; },[draft,executionMode]);
  const providerGuide = providerGuides[credentialProvider];
  const activeProject = projectList.find(project => project.id === activeProjectId) || projectList[0];
  const tokenStats = useMemo(() => { const measured = entries.filter(entry=>entry.usage?.totalTokens); const total = measured.reduce((sum,entry)=>sum+(entry.usage?.totalTokens||0),0); const input = measured.reduce((sum,entry)=>sum+(entry.usage?.promptTokens||0),0); const output = measured.reduce((sum,entry)=>sum+(entry.usage?.completionTokens||0),0); const cost = measured.reduce((sum,entry)=>sum+(entry.usage?.cost||0),0); const top = [...measured].sort((a,b)=>(b.usage?.totalTokens||0)-(a.usage?.totalTokens||0))[0]; return { total, input, output, cost, top, measured: measured.length }; }, [entries]);
  useEffect(() => { setProjectBriefConfirmed(false); }, [draft]);

  useEffect(() => {
    const savedProjects = localStorage.getItem("minimum-projects");
    if (savedProjects) { try { const demoIds = new Set(["m1","d1","t1","m2","d2","t2","f1","r1","m3","t3","m4"]); const parsed = (JSON.parse(savedProjects) as LocalProject[]).map(project => { const realEntries = project.entries.filter(entry => !demoIds.has(entry.id)); return { ...project, entries: realEntries.some(entry => entry.id === "security-policy") ? realEntries : [...realEntries, initialEntries.find(entry => entry.id === "security-policy")!] }; }); setProjectList(parsed); setActiveProjectId(parsed[0]?.id || "pdf"); setEntries(parsed[0]?.entries || []); } catch {} }
    const savedConnection = localStorage.getItem("minimum-provider-connection");
    if (savedConnection) { try { const saved = JSON.parse(savedConnection) as { provider?: string; model?: string; apiKey?: string }; if (saved.provider && saved.model && saved.apiKey) { setProvider(saved.provider); setCredentialProvider(saved.provider); setModel(saved.model); setApiKey(saved.apiKey); setRememberKey(true); } } catch { localStorage.removeItem("minimum-provider-connection"); } }
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
    const project: LocalProject = { id: `project-${Date.now()}`, name, kind: "project", entries: [] };
    setProjectList(prev => [...prev, project]); setActiveProjectId(project.id); setEntries([]); setNewProjectName(""); setNewProjectOpen(false);
  };

  const createChat = () => {
    const now = new Date();
    const chat: LocalProject = { id: `chat-${Date.now()}`, name: `Chat ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`, kind: "chat", entries: [] };
    setProjectList(prev => [...prev, chat]); setActiveProjectId(chat.id); setEntries([]); setFolderHandle(null); setWorkspaceFiles([]); setSelectedWorkspaceFile(""); setWorkspaceFileText(""); setPendingPatch(null); setExecutionMode("analyze");
    setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),20);
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
      folderHandlesRef.current[activeProjectId] = handle; setFolderHandle(handle); setExecutionMode("execute"); const found = await scanFolder(handle);
      setProjectList(prev => prev.map(project => project.id === activeProjectId ? { ...project, folderName: handle.name } : project));
      if (found[0]) await openWorkspaceFile(found[0]);
    } catch (error) { if ((error as DOMException)?.name !== "AbortError") setWorkspaceError(error instanceof Error ? error.message : "Không thể mở folder."); }
  };

  const openWorkspaceFile = async (item: WorkspaceFile) => {
    const file = await item.handle.getFile(); if (file.size > 500_000) { setWorkspaceError("File lớn hơn 500 KB, chưa đưa vào context để tránh vượt chi phí."); return; }
    setSelectedWorkspaceFile(item.path); setWorkspaceFileText(await file.text()); setWorkspaceError("");
  };

  const applyPendingPatch = async () => {
    if (!pendingPatch || !folderHandle) return;
    try {
      for (const change of pendingPatch.files) {
        const parts = change.path.replace(/\\/g,"/").split("/").filter(Boolean);
        if (!parts.length || change.path.startsWith("/") || /^[A-Za-z]:/.test(change.path) || parts.includes("..")) throw new Error("unsafe_path");
        let dir = folderHandle;
        for (const segment of parts.slice(0,-1)) dir = await dir.getDirectoryHandle(segment, { create: true });
        const fileHandle = await dir.getFileHandle(parts.at(-1)!, { create: true });
        const writable = await fileHandle.createWritable(); await writable.write(change.content); await writable.close();
      }
      await scanFolder(folderHandle);
      setEntries(prev => [...prev, { id: `file-${Date.now()}`, kind: "file", title: `${pendingPatch.files.length} file đã cập nhật`, text: pendingPatch.summary || "Đã áp dụng thay đổi sau khi user xác nhận.", time: "Vừa xong", meta: "Project · Đã ghi thật" }]); setPendingPatch(null);
    }
    catch { setWorkspaceError("Không thể ghi file. Hãy cấp lại quyền read/write cho folder."); }
  };

  const jumpTo = (id: string) => {
    setSearchOpen(false); setFlash(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    setTimeout(() => setFlash(null), 2200);
  };

  const sendMessage = (briefApproval?: unknown, directText?: string, replyContext?: string) => {
    const briefApproved = briefApproval === true;
    const text = (directText ?? draft).trim();
    const inlineReply = Boolean(directText?.trim());
    const requestsRenderedVideo = /mp4|video\s+trực\s+tiếp|render\s+(?:file\s+)?video|xuất\s+(?:file\s+)?video/i.test(text);
    if (text && requestsRenderedVideo) {
      const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: "Vừa xong" };
      const capabilityEntry: Entry = { id: `capability-${Date.now()}`, kind: "result", title: "Không thể tạo MP4 trực tiếp", text: "Cấu hình hiện tại chỉ kết nối model văn bản và công cụ tạo/sửa file dự án; chưa có video-generation hoặc video-rendering tool để xuất file MP4 thật. App có thể tạo storyboard, lời thoại, shot list hoặc script dựng video. Muốn xuất MP4 cần kết nối thêm một dịch vụ tạo video/render chuyên dụng.", time: "Vừa xong", meta: "Giới hạn khả năng · Không gọi model · 0 token" };
      setEntries(prev => [...prev, userEntry, capabilityEntry]);
      setDraft(""); setUploadError("");
      setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
      return;
    }
    if ((!text && !attachments.length) || !provider) { setProvidersOpen(true); return; }
    if (!inlineReply && (clarification?.needed || !interviewComplete || (projectIntent.active && !projectBriefConfirmed && !briefApproved))) { if (projectIntent.active && !projectBriefConfirmed && !briefApproved) setUploadError("Hãy trả lời câu hỏi bằng cách tích chọn hoặc nhập phương án khác, rồi xác nhận Project Brief trước khi thực hiện."); return; }
    const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: "Vừa xong" };
    setEntries(prev => [...prev, userEntry]); setDraft(""); setSending(true);
    setLastBudgetMode(projectIntent.freeEligible?"free-first":budgetTier);
    setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
    if (executionMode === "execute" && !folderHandle) { setWorkspaceError("Hãy kết nối folder trước khi yêu cầu tạo hoặc sửa project."); setSending(false); return; }
    const executionPolicy = executionMode === "execute" ? `EXECUTION MODE: PROJECT_PATCH_PREVIEW\nReturn ONLY valid JSON: {"summary":"short summary","files":[{"path":"relative/path.ext","operation":"create or update","content":"complete file content"}]}. Never use markdown fences. Paths must be relative to the approved workspace. You may create a complete small project with multiple files. Do not claim files were written.` : "EXECUTION MODE: ANALYZE_ONLY (do not claim files were changed)";
    const policy = `${executionPolicy}\nUSAGE PROFILE: ${usagePlan.profile}\nPRIORITY: ${usagePlan.priority}\nTOOL STRATEGY: ${usagePlan.tool}\nPROJECT TYPE: ${projectIntent.type}\nROUTING STRATEGY: ${projectIntent.strategy}\nBUDGET MODE: ${projectIntent.freeEligible?"FREE_FIRST — prefer capable free models; never silently upgrade to paid":budgetTier}\nVERIFICATION: ${usagePlan.verification}\nSOURCE POLICY: ${usagePlan.source}\nINFERENCE POLICY: ${usagePlan.inference}\nOUTPUT CONTRACT: ${usagePlan.output}\nCAPABILITY HONESTY: Never claim to have created, rendered, uploaded, sent, published, executed, or changed anything unless the connected tool actually performed that action and returned evidence. If the requested artifact or action is unsupported, state that plainly before offering supported alternatives.\nZERO-ASSUMPTION POLICY: Never invent or silently assume missing business requirements, inputs, outputs, destinations, permissions, schedules, constraints, or acceptance criteria. Stop and request clarification when any of these can materially change the result. Ask only plain-language questions with choices or Yes/No; never ask the end user to select libraries, frameworks, APIs, architecture, or test tools. Technical defaults are allowed only after business scope is confirmed and must be stated explicitly. USER OVERRIDE POLICY: A free-form answer written by the user has higher priority than AI-suggested choices whenever they conflict.`;
    let redactions = 0;
    const files = attachments.filter(file=>file.text!==undefined).map(file => { const safe = redactSecrets(file.text || ""); redactions += safe.count; return `\n\n--- ATTACHED FILE: ${file.name} ---\n${safe.text}`; }).join("");
    const binaryAttachments = attachments.filter(file=>file.dataUrl).map(file=>({ name:file.name, dataUrl:file.dataUrl!, mime:file.mime! }));
    const safeWorkspace = redactSecrets(workspaceFileText); redactions += safeWorkspace.count; setLastRedactions(redactions);
    const workspaceContext = executionMode === "execute" ? `\n\n--- WORKSPACE FILE: ${selectedWorkspaceFile} ---\n${safeWorkspace.text}` : "";
    const selectedAnswers = interviewQuestions.filter(question=>interviewAnswers[question.id]?.trim()).map(question=>`${question.label}: ${interviewAnswers[question.id]}`);
    const interviewParts = [selectedAnswers.length ? `CLARIFICATION ANSWERS:\n${selectedAnswers.join("\n")}` : "", clarificationOverride.trim() ? `USER OVERRIDE (HIGHEST PRIORITY):\n${clarificationOverride.trim()}` : ""].filter(Boolean);
    const interview = interviewParts.length ? `\n\n${interviewParts.join("\n\n")}` : "";
    fetch("/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey, model: provider==="OpenRouter"&&projectIntent.freeEligible?"openrouter/free":model, executionMode, attachments: binaryAttachments, maxOutputTokens: executionMode === "execute" ? 7000 : 1800, prompt: `${policy}${replyContext ? `\n\nRESULT BEING COMMENTED ON:\n${replyContext}` : ""}\n\nUSER GOAL${replyContext ? " / DIRECT COMMENT" : ""}:\n${text || "Phân tích các file đính kèm."}${clarifiedScope ? `\n\nPhạm vi đã làm rõ: ${clarifiedScope}` : ""}${interview}${files}${workspaceContext}` }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không thể xử lý yêu cầu."); return data; })
      .then(data => { if (executionMode === "execute") { try { const clean = String(data.text).replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""); const patch = JSON.parse(clean) as PendingPatch; if (!Array.isArray(patch.files) || !patch.files.length || patch.files.some(file=>typeof file.path!=="string"||typeof file.content!=="string")) throw new Error(); setPendingPatch(patch); setEntries(prev => [...prev, { id: `patch-${Date.now()}`, kind: "result", title: `${patch.files.length} file đang chờ xác nhận`, text: patch.summary || "Đã tạo project patch. Chưa ghi vào folder.", time: "Vừa xong", meta: "Preview · Chưa áp dụng", usage: data.usage }]); } catch { throw new Error("Model không trả project patch hợp lệ. Không có file nào bị thay đổi; hãy thử lại hoặc chọn model khác."); } } else setEntries(prev => [...prev, { id: `ai-${Date.now()}`, kind: "message", role: "ai", text: data.text, time: "Vừa xong", usage: data.usage }]); })
      .catch(error => setEntries(prev => [...prev, { id: `error-${Date.now()}`, kind: "result", title: "Yêu cầu thất bại", text: error.message, time: "Vừa xong", meta: `${provider} · Lỗi` }]))
      .finally(() => { setSending(false); setClarifiedScope(""); setInterviewAnswers({}); setClarificationOverride(""); setCommentingEntry(""); setAttachments([]); setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30); });
  };

  const submitEntryComment = (entry: Entry) => {
    const comment = (entryComments[entry.id] || "").trim();
    if (!comment || sending) return;
    setEntryComments(prev => ({ ...prev, [entry.id]: "" }));
    sendMessage(false, comment, `${entry.title ? `${entry.title}\n` : ""}${entry.text}`);
  };

  const attachFiles = async (list: FileList | null) => {
    if (!list) return;
    setUploadError("");
    const textAllowed = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|sql|log)$/i;
    const binaryAllowed = /\.(pdf|png|jpe?g|webp|gif)$/i;
    const picked = Array.from(list).slice(0, 5);
    const invalid = picked.find(file => (!textAllowed.test(file.name) && !binaryAllowed.test(file.name)) || file.size > (binaryAllowed.test(file.name) ? 10_000_000 : 5_000_000));
    if (invalid) { setUploadError(`Không thể đọc ${invalid.name}. Text/code tối đa 5 MB; PDF/ảnh tối đa 10 MB.`); return; }
    const loaded = await Promise.all(picked.map(async file => binaryAllowed.test(file.name) ? await new Promise<Attachment>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve({name:file.name,size:file.size,dataUrl:String(reader.result),mime:file.type||"application/octet-stream"}); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }) : ({ name: file.name, size: file.size, text: await file.text(), mime:file.type||"text/plain" })));
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
    if (rememberKey) localStorage.setItem("minimum-provider-connection", JSON.stringify({ provider: credentialProvider, model, apiKey }));
    else localStorage.removeItem("minimum-provider-connection");
    setProvidersOpen(false); setCredentialProvider(""); setAvailableModels([]);
  };

  const disconnectProvider = () => {
    setProvider(""); setModel(""); setApiKey("");
    localStorage.removeItem("minimum-provider-connection");
  };

  return <main className="shell">
    <aside className="projects">
      <div className="brand"><div className="brandmark">M</div><span>Minimum</span></div>
      <button className="new-project" onClick={createChat}><Icon name="plus"/> Chat mới</button>
      <button className="new-project-link" onClick={()=>setNewProjectOpen(true)}>＋ Tạo dự án có folder</button>
      <button className="provider-button" onClick={()=>setProvidersOpen(true)}>⌘ <span>{provider || "Kết nối model"}</span><b>{provider ? "✓" : "0"}</b></button>
      <p className="section-label">LỊCH SỬ</p>
      <nav>{projectList.map(project => <button key={project.id} onClick={()=>selectProject(project.id)} className={project.id === activeProjectId ? "project active" : "project"}><span className="project-dot">{project.name[0]}</span><span>{project.name}</span>{project.id === activeProjectId && <span className="live-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button><span>?</span> Trợ giúp</button><div className="profile"><div>HT</div><span><b>Huy Tran</b><small>Local workspace</small></span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">DỰ ÁN</span><h1>{activeProject?.name || "Dự án"} <span>{folderHandle ? folderHandle.name : "Chưa kết nối folder"}</span></h1></div><button className="search-trigger" onClick={() => {setSearchOpen(true); setTimeout(()=>searchRef.current?.focus(), 20)}}><Icon name="search"/><span>Tìm trong dự án...</span><kbd>Ctrl K</kbd></button></header>
      <div className="timeline" id="timeline" ref={timelineRef}>
        {!entries.length&&<div className="empty-project"><b>Bạn muốn bắt đầu thế nào?</b><span>Chat để hỏi đáp bình thường, hoặc cho phép app tạo và sửa file trong một folder.</span><div className="empty-actions"><button onClick={()=>{setExecutionMode("analyze");if(!provider)setProvidersOpen(true);else setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),20)}}><strong>Chat thường</strong><small>Hỏi đáp, phân tích và đính kèm tài liệu</small></button><button onClick={chooseFolder}><strong>Làm việc với dự án</strong><small>Chọn folder để tạo hoặc sửa file</small></button></div></div>}
        {entries.map((e, i) => <div key={e.id} id={e.id} className={`entry ${e.kind} ${e.role || ""} ${flash === e.id ? "flash" : ""}`}>
          {e.kind === "message" ? <>
            <div className="avatar">{e.role === "user" ? "HT" : "M"}</div><div className="message-body"><div className="message-head"><b>{e.role === "user" ? "Bạn" : "Minimum"}</b><time>{e.time}</time></div><p>{e.text}</p>{e.role==="ai"&&<div className="entry-feedback"><button type="button" onClick={()=>setCommentingEntry(commentingEntry===e.id?"":e.id)}>✎ Nhận xét kết quả này</button>{commentingEntry===e.id&&<div className="entry-comment-box"><textarea autoFocus value={entryComments[e.id]||""} onChange={event=>setEntryComments(prev=>({...prev,[e.id]:event.target.value}))} placeholder="Gõ điều cần sửa, bổ sung hoặc phương án bạn muốn…"/><div><button type="button" onClick={()=>setCommentingEntry("")}>Hủy</button><button type="button" className="submit-comment" disabled={sending||!(entryComments[e.id]||"").trim()} onClick={()=>submitEntryComment(e)}>Gửi nhận xét</button></div></div>}</div>}</div>
          </> : <><div className="rail"><span>{e.kind === "decision" ? "◆" : e.kind === "task" ? "✓" : e.kind === "file" ? "↗" : "●"}</span></div><div className="card"><div className="card-top"><div><small>{e.meta}</small><h3>{e.title}</h3></div><time>{e.time}</time></div><p>{e.text}</p>{e.kind === "task" && i === 9 && <div className="progress"><i/><span>Đang thực thi</span></div>}{(["result","file","task"] as Kind[]).includes(e.kind)&&<div className="entry-feedback"><button type="button" onClick={()=>setCommentingEntry(commentingEntry===e.id?"":e.id)}>✎ Nhận xét kết quả này</button>{commentingEntry===e.id&&<div className="entry-comment-box"><textarea autoFocus value={entryComments[e.id]||""} onChange={event=>setEntryComments(prev=>({...prev,[e.id]:event.target.value}))} placeholder="Gõ điều cần sửa, bổ sung hoặc phương án bạn muốn…"/><div><button type="button" onClick={()=>setCommentingEntry("")}>Hủy</button><button type="button" className="submit-comment" disabled={sending||!(entryComments[e.id]||"").trim()} onClick={()=>submitEntryComment(e)}>Gửi nhận xét</button></div></div>}</div>}</div></>}
        </div>)}
      </div>
      <div className="composer-wrap">
        <div className="work-mode"><button className={executionMode==="analyze"?"active":""} onClick={()=>setExecutionMode("analyze")}><b>Chat thường</b><span>Hỏi đáp và phân tích</span></button><button className={executionMode==="execute"?"active":""} onClick={()=>folderHandle?setExecutionMode("execute"):chooseFolder()}><b>Làm việc với dự án</b><span>{folderHandle?`Folder: ${folderHandle.name}`:"Chọn folder trên máy"}</span></button>{executionMode==="execute"&&<button className="change-folder" onClick={chooseFolder}>Đổi folder</button>}</div>
        {sending&&<div className="processing-card"><span className="processing-spinner"/><div><b>Minimum đang xử lý yêu cầu</b><small>Đang chọn context, gọi model và kiểm tra đầu ra…</small></div><em>Đang chạy</em></div>}
        {interviewQuestions.length>0&&<div className="interview-card"><div className="interview-head"><span>?</span><div><b>Hoàn thiện brief ngay tại đây</b><small>Tích đáp án nhanh hoặc nhập trực tiếp phương án riêng bên dưới</small></div><em>{clarificationOverride.trim()?"Đã có phương án riêng":`${interviewQuestions.filter(question=>interviewAnswers[question.id]?.trim()).length}/${interviewQuestions.length}`}</em></div><div className="interview-table">{interviewQuestions.map((question,index)=><div className="interview-row" key={question.id}><span><b>{index+1}. {question.label}</b><small>{question.ask}</small></span><div className="choice-list">{question.options.map(option=>{const selected=question.multi?(interviewAnswers[question.id]||"").split(" · ").includes(option):interviewAnswers[question.id]===option;return <button type="button" className={selected?"selected":""} onClick={()=>setInterviewAnswers(prev=>{if(!question.multi)return {...prev,[question.id]:option};const current=(prev[question.id]||"").split(" · ").filter(Boolean);const next=current.includes(option)?current.filter(item=>item!==option):[...current,option];return {...prev,[question.id]:next.join(" · ")}})} key={option}><span className="tick-box">{selected?"✓":""}</span>{option}</button>})}</div></div>)}</div><div className="inline-override"><label htmlFor="brief-override">Phương án khác hoặc điều chỉnh đề xuất của AI</label><textarea id="brief-override" value={clarificationOverride} onChange={e=>setClarificationOverride(e.target.value)} placeholder="Gõ trực tiếp tại đây, ví dụ: Lưu cả trên máy và Google Drive, nhưng ưu tiên folder trên máy…"/><small>Nội dung bạn nhập được ưu tiên hơn các lựa chọn AI đề xuất.</small></div></div>}
        {projectIntent.active&&(projectBriefConfirmed?<div className="project-advisor compact"><span>✓ BRD</span><b>{projectIntent.type}</b><small>{projectIntent.freeEligible?"Free-first":budgetTier==="economy"?"Tiết kiệm":budgetTier==="quality"?"Chất lượng":"Cân bằng"}</small><button onClick={()=>setProjectBriefConfirmed(false)}>Chỉnh brief</button></div>:<div className="project-advisor"><div className="advisor-head"><span>PROJECT ADVISOR</span><b>{projectIntent.type}</b><em>Chờ xác nhận BRD</em></div><div className="advisor-brief"><small>MỤC TIÊU USER</small><p>{draft}</p><small>CHIẾN LƯỢC AI ĐỀ XUẤT</small><p>{projectIntent.strategy}</p></div>{projectIntent.freeEligible?<div className="free-first"><b>✓ Tác vụ nhỏ · ưu tiên model/API free</b><span>Không cần chọn ngân sách. App chỉ báo token và chi phí thực tế sau khi chạy; không tự nâng sang model trả phí.</span></div>:<div className="budget-options"><button className={budgetTier==="economy"?"active":""} onClick={()=>setBudgetTier("economy")}><b>Tiết kiệm</b><span>Ít biến thể · giới hạn retry</span></button><button className={budgetTier==="balanced"?"active":""} onClick={()=>setBudgetTier("balanced")}><b>Cân bằng</b><span>Model mạnh ở bước quan trọng</span></button><button className={budgetTier==="quality"?"active":""} onClick={()=>setBudgetTier("quality")}><b>Chất lượng</b><span>Nhiều vòng kiểm tra hơn</span></button></div>}<button className="confirm-brief" disabled={!interviewComplete||sending} onClick={()=>{setProjectBriefConfirmed(true);setUploadError("");sendMessage(true)}}>{sending?"Đang bắt đầu…":projectIntent.freeEligible?"Xác nhận & chạy Free-first":"Xác nhận & bắt đầu dự án"}</button></div>)}
        {draft.trim() && !projectIntent.active && <div className="usage-plan"><div className="usage-plan-head"><span>USAGE PROFILE</span><b>{usagePlan.profile}</b><em>Risk: {usagePlan.risk}</em></div><div className="usage-grid"><div><small>ƯU TIÊN</small><b>{usagePlan.priority}</b></div><div><small>CÔNG CỤ</small><b>{usagePlan.tool}</b></div><div><small>KIỂM CHỨNG</small><b>{usagePlan.verification}</b></div><div><small>OUTPUT</small><b>{usagePlan.output}</b></div></div><p>✓ Fact cần nguồn · ✓ Suy luận phải gắn nhãn · ✓ Tự chọn tool trước khi chọn model <span>Phân tích cục bộ · 0 token</span></p></div>}
        {clarification && (clarification.needed ? <div className="clarify-card"><div className="clarify-head"><span>?</span><div><b>Cần làm rõ trước khi thực hiện</b><small>{clarification.reason} · Rule cục bộ · 0 token</small></div><em>Auto</em></div><p>Bạn muốn tiếp tục phần nào?</p><div className="clarify-options"><button onClick={()=>setClarifiedScope("Sửa căn chỉnh ô gộp sát lề phải")}>Căn chỉnh ô gộp <small>Đề xuất</small></button><button onClick={()=>setClarifiedScope("Sửa đường viền của bảng")}>Đường viền bảng</button><button onClick={()=>setClarifiedScope("Kiểm tra cả căn chỉnh và đường viền")}>Cả hai</button></div><div className="kept-constraint">✓ Giữ nguyên ràng buộc: không sửa module OCR</div></div> : <div className="task-preview"><span>✓</span><p><b>Đã hiểu yêu cầu</b> {clarification.summary}</p><button onClick={()=>setClarifiedScope("")}>Chỉnh lại</button></div>)}
        {!provider ? <div className="connection-warning"><span>!</span><p><b>Chưa có model được kết nối</b> Hãy nhập API key để bắt đầu xử lý thật.</p><button onClick={()=>setProvidersOpen(true)}>Kết nối model</button></div> : <div className="connected-bar"><span>✓</span><p><b>{provider}</b> · {model}</p><button onClick={disconnectProvider}>Ngắt kết nối</button></div>}
        <div className="execution-mode"><div><b>{executionMode === "execute" ? "Thực thi project có xác nhận" : "Chat & phân tích"}</b><span>{executionMode === "execute" ? `Có thể tạo hoặc sửa nhiều file trong ${folderHandle?.name || "folder đã chọn"}` : "Đọc file đính kèm và trả kết quả trong timeline"}</span></div><button disabled={!folderHandle} onClick={()=>setExecutionMode(mode=>mode === "analyze" ? "execute" : "analyze")}>{executionMode === "execute" ? "Chuyển sang Analyze" : folderHandle ? "Bật Execute" : "Kết nối folder để Execute"}</button></div>{pendingPatch&&<div className="patch-preview"><div><b>{pendingPatch.files.length} file chờ duyệt</b><span>{pendingPatch.summary}</span><small>{pendingPatch.files.map(file=>`${file.operation}: ${file.path}`).join(" · ")}</small></div><button onClick={()=>setPendingPatch(null)}>Hủy</button><button className="apply" onClick={applyPendingPatch}>Tạo/cập nhật file</button></div>}{attachments.length>0&&<div className="attachment-list">{attachments.map(file=><span key={file.name}>↗ {file.name} <small>{Math.ceil(file.size/1024)} KB</small><button onClick={()=>setAttachments(prev=>prev.filter(item=>item.name!==file.name))}>×</button></span>)}</div>}{uploadError&&<div className="upload-error">{uploadError}</div>}<div className="composer"><textarea aria-label="Nhập yêu cầu" value={draft} onChange={e=>{setDraft(e.target.value);setClarifiedScope("")}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder={provider ? "Nêu mục tiêu hoặc đính kèm file để phân tích..." : "Kết nối model trước khi gửi yêu cầu..."}/><div className="composer-actions"><div><select aria-label="Chọn hãng hoặc model" value={provider || ""} disabled><option>{provider ? `${provider} · ${model}` : "Chưa có model"}</option></select><input ref={fileRef} className="file-input" type="file" multiple accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.log,.pdf,.png,.jpg,.jpeg,.webp,.gif,text/*,application/pdf,image/*" onChange={e=>attachFiles(e.target.files)}/><button onClick={()=>fileRef.current?.click()}>＋ Đính kèm file</button><button className="context-on"><i/> Context tự động</button></div><button className="send" aria-label="Gửi" onClick={sendMessage} disabled={!provider || (!draft.trim()&&!attachments.length) || sending || Boolean(clarification?.needed) || !interviewComplete}><Icon name="send"/></button></div></div><p>Clarification: Auto · PDF/ảnh tối đa 10 MB · Text/code tối đa 5 MB · Execute luôn cần duyệt</p>
      </div>
    </section>

    <aside className="brain"><div className="brain-title"><Icon name="brain"/><div><span>BỘ NHỚ DỰ ÁN</span><b>Đang đồng bộ</b></div><i/></div><div className="brain-tabs"><button className="active">Hiện tại</button><button>Bộ nhớ</button><button>Sử dụng</button></div>
      <section><label>SECURITY GATE</label><div className="security-status"><b>✓ Local-first protection</b><span>API key chỉ ở bộ nhớ tab</span><span>Secret tự động được che trước khi gửi</span><span>File chỉ ghi sau khi bạn xác nhận</span>{lastRedactions>0&&<em>Đã che {lastRedactions} secret trong request gần nhất</em>}</div></section><section><label>WORKSPACE FOLDER</label><button className="folder-connect" onClick={chooseFolder}>{folderHandle ? `✓ ${folderHandle.name}` : "＋ Chọn folder trên máy"}</button>{workspaceError&&<p className="workspace-error">{workspaceError}</p>}<div className="workspace-files">{workspaceFiles.slice(0,40).map(file=><button key={file.path} className={selectedWorkspaceFile===file.path?"active":""} onClick={()=>openWorkspaceFile(file)}>↗ {file.path}</button>)}{folderHandle&&!workspaceFiles.length&&<small>Không tìm thấy file text/code được hỗ trợ.</small>}</div></section><section><label>CẤU HÌNH SỬ DỤNG AI</label><div className="state-card"><span className="pulse"/><div><b>{draft.trim() ? usagePlan.profile : "Auto profile"}</b><small>{draft.trim() ? usagePlan.tool : "Nêu mục tiêu, hệ thống tự cấu hình"}</small></div></div></section>
      <section><div className="section-row"><label>RÀNG BUỘC ĐANG ÁP DỤNG</label><span>2</span></div><div className="memory-item"><i>!</i><p>Không sửa module OCR khi xử lý bảng DOCX.</p></div><div className="memory-item"><i>⌁</i><p>Phần tính toán hình học phải tách khỏi OCR.</p></div></section>
      <section className="token-dashboard"><div className="section-row"><label>TIÊU THỤ TOKEN</label><span>{tokenStats.measured} tác vụ đo được</span></div><div className="token-total"><span>Tổng trong cuộc trò chuyện</span><b>{tokenStats.total.toLocaleString("vi-VN")} <small>token</small></b></div><div className="token-split"><div><span>Context / input</span><b>{tokenStats.input.toLocaleString("vi-VN")}</b><i style={{width:`${tokenStats.total?Math.max(4,tokenStats.input/tokenStats.total*100):0}%`}}/></div><div><span>Trả lời / output</span><b>{tokenStats.output.toLocaleString("vi-VN")}</b><i style={{width:`${tokenStats.total?Math.max(4,tokenStats.output/tokenStats.total*100):0}%`}}/></div></div><div className="token-top"><small>TÁC VỤ TỐN NHIỀU NHẤT</small>{tokenStats.top?<><b>{tokenStats.top.title || (tokenStats.top.role==="ai"?"Phản hồi AI":"Tác vụ")}</b><span>{tokenStats.top.usage?.totalTokens.toLocaleString("vi-VN")} token · {Math.round((tokenStats.top.usage?.totalTokens||0)/Math.max(1,tokenStats.total)*100)}% tổng</span></>:<span>Chưa có usage thật. Gửi yêu cầu mới để bắt đầu đo.</span>}</div></section>
      <section className="finance-summary"><label>{lastBudgetMode==="free-first"?"MỨC TIÊU TỐN":"NGÂN SÁCH AI"}</label>{lastBudgetMode!=="free-first"&&<div><span>Chế độ</span><b>{lastBudgetMode==="economy"?"Tiết kiệm":lastBudgetMode==="quality"?"Chất lượng":"Cân bằng"}</b></div>}<div><span>Token đã dùng</span><b>{tokenStats.total.toLocaleString("vi-VN")}</b></div><div><span>Chi phí provider</span><b>{tokenStats.cost>0?`$${tokenStats.cost.toFixed(4)}`:lastBudgetMode==="free-first"?"$0 hoặc chưa báo":"Chưa có dữ liệu"}</b></div><small>{lastBudgetMode==="free-first"?"Tác vụ nhỏ đang dùng Free-first; không hiển thị dự toán không cần thiết.":"Minimum chỉ hiển thị chi phí thật provider trả về; không tự ước lượng thành số giả."}</small></section>
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
