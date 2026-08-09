"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "message" | "task" | "decision" | "result" | "file";
type Entry = { id: string; kind: Kind; title?: string; text: string; time: string; meta?: string; role?: "user" | "ai" };

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
];

const projects = ["PDF Converter", "Financial Analyzer", "Automation Tool"];
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

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [draft, setDraft] = useState("");
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

  useEffect(() => {
    const savedProvider = sessionStorage.getItem("minimum-provider") || "";
    const savedModel = sessionStorage.getItem("minimum-model") || "";
    const savedKey = sessionStorage.getItem("minimum-api-key") || "";
    if (savedProvider && savedModel && savedKey) { setProvider(savedProvider); setModel(savedModel); setApiKey(savedKey); }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 20); }
      if (e.key === "Escape") setSearchOpen(false);
      if (searchOpen && e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (searchOpen && e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (searchOpen && e.key === "Enter" && results[selected]) jumpTo(results[selected].id);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, results, selected]);

  const jumpTo = (id: string) => {
    setSearchOpen(false); setFlash(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    setTimeout(() => setFlash(null), 2200);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !provider) { setProvidersOpen(true); return; }
    if (clarification?.needed) return;
    const userEntry: Entry = { id: `user-${Date.now()}`, kind: "message", role: "user", text, time: "Vừa xong" };
    setEntries(prev => [...prev, userEntry]); setDraft(""); setSending(true);
    setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30);
    fetch("/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey, model, prompt: clarifiedScope ? `${text}\n\nPhạm vi đã làm rõ: ${clarifiedScope}` : text }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không thể xử lý yêu cầu."); return data; })
      .then(data => setEntries(prev => [...prev, { id: `ai-${Date.now()}`, kind: "message", role: "ai", text: data.text, time: "Vừa xong" }]))
      .catch(error => setEntries(prev => [...prev, { id: `error-${Date.now()}`, kind: "result", title: "Yêu cầu thất bại", text: error.message, time: "Vừa xong", meta: `${provider} · Lỗi` }]))
      .finally(() => { setSending(false); setClarifiedScope(""); setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" }), 30); });
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
    sessionStorage.setItem("minimum-provider", credentialProvider); sessionStorage.setItem("minimum-model", model); sessionStorage.setItem("minimum-api-key", apiKey);
    setProvidersOpen(false); setCredentialProvider(""); setAvailableModels([]);
  };

  const disconnectProvider = () => {
    setProvider(""); setModel(""); setApiKey("");
    sessionStorage.removeItem("minimum-provider"); sessionStorage.removeItem("minimum-model"); sessionStorage.removeItem("minimum-api-key");
  };

  return <main className="shell">
    <aside className="projects">
      <div className="brand"><div className="brandmark">M</div><span>Minimum</span></div>
      <button className="new-project"><Icon name="plus"/> Dự án mới</button>
      <button className="provider-button" onClick={()=>setProvidersOpen(true)}>⌘ <span>{provider || "Kết nối model"}</span><b>{provider ? "✓" : "0"}</b></button>
      <p className="section-label">DỰ ÁN</p>
      <nav>{projects.map((p, i) => <button key={p} className={i === 0 ? "project active" : "project"}><span className="project-dot">{p[0]}</span><span>{p}</span>{i === 0 && <span className="live-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button><span>?</span> Trợ giúp</button><div className="profile"><div>HT</div><span><b>Huy Tran</b><small>Local workspace</small></span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">DỰ ÁN</span><h1>PDF Converter <span>Dữ liệu cục bộ</span></h1></div><button className="search-trigger" onClick={() => {setSearchOpen(true); setTimeout(()=>searchRef.current?.focus(), 20)}}><Icon name="search"/><span>Tìm trong dự án...</span><kbd>Ctrl K</kbd></button></header>
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
        {clarification && (clarification.needed ? <div className="clarify-card"><div className="clarify-head"><span>?</span><div><b>Cần làm rõ trước khi thực hiện</b><small>{clarification.reason} · Rule cục bộ · 0 token</small></div><em>Auto</em></div><p>Bạn muốn tiếp tục phần nào?</p><div className="clarify-options"><button onClick={()=>setClarifiedScope("Sửa căn chỉnh ô gộp sát lề phải")}>Căn chỉnh ô gộp <small>Đề xuất</small></button><button onClick={()=>setClarifiedScope("Sửa đường viền của bảng")}>Đường viền bảng</button><button onClick={()=>setClarifiedScope("Kiểm tra cả căn chỉnh và đường viền")}>Cả hai</button></div><div className="kept-constraint">✓ Giữ nguyên ràng buộc: không sửa module OCR</div></div> : <div className="task-preview"><span>✓</span><p><b>Đã hiểu yêu cầu</b> {clarification.summary}</p><button onClick={()=>setClarifiedScope("")}>Chỉnh lại</button></div>)}
        {!provider ? <div className="connection-warning"><span>!</span><p><b>Chưa có model được kết nối</b> Hãy nhập API key để bắt đầu xử lý thật.</p><button onClick={()=>setProvidersOpen(true)}>Kết nối model</button></div> : <div className="connected-bar"><span>✓</span><p><b>{provider}</b> · {model}</p><button onClick={disconnectProvider}>Ngắt kết nối</button></div>}
        <div className="composer"><textarea aria-label="Nhập yêu cầu" value={draft} onChange={e=>{setDraft(e.target.value);setClarifiedScope("")}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder={provider ? "Nhập yêu cầu..." : "Kết nối model trước khi gửi yêu cầu..."}/><div className="composer-actions"><div><select aria-label="Chọn hãng hoặc model" value={provider || ""} disabled><option>{provider ? `${provider} · ${model}` : "Chưa có model"}</option></select><button>＋ Đính kèm</button><button className="context-on"><i/> Context tự động</button></div><button className="send" aria-label="Gửi" onClick={sendMessage} disabled={!provider || !draft.trim() || sending || Boolean(clarification?.needed)}><Icon name="send"/></button></div></div><p>Clarification: Auto · API key chỉ giữ trong phiên tab này</p>
      </div>
    </section>

    <aside className="brain"><div className="brain-title"><Icon name="brain"/><div><span>BỘ NHỚ DỰ ÁN</span><b>Đang đồng bộ</b></div><i/></div><div className="brain-tabs"><button className="active">Hiện tại</button><button>Bộ nhớ</button><button>Sử dụng</button></div>
      <section><label>TRẠNG THÁI HIỆN TẠI</label><div className="state-card"><span className="pulse"/><div><b>Repair right-edge cells</b><small>Table reconstruction · In progress</small></div></div></section>
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
    ].map(([name,desc,method])=><div className={`provider-row ${credentialProvider===name?"chosen":""}`} key={name}><span className="provider-logo">{name[0]}</span><div><b>{name}</b><small>{desc} · {method}</small></div><button onClick={()=>{setCredentialProvider(name);setApiKey("");setModel("");setAvailableModels([]);setConnectionError("")}}>{provider===name?"Kết nối lại":"Chọn"}</button></div>)}<div className="provider-row local-row"><span className="provider-logo">9</span><div><b>9Router · Local gateway</b><small>Quản lý key, subscription và fallback tại localhost:20128</small></div><button disabled>Cần Companion</button></div>{credentialProvider && <div className="credential-form"><label>API key của {credentialProvider}</label><div><input type="password" value={apiKey} onChange={e=>{setApiKey(e.target.value);setAvailableModels([])}} placeholder="Dán API key tại đây" autoComplete="off"/><button onClick={connectProvider} disabled={!apiKey.trim()||connecting}>{connecting?"Đang kiểm tra...":"Kiểm tra key"}</button></div><small>Key chỉ tồn tại trong phiên tab này; không lưu vào project hay database.</small>{availableModels.length>0&&<div className="model-picker"><label>Chọn model</label><select value={model} onChange={e=>setModel(e.target.value)}>{availableModels.map(item=><option value={item} key={item}>{item}</option>)}</select><button onClick={saveProvider}>Lưu & kết nối</button></div>}{connectionError&&<p>{connectionError}</p>}</div>}</div><footer><span>OpenRouter chạy ngay; 9Router cần Local Companion để website gọi máy bạn an toàn.</span><button onClick={()=>setProvidersOpen(false)}>Đóng</button></footer></div></div>}
  </main>;
}
