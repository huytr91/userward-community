"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "message" | "task" | "decision" | "result" | "file";
type Entry = { id: string; kind: Kind; title?: string; text: string; time: string; meta?: string; role?: "user" | "ai" };

const entries: Entry[] = [
  { id: "m1", kind: "message", role: "user", text: "Mình muốn bộ chuyển PDF sang DOCX chạy hoàn toàn local và giữ đúng bố cục bảng.", time: "06 Aug · 09:14" },
  { id: "d1", kind: "decision", title: "Kiến trúc OCR", text: "Tách geometry calculation khỏi OCR pipeline để có thể thay engine mà không ảnh hưởng tái dựng bảng.", time: "06 Aug · 10:02", meta: "Decision · Architecture" },
  { id: "t1", kind: "task", title: "Thử nghiệm OCR engines", text: "Đã so sánh PaddleOCR và MinerU trên 24 tài liệu mẫu. MinerU giữ layout tốt hơn ở tài liệu nhiều cột.", time: "06 Aug · 14:36", meta: "Task #18 · Completed" },
  { id: "m2", kind: "message", role: "user", text: "Từ giờ dùng MinerU. Nhưng khi sửa phần DOCX thì tuyệt đối đừng thay đổi OCR module nhé.", time: "07 Aug · 08:41" },
  { id: "d2", kind: "decision", title: "Constraint đang hoạt động", text: "Không sửa OCR module khi xử lý lỗi DOCX table. Quyết định này thay thế cấu hình PaddleOCR trước đó.", time: "07 Aug · 08:42", meta: "Constraint · Pinned" },
  { id: "t2", kind: "task", title: "Fix merged-cell alignment", text: "Phân tích build_table() và phát hiện offset bị áp dụng hai lần khi cell span qua nhiều cột.", time: "07 Aug · 15:20", meta: "Task #24 · Completed" },
  { id: "f1", kind: "file", title: "table_geometry.py", text: "Cập nhật calculate_merged_bounds() và thêm kiểm tra cho nested merged cells.", time: "07 Aug · 15:48", meta: "+18 −6 · Python" },
  { id: "r1", kind: "result", title: "Kiểm thử thành công", text: "12/12 table geometry tests passed. OCR pipeline không thay đổi.", time: "07 Aug · 15:52", meta: "Result · Accepted" },
  { id: "m3", kind: "message", role: "user", text: "Table vẫn hơi lệch ở tài liệu có merged cell nằm sát lề phải. Sửa tiếp giúp mình.", time: "Today · 09:03" },
  { id: "t3", kind: "task", title: "Repair right-edge merged cells", text: "Đang kiểm tra rounding error trong DOCX width conversion. Đã lấy 2 decisions, 3 symbols và 1 test liên quan.", time: "Today · 09:04", meta: "Task #31 · In progress" },
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [selected, setSelected] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return entries.filter(e => (filter === "all" || e.kind === filter) && (!q || `${e.title || ""} ${e.text} ${e.meta || ""}`.toLowerCase().includes(q)));
  }, [query, filter]);

  useEffect(() => {
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

  return <main className="shell">
    <aside className="projects">
      <div className="brand"><div className="brandmark">M</div><span>Minimum</span></div>
      <button className="new-project"><Icon name="plus"/> Dự án mới</button>
      <p className="section-label">PROJECTS</p>
      <nav>{projects.map((p, i) => <button key={p} className={i === 0 ? "project active" : "project"}><span className="project-dot">{p[0]}</span><span>{p}</span>{i === 0 && <span className="live-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button><span>?</span> Trợ giúp</button><div className="profile"><div>HT</div><span><b>Huy Tran</b><small>Local workspace</small></span></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">PROJECT</span><h1>PDF Converter <span>Local-first</span></h1></div><button className="search-trigger" onClick={() => {setSearchOpen(true); setTimeout(()=>searchRef.current?.focus(), 20)}}><Icon name="search"/><span>Tìm trong project...</span><kbd>Ctrl K</kbd></button></header>
      <div className="timeline" id="timeline">
        <div className="day"><span>06 THÁNG 8</span></div>
        {entries.map((e, i) => <div key={e.id} id={e.id} className={`entry ${e.kind} ${e.role || ""} ${flash === e.id ? "flash" : ""}`}>
          {e.kind === "message" ? <>
            <div className="avatar">{e.role === "user" ? "HT" : "M"}</div><div className="message-body"><div className="message-head"><b>{e.role === "user" ? "Bạn" : "Minimum"}</b><time>{e.time}</time></div><p>{e.text}</p>{e.role === "ai" && <div className="usage"><span>Model <b>Standard</b></span><span>Input <b>4.2k</b></span><span>Avoided <b>21.7k</b></span><span>Cost <b>$0.02</b></span></div>}</div>
          </> : <><div className="rail"><span>{e.kind === "decision" ? "◆" : e.kind === "task" ? "✓" : e.kind === "file" ? "↗" : "●"}</span></div><div className="card"><div className="card-top"><div><small>{e.meta}</small><h3>{e.title}</h3></div><time>{e.time}</time></div><p>{e.text}</p>{e.kind === "task" && i === 9 && <div className="progress"><i/><span>Đang thực thi</span></div>}</div></>}
        </div>)}
      </div>
      <div className="composer-wrap"><div className="composer"><textarea aria-label="Nhập yêu cầu" placeholder="Hỏi hoặc giao một task cho project..."/><div className="composer-actions"><div><button className="mode">Do <span>⌄</span></button><button>＋</button><button className="context-on"><i/> Auto context</button></div><button className="send" aria-label="Gửi"><Icon name="send"/></button></div></div><p>AI chỉ nhận context tối thiểu cần thiết · Project memory thuộc về bạn</p></div>
    </section>

    <aside className="brain"><div className="brain-title"><Icon name="brain"/><div><span>PROJECT BRAIN</span><b>Đang đồng bộ</b></div><i/></div><div className="brain-tabs"><button className="active">Now</button><button>Memory</button><button>Usage</button></div>
      <section><label>TRẠNG THÁI HIỆN TẠI</label><div className="state-card"><span className="pulse"/><div><b>Repair right-edge cells</b><small>Table reconstruction · In progress</small></div></div></section>
      <section><div className="section-row"><label>ACTIVE CONSTRAINTS</label><span>2</span></div><div className="memory-item"><i>!</i><p>Không sửa OCR module khi xử lý DOCX table.</p></div><div className="memory-item"><i>⌁</i><p>Geometry calculation phải tách khỏi OCR.</p></div></section>
      <section><div className="section-row"><label>CONTEXT REQUEST NÀY</label><button>Inspect</button></div><div className="metric"><span>Selected context</span><b>4,218 <small>tokens</small></b></div><div className="bar"><i/></div><div className="saved"><span>Context avoided</span><b>83.8%</b></div><div className="sources"><span>2 decisions</span><span>3 symbols</span><span>1 test</span></div></section>
      <section><label>QUYẾT ĐỊNH GẦN ĐÂY</label><button className="decision-link"><i/> Use MinerU for layout detection <Icon name="chevron"/></button></section>
      <button className="inspect-memory"><Icon name="brain"/> Mở Memory Inspector</button>
    </aside>

    {searchOpen && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSearchOpen(false)}><div className="search-panel">
      <div className="search-input"><Icon name="search"/><input ref={searchRef} value={query} onChange={e => {setQuery(e.target.value);setSelected(0)}} placeholder="Tìm tin nhắn, task, quyết định hoặc file..."/><button onClick={()=>setSearchOpen(false)}><Icon name="close"/></button></div>
      <div className="filter-row">{filters.map(f => <button key={f.value} className={filter === f.value ? "active" : ""} onClick={()=>{setFilter(f.value);setSelected(0)}}>{f.label}</button>)}</div>
      <div className="results"><div className="results-head"><span>{query ? `${results.length} KẾT QUẢ` : "NỘI DUNG GẦN ĐÂY"}</span><small>↑↓ để chọn · Enter để mở</small></div>
        {results.length ? results.map((r, i) => <button key={r.id} className={i === selected ? "result selected" : "result"} onMouseEnter={()=>setSelected(i)} onClick={()=>jumpTo(r.id)}><span className={`result-icon ${r.kind}`}>{r.kind === "decision" ? "◆" : r.kind === "task" ? "✓" : r.kind === "file" ? "↗" : r.kind === "result" ? "●" : r.role === "user" ? "HT" : "M"}</span><span className="result-copy"><span><b>{highlight(r.title || (r.role === "user" ? "Bạn" : "Minimum"), query)}</b><time>{r.time}</time></span><p>{highlight(r.text, query)}</p><small>{r.meta || (r.kind === "message" ? "Message · PDF Converter" : r.kind)}</small></span><Icon name="chevron"/></button>) : <div className="empty"><Icon name="search"/><b>Không tìm thấy nội dung phù hợp</b><span>Thử từ khóa ngắn hơn hoặc chọn bộ lọc khác.</span></div>}
      </div><footer><span><kbd>↵</kbd> Mở trong timeline</span><span><kbd>Esc</kbd> Đóng</span><button>Hỏi AI về lịch sử →</button></footer>
    </div></div>}
  </main>;
}
