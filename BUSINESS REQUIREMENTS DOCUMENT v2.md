# BUSINESS REQUIREMENTS DOCUMENT
# AI Usage Optimizer
### Goal-first AI Usage Layer · Safety Policy · Tool & Model Routing · Persistent Project Memory

**Version:** 2.0  
**Product Type:** AI Usage Optimizer / Goal-first AI Copilot / Provider-neutral Usage Layer  
**Primary Goal:** Người dùng chỉ mô tả kết quả muốn đạt bằng ngôn ngữ bình thường. Hệ thống tự chọn policy, tool, model, context, mức kiểm chứng và output phù hợp để hoàn thành công việc an toàn, chính xác và hiệu quả.

**Signature promise:**

> Tell us what you want to accomplish, not how to use AI.

---

# 0. PRODUCT REFRAMING

Sản phẩm không chỉ giải quyết “tốn token”. Token optimization là một năng lực nền, không phải toàn bộ value proposition.

AI hiện bắt người dùng phổ thông phải tự học model selection, prompt engineering, hallucination control, source discipline, tool selection và output control. Sản phẩm phải đảo ngược gánh nặng này: user nêu mục tiêu; hệ thống chịu trách nhiệm cấu hình cách dùng AI.

## 0.1 Eight core pain-point groups

1. **Model confusion** — không biết model nào phù hợp.
2. **Prompt anxiety** — không biết phải diễn đạt thế nào.
3. **Hallucination control** — khó phân biệt fact và inference.
4. **Source discipline** — claim thiếu nguồn hoặc reference không tồn tại.
5. **Output mismatch** — sai định dạng, độ dài hoặc giọng văn.
6. **Context/history problem** — dự án dài, AI quên, user phải giải thích lại.
7. **Cost/token opacity** — không hiểu request đang tiêu tốn gì và vì sao.
8. **Workflow ignorance** — không biết nên dùng LLM, search, Python/R, spreadsheet hay công cụ khác.

## 0.2 Goal-first pipeline

```text
USER GOAL
  ↓
Intent + Risk Analysis
  ↓
Clarification Gate (only when ambiguity changes outcome or risk)
  ↓
Usage Profile
  ↓
Tool Selection
  ↓
Model Selection
  ↓
Prompt + Context Policy
  ↓
Verification Policy
  ↓
Output Contract
  ↓
Execution + Cost Tracking
```

## 0.3 Usage Profiles

MVP profiles:

- Research
- Coding
- Finance
- Legal
- Writing
- Data Analysis
- Marketing
- Study
- General Work

Mỗi profile phải định nghĩa: hallucination tolerance, source requirements, allowed inference, preferred tools, output style, model class, cost policy, privacy policy và verification level.

## 0.4 Research Profile — normative policy

```text
TASK TYPE
Scientific research

PRIORITY
Accuracy > creativity

SOURCE POLICY
- No unsupported claims
- Citation required for factual claims
- Distinguish source fact vs inference
- Never invent references
- If source unavailable, say "not verified"

DATA POLICY
- Calculations must be reproducible
- Show formula/method
- Do not alter original data
- Flag missing/abnormal values

OUTPUT POLICY
- Academic tone
- No filler
- No fabricated interpretation
- Separate Results / Interpretation / Limitations

MODEL & TOOL STRATEGY
- Statistics → deterministic Python/R first
- Literature verification → web/search + citations
- Paper summarization → LLM grounded in supplied papers
- Manuscript wording → strong language model
- Formatting → cheap model or deterministic transform
```

## 0.5 Core functional requirements added in v2

- **FR-GOAL-01:** Accept a plain-language goal without requiring prompt syntax.
- **FR-RISK-01:** Classify domain risk and verification level before execution.
- **FR-PROFILE-01:** Recommend a Usage Profile and expose its active policy.
- **FR-CLARIFY-01:** Clarify only when ambiguity materially changes scope, risk, cost or output.
- **FR-TOOL-01:** Determine whether an LLM should be used at all.
- **FR-SOURCE-01:** Track every factual claim as sourced, inferred or unverified.
- **FR-DATA-01:** Prefer deterministic computation for calculations and preserve original data.
- **FR-OUTPUT-01:** Compile an explicit output contract before execution.
- **FR-ROUTE-01:** Select tool first, then model; provider choice is downstream.
- **FR-EXPLAIN-01:** Show a concise “Why this setup” explanation without revealing hidden chain-of-thought.
- **FR-OVERRIDE-01:** Let users adjust profile, verification, cost and output controls.
- **FR-LEDGER-01:** Report actual model, tool, tokens, cost, sources and verification status.

## 0.6 Revised primary success metric

Primary metric: **Verified Task Success Rate**.

Guardrail metrics:

- unsupported claim rate;
- fabricated citation rate;
- deterministic-calculation coverage;
- user correction and retry rate;
- profile recommendation acceptance;
- cost per verified successful task;
- context precision and AI waste avoided.

Token saved must never be optimized at the expense of truthfulness, reproducibility or task success.

## 0.7 Security and Trust Architecture

Security is a product capability and a routing constraint, not a settings-page afterthought.

### Security principles

1. **Local-first by default** — project files remain on the user device unless explicitly selected for a request.
2. **Least privilege** — folder access is user-granted; execution is limited to selected files and approved operations.
3. **No silent execution** — model output is always a proposal. File writes, terminal commands, network changes and destructive actions require an explicit approval gate.
4. **Secrets never enter prompts** — detect and redact API keys, tokens, private keys, passwords and common credentials before external transmission.
5. **Keys are ephemeral** — provider API keys are held in volatile tab memory only by default, never stored in project history, prompts, analytics or local project records.
6. **Provider transparency** — disclose the model, execution provider, data path, logging/training policy and whether content leaves the device.
7. **Path confinement** — file operations must resolve inside the user-approved workspace; reject traversal and arbitrary model-supplied paths.
8. **Evidence-based status** — never claim a file was modified, command ran or test passed without a verified tool result.
9. **Auditability** — record approvals, redactions, provider calls, file writes, failures and security-policy changes without recording secret values.
10. **Safe failure** — malformed patches, permission loss, policy conflicts or unverifiable output must fail closed and leave source files unchanged.

### Security gates

```text
User goal
  ↓
Data classification (public / internal / confidential / restricted)
  ↓
Secret and PII scan
  ↓
Provider/privacy compatibility check
  ↓
Minimum necessary context selection
  ↓
Outbound preview + redaction summary
  ↓
Model call
  ↓
Patch/command validation
  ↓
Explicit user approval
  ↓
Confined execution
  ↓
Audit event
```

### Security acceptance tests

- A file containing an OpenAI, OpenRouter, Anthropic, Google, GitHub or generic bearer token is redacted before transmission.
- A model cannot write a file other than the exact workspace file selected by the user.
- A rejected or malformed patch causes zero filesystem changes.
- Reloading the page removes provider API keys from memory.
- Switching projects cannot expose another project's selected file or folder handle.
- The UI clearly distinguishes “analyzed”, “patch prepared”, “write approved” and “write completed”.
- No hidden full-history, full-folder or secret transmission is allowed.

## 0.8 Document Intake and Clarification Interview

- File support must follow the processing pipeline, not an arbitrary extension whitelist.
- Text/code may be read locally and redacted before transmission.
- PDF and image inputs use a provider-native file/vision pipeline when available.
- DOCX, XLSX, PPTX and other structured formats require deterministic extraction before LLM use; the UI must never pretend they were parsed when no extractor exists.
- Limits must be explained as safety/cost/provider constraints. MVP limits: text/code 5 MB per file; PDF/image 10 MB per file; maximum five files per request.
- Large documents should use chunking, retrieval and progressive disclosure rather than injecting the entire file blindly.

Missing information is not an execution failure. The system must transition to a **Clarification Interview** when required fields are absent.

The interview must:

- show a compact table of missing fields;
- ask one concrete question per field;
- explain why execution is paused;
- preserve the user's original goal;
- compile answers into TaskSpec;
- enable execution only after required answers are complete;
- avoid charging model tokens when local rules can identify the missing fields.

Example for an email automation goal:

| Required field | Question |
|---|---|
| Source | Gmail, Outlook, IMAP or another system? |
| Destination | Local folder, OneDrive, Google Drive or SharePoint? |
| Trigger | New email event or scheduled interval? |
| Scope | Attachment, body, metadata or complete message? |

---

# 1. PRODUCT VISION

Xây dựng một AI Workspace đứng về phía lợi ích người dùng thay vì phụ thuộc vào một AI provider.

Người dùng chỉ cần làm việc tại **một Project Workspace duy nhất** trong thời gian dài.

Hệ thống phải:

- nhớ trạng thái project;
- không cần user tự tóm tắt conversation;
- không cần mở chat mới khi context dài;
- không gửi lại toàn bộ history;
- chỉ retrieve thông tin liên quan;
- loại bỏ context dư thừa;
- chuyển yêu cầu dài/dạng hội thoại thành task instruction tối ưu;
- giới hạn output;
- chọn model phù hợp;
- ưu tiên model local/rẻ cho task đơn giản;
- dừng agent khi mục tiêu đã hoàn thành;
- đo token/cost thực tế của từng request;
- cho user thấy hệ thống đã tránh được bao nhiêu AI waste.

Triết lý cốt lõi:

> Minimum Sufficient Context.

AI chỉ được nhận lượng thông tin tối thiểu đủ để hoàn thành chính xác task.

---

# 2. PRODUCT PRINCIPLES

## P1. User owns the memory

Project Memory thuộc về user.

Không phụ thuộc:

- OpenAI;
- Anthropic;
- Google;
- Cursor;
- conversation ID;
- model.

Có thể đổi:

Claude → GPT → Gemini → Local Model

mà project vẫn giữ nguyên knowledge/state.

---

## P2. Never send full history by default

Full conversation chỉ là Cold Storage.

Không được tự động đưa toàn bộ conversation vào prompt.

---

## P3. Never use LLM when deterministic code is enough

Ưu tiên:

Rule → Algorithm → Search → Small local model → Cheap API model → Premium model.

Premium LLM là tầng cuối cùng.

---

## P4. Optimize value, not only token price

Ngay cả khi token miễn phí/unlimited vẫn phải tối ưu:

- context length;
- latency;
- attention dilution;
- repeated context;
- unnecessary reasoning;
- unnecessary output;
- retries;
- quota;
- compute.

---

## P5. Do not optimize away useful information

Không được cắt context chỉ để đạt một tỷ lệ token saving cố định.

Nếu task thực sự cần 50.000 token thì phải gửi 50.000.

Mục tiêu:

> Minimum sufficient context

không phải:

> Minimum possible context.

---

# 3. PRIMARY SUCCESS METRIC

Không sử dụng "Token Saved" làm metric duy nhất.

Metric chính:

## AI Waste Avoided

Bao gồm:

- repeated history avoided;
- irrelevant context avoided;
- duplicated code avoided;
- unnecessary output avoided;
- premium model calls avoided;
- unnecessary model calls avoided;
- retries avoided;
- unnecessary tool calls avoided.

Các metric phụ:

Task Success Rate

Cost per Successful Task

Tokens per Successful Task

Context Utilization Rate

Retry Rate

Premium Model Escalation Rate

Latency

Memory Retrieval Accuracy

---

# 4. HIGH-LEVEL ARCHITECTURE

```text
USER
 │
 ▼
PROJECT WORKSPACE
 │
 ▼
REQUEST ANALYZER
 │
 ├── Intent
 ├── Task Type
 ├── Complexity
 ├── Expected Output
 └── Success Criteria
 │
 ▼
PROJECT BRAIN
 │
 ├── Project State
 ├── Decisions
 ├── Constraints
 ├── Architecture
 ├── Tasks
 ├── Memory
 ├── Files
 └── Historical Events
 │
 ▼
CONTEXT ENGINE
 │
 ├── Semantic Retrieval
 ├── Symbol Retrieval
 ├── Recency
 ├── Dependency Retrieval
 ├── Deduplication
 └── Context Ranking
 │
 ▼
MINIMUM SUFFICIENT CONTEXT ENGINE
 │
 ▼
PROMPT COMPILER
 │
 ▼
MODEL ROUTER
 │
 ├── Deterministic
 ├── Local Model
 ├── Cheap Model
 ├── Standard Model
 └── Premium Model
 │
 ▼
EXECUTION ENGINE
 │
 ▼
OUTPUT CONTROLLER
 │
 ▼
SUCCESS VALIDATOR
 │
 ├── success → STOP
 │
 └── failure → targeted retry
 │
 ▼
MEMORY UPDATER
 │
 ▼
USAGE / COST LEDGER
```

---

# 5. PROJECT WORKSPACE

Mỗi project là một persistent workspace.

Không sử dụng chat session làm đơn vị lưu trữ chính.

Entity chính:

```text
Project
 ├── project.yaml
 ├── state.json
 ├── decisions.jsonl
 ├── tasks.jsonl
 ├── memory/
 ├── conversations/
 ├── artifacts/
 ├── index/
 └── usage/
```

Không nhất thiết expose cấu trúc filesystem này cho user.

Đây là logical structure.

---

# 6. PROJECT BRAIN

Project Brain là thành phần quan trọng nhất.

Không lưu project dưới dạng một đoạn summary dài duy nhất.

Phải sử dụng **Structured Memory**.

## 6.1 Project State

Ví dụ:

```json
{
  "project_id": "pdf_converter",
  "goal": "Local PDF to DOCX converter",
  "current_phase": "table reconstruction",
  "current_task": "fix merged cell alignment",
  "status": "active"
}
```

Rất ngắn.

Được load gần như mọi request.

---

# 7. MEMORY ARCHITECTURE

Memory chia thành 4 tầng.

## L0 — Active State

Target:

200–800 tokens.

Chứa:

- current task;
- immediate constraints;
- current files;
- current error;
- latest decisions.

Load mặc định.

---

## L1 — Project Core Memory

Target:

1.000–3.000 tokens.

Chứa:

- project goal;
- architecture;
- important decisions;
- permanent rules;
- technical stack;
- important user preferences.

Chỉ retrieve phần liên quan.

---

## L2 — Episodic Memory

Không load mặc định.

Lưu những sự kiện như:

```text
2026-08-07

Problem:
DOCX merged cells misaligned.

Tried:
method A
method B

Result:
method B worked.

Decision:
keep geometry calculation separate from OCR.
```

Mỗi event là một record độc lập.

---

## L3 — Raw History

Bao gồm:

- complete conversations;
- raw model outputs;
- tool calls;
- logs.

Đây là Cold Storage.

Không đưa vào prompt trừ trường hợp retrieval xác định thực sự cần.

---

# 8. MEMORY STORAGE FORMAT

Không nên lưu tất cả knowledge bằng prose.

Ưu tiên structured representation.

Ví dụ:

```json
{
  "type": "decision",
  "scope": "ocr",
  "key": "ocr_engine",
  "value": "MinerU",
  "reason": "better layout detection",
  "status": "active",
  "created_at": "...",
  "supersedes": null
}
```

Thay vì:

"After discussing several alternatives we eventually decided..."

Structured data thường ngắn hơn và dễ retrieve hơn.

---

# 9. EVENT-SOURCED MEMORY

Không rewrite toàn bộ project summary sau mỗi request.

Sau mỗi task chỉ append một event:

```json
{
  "event": "decision",
  "task": "table_fix",
  "change": "use geometry reconstruction",
  "timestamp": "..."
}
```

Project State được materialize từ event log.

Lợi ích:

- ít processing;
- ít token;
- audit được;
- rollback được;
- không mất decision cũ;
- tránh summary drift.

---

# 10. MEMORY UPDATE ENGINE

Sau mỗi interaction:

```text
Current State
+
User Request
+
Relevant Result
+
Actual Changes
        ↓
Memory Delta Extractor
        ↓
Update only changed fields
```

KHÔNG:

```text
Read entire history
→ summarize everything again
```

Memory updater chỉ được lưu:

- decision mới;
- constraint mới;
- task status;
- bug;
- solution;
- architecture change;
- user correction;
- important fact.

Không lưu:

- lời chào;
- explanation dài;
- repeated information;
- model reasoning;
- generic recommendations;
- unsuccessful noise trừ khi cần tránh thử lại.

---

# 11. MEMORY COMPACTION

Định kỳ:

```text
Event
Event
Event
Event
...
```

được compact thành:

```text
Current State
+
Active Decisions
+
Important Historical Lessons
```

Events cũ vẫn giữ trong Cold Storage.

Không xóa raw history.

---

# 12. CONTEXT RETRIEVAL ENGINE

Không retrieve theo similarity đơn thuần.

Context Score:

```text
Context Score =
Semantic Relevance
× Task Relevance
× Recency
× Dependency Importance
× Decision Importance
÷ Token Cost
```

Mỗi candidate context phải có:

```json
{
  "source": "...",
  "tokens": 430,
  "semantic_score": 0.91,
  "task_score": 0.95,
  "final_score": 0.88
}
```

---

# 13. TOKEN ROI

Context Engine phải đánh giá:

```text
Expected Information Value
--------------------------
Token Cost
```

Ví dụ:

```text
auth.py

relevance     .96
tokens        1,200

INCLUDE
```

```text
README.md

relevance     .22
tokens        9,200

SKIP
```

```text
server.log

relevance     .89
tokens        38,000

ACTION:
extract relevant lines
```

---

# 14. PROGRESSIVE CONTEXT LOADING

Không đọc full file ngay lập tức.

Context retrieval theo cấp:

```text
LEVEL 0
Metadata

↓

LEVEL 1
File / repository map

↓

LEVEL 2
Symbol names

↓

LEVEL 3
Relevant functions/classes

↓

LEVEL 4
Relevant code blocks

↓

LEVEL 5
Full file

↓

LEVEL 6
Related files
```

Chỉ tăng level khi context hiện tại chưa đủ.

---

# 15. CODE PROJECT OPTIMIZATION

Đối với coding project phải xây Repo Map.

Ví dụ:

```text
src/
 auth/
   login.py
      login()
      validate_token()

   session.py
      create_session()

 export/
   docx.py
      create_document()
      build_table()
```

AI trước tiên đọc Repo Map.

Không scan toàn repository.

---

# 16. CODE RETRIEVAL

Ưu tiên retrieval theo:

1. symbol;
2. dependency;
3. import;
4. call graph;
5. error stack;
6. semantic similarity.

Ví dụ user:

"Fix build_table merged cell."

Context Engine retrieve:

```text
build_table()
→ called functions
→ table model
→ relevant tests
```

Không retrieve toàn bộ DOCX module.

---

# 17. DIFF-FIRST STRATEGY

Nếu model đã có version trước:

Không gửi full file mới.

Gửi:

```text
previous reference
+
git diff
```

Tương tự output:

Model không được generate toàn bộ file nếu patch đủ.

Ưu tiên:

```diff
-old
+new
```

---

# 18. DUPLICATION ELIMINATION

Trước khi gửi prompt:

Detect:

- duplicate instructions;
- duplicate history;
- repeated code;
- repeated logs;
- duplicated documentation;
- repeated tool output.

Loại bỏ trước LLM call.

---

# 19. REQUEST ANALYZER

Mỗi user request phải được chuyển thành TaskSpec.

Ví dụ user:

"Sửa tiếp cái table hôm qua đi, vẫn lệch, đừng đụng OCR."

Compile thành:

```json
{
  "intent": "bug_fix",
  "target": "table_alignment",
  "continuation": true,
  "constraints": [
    "do_not_modify_ocr"
  ],
  "expected_output": "code_patch",
  "success_condition": "table alignment test passes"
}
```

---

# 20. PROMPT COMPILER

Prompt Compiler không đơn thuần "rút ngắn câu".

Nó build:

```text
SYSTEM MINIMUM
+
TASK SPEC
+
ACTIVE CONSTRAINTS
+
RELEVANT CONTEXT
+
SUCCESS CRITERIA
+
OUTPUT CONTRACT
```

Không include:

- conversational filler;
- irrelevant history;
- repeated requirements;
- generic explanations.

---

# 21. PROMPT STRUCTURE

Ví dụ:

```text
TASK
Fix merged-cell alignment.

TARGET
build_table()

CONSTRAINT
Do not modify OCR pipeline.

CONTEXT
<relevant code>

SUCCESS
Existing tests pass.
Merged-cell alignment test passes.

OUTPUT
Patch only.
No explanation unless failure occurs.
```

---

# 22. OUTPUT CONTRACT

Mỗi task phải xác định output trước khi gọi model.

Các mode:

```text
PATCH_ONLY
ANSWER_ONLY
JSON_ONLY
CODE_ONLY
DECISION_ONLY
SHORT_EXPLANATION
FULL_ANALYSIS
```

Default:

**minimum output required to complete task.**

---

# 23. OUTPUT CONTROL

Coding:

Default:

```text
PATCH_ONLY
```

Không cho model:

- chào hỏi;
- recap request;
- explain obvious code;
- suggest unrelated improvements;
- generate unchanged code;
- viết "next steps" nếu không được yêu cầu.

---

# 24. OUTPUT TOKEN LIMIT

Output token budget phải dynamic.

Ví dụ:

Rename variable:

```text
max_output = 200
```

Bug patch:

```text
max_output = 1,500
```

Architecture analysis:

```text
max_output = 5,000
```

Không sử dụng một max_tokens cố định lớn cho mọi request.

---

# 25. MODEL ROUTER

Router phải provider-neutral.

Model Profile:

```json
{
  "model": "...",
  "provider": "...",
  "strengths": [],
  "weaknesses": [],
  "input_price": 0,
  "output_price": 0,
  "context_window": 0,
  "latency": 0,
  "local": false,
  "capabilities": []
}
```

---

# 26. ROUTING PRIORITY

Routing hierarchy:

```text
Can deterministic code solve it?

YES → deterministic

NO ↓

Can local model solve it reliably?

YES → local

NO ↓

Can cheap model solve it?

YES → cheap

NO ↓

standard

↓

premium only when justified
```

---

# 27. MODEL ROUTING INPUTS

Router đánh giá:

- task type;
- complexity;
- reasoning depth;
- coding requirement;
- multimodal requirement;
- context size;
- privacy;
- expected output;
- historical success;
- latency;
- current provider price;
- user preference.

---

# 28. MODEL ROUTING MUST LEARN FROM ACTUAL RESULTS

Không chỉ dựa benchmark.

Ví dụ:

```text
TASK TYPE
Python bug fix

Model A
success 92%
average cost $0.08

Model B
success 94%
average cost $0.41
```

Balanced mode:

→ Model A.

---

# 29. MODEL ESCALATION

Nếu cheap model fail:

```text
Cheap
 ↓
Retry with targeted context
 ↓
Still fail
 ↓
Premium
```

Không retry cùng một model vô hạn.

---

# 30. EARLY STOPPING ENGINE

Mỗi task phải có success criteria.

Ví dụ coding:

```text
Patch applied
+
Tests passed
+
No regression detected
```

Khi đạt:

```text
STOP
```

Agent không được tự:

- refactor;
- optimize;
- document;
- inspect unrelated code;
- suggest features.

---

# 31. RETRY CONTROL

Mỗi retry phải có reason.

```json
{
  "retry": 2,
  "reason": "test failure",
  "new_information": "TypeError line 218"
}
```

Không được retry với prompt gần như giống hệt nếu không có thông tin mới.

---

# 32. TOOL CALL CONTROL

Tool call cũng là cost.

Trước tool call phải xác định:

```text
Why needed?
Expected information?
Already available?
Can cached result be used?
```

Không gọi lại:

- repository scan;
- search;
- file read;
- web search;

nếu dữ liệu chưa thay đổi.

---

# 33. SEMANTIC CACHE

Cache không chỉ exact-match.

Ví dụ:

```text
"show revenue by month"

"monthly revenue"

"give me revenue monthly"
```

có thể cùng một semantic task.

Nếu:

- underlying data unchanged;
- constraints unchanged;

→ reuse result hoặc computation.

---

# 34. ARTIFACT CACHE

Cache:

- repo map;
- AST;
- embeddings;
- file summaries;
- database schema;
- document structure;
- tool results.

Invalidate khi source thay đổi.

---

# 35. COST VISIBILITY

Không forecast toàn bộ project như một cam kết.

Mỗi request hiển thị:

```text
MODEL
...

INPUT
...

CACHED
...

OUTPUT
...

ACTUAL COST
...

LATENCY
...
```

---

# 36. OPTIMIZATION VISIBILITY

Ngoài actual cost:

```text
Original candidate context
63,218 tokens

Sent
17,814 tokens

Avoided
45,404 tokens
```

Nếu API free:

```text
Context avoided
71.8%
```

vẫn hiển thị.

---

# 37. REQUEST COST WARNING

User có policy:

```text
AUTO

Warn if estimated request > $0.50
Warn before premium escalation
Do not ask otherwise
```

Không interrupt user liên tục.

---

# 38. USER MODES

## Economy

Ưu tiên:

local → cheap → premium.

## Balanced

Tối ưu:

quality / cost.

## Quality

Ưu tiên quality nhưng vẫn loại bỏ AI waste.

Lưu ý:

Ngay cả Quality Mode vẫn phải:

- deduplicate;
- retrieve relevant context;
- control output;
- early stop.

---

# 39. MEMORY INSPECTOR

UI phải có:

## AI CURRENTLY KNOWS

```text
Project Goal
Current State
Architecture
Decisions
Constraints
Completed Tasks
Current Tasks
Known Problems
Important Files
User Rules
```

User được:

Edit

Delete

Pin

Correct

Supersede.

---

# 40. MEMORY CONFLICT

Nếu user nói:

"Không dùng MinerU nữa."

System phải tạo:

```text
old decision:
MinerU

status:
superseded

new decision:
...

effective:
now
```

Không để retrieval lấy decision cũ như hiện hành.

---

# 41. NEVER SILENTLY DELETE IMPORTANT MEMORY

Compression không được phá:

- user constraint;
- architecture decision;
- security rule;
- unresolved issue;
- current task.

---

# 42. CONTEXT DEBUGGER

Advanced UI:

```text
WHY DID AI RECEIVE THIS?
```

User click từng context chunk.

System giải thích:

```text
table_geometry.py

Reason:
called by build_table()

Relevance:
94%

Tokens:
1,218
```

Điều này giúp kiểm tra Context Engine.

---

# 43. REQUEST INSPECTOR

Mỗi request có:

```text
User Input
↓
TaskSpec
↓
Retrieved Memory
↓
Retrieved Files
↓
Compiled Prompt
↓
Selected Model
↓
Actual Usage
↓
Result
↓
Memory Delta
```

Developer mode cho phép inspect toàn pipeline.

---

# 44. PRIVACY

Project Brain phải có khả năng local-first.

Tối thiểu:

- local database;
- encrypted secrets;
- API keys không đưa vào prompt;
- provider-specific data policy;
- redact secrets trước API call.

---

# 45. DATABASE

MVP đề xuất:

SQLite.

Không cần server database cho single-user local application.

Tables:

```text
projects
project_state
memories
memory_events
tasks
conversations
messages
artifacts
artifact_index
model_registry
model_performance
requests
usage
tool_calls
cache
```

---

# 46. VECTOR SEARCH

Không dùng vector DB riêng ở MVP nếu không cần.

Có thể:

SQLite
+
FTS5
+
embedding index

hoặc lightweight vector extension.

Hybrid Retrieval:

```text
keyword
+
semantic
+
structured filters
+
dependency graph
```

---

# 47. TOKEN COUNTING

Token calculation phải diễn ra:

Before request

After context selection

After prompt compilation

After API response

Record:

```text
candidate_tokens
selected_tokens
prompt_tokens
cached_tokens
completion_tokens
avoided_tokens
```

---

# 48. OPTIMIZATION PIPELINE

Mỗi request phải chạy:

```text
1 USER REQUEST

2 TASK PARSING

3 ACTIVE STATE LOAD

4 MEMORY RETRIEVAL

5 ARTIFACT RETRIEVAL

6 RELEVANCE RANKING

7 DEDUPLICATION

8 CONTEXT PRUNING

9 TASKSPEC COMPILATION

10 OUTPUT CONTRACT

11 MODEL ROUTING

12 TOKEN ESTIMATION

13 EXECUTION

14 VALIDATION

15 EARLY STOP / ESCALATION

16 MEMORY DELTA

17 USAGE RECORD
```

---

# 49. IMPORTANT RULE: OPTIMIZER MUST NOT COST MORE THAN IT SAVES

Mỗi optimization operation có cost.

Ví dụ:

LLM compression cần 5k token

nhưng chỉ tiết kiệm 2k downstream

→ DO NOT COMPRESS.

Rule:

```text
Expected Saving
>
Optimization Cost × Safety Margin
```

Nếu không:

pass-through.

---

# 50. OPTIMIZATION HIERARCHY

Ưu tiên từ rẻ nhất:

```text
Exact Cache
↓
Rules
↓
Deduplication
↓
Structural Parsing
↓
Keyword Retrieval
↓
Embedding Retrieval
↓
Local Small Model
↓
Cheap API Model
↓
Premium Model
```

---

# 51. CODING AGENT SPECIAL MODE

Khi coding:

```text
User Request
↓
TaskSpec
↓
Repo Map
↓
Symbol Search
↓
Dependency Search
↓
Relevant Code
↓
Git Diff
↓
Minimal Prompt
↓
Patch
↓
Tests
↓
STOP
```

Không:

```text
Read whole repo
→ think
→ read more
→ rewrite files
→ explain
```

---

# 52. LONG-RUNNING PROJECT BEHAVIOR

Một project có thể có:

10 messages

hoặc:

100,000 messages.

Active context size không được tăng tuyến tính theo history.

Target:

```text
History grows:
10x

Default context:
approximately constant
```

Đây là một acceptance criterion quan trọng.

---

# 53. MEMORY PERFORMANCE TARGET

Ví dụ:

Project raw history:

```text
1,000,000 tokens
```

Task mới không liên quan history sâu:

Default retrieved project memory:

```text
< 5,000 tokens
```

Nếu cần event cũ:

retrieve đúng event.

Không load 1M token.

---

# 54. QUALITY GUARDRAIL

Optimization phải đo:

```text
Task success before optimization
vs
Task success after optimization
```

Nếu saving tăng nhưng success giảm mạnh:

optimizer thất bại.

Primary optimization function:

```text
Minimize:
Token + Cost + Latency + Waste

Subject to:
Required Quality >= threshold
```

---

# 55. LEARNING LOOP

Sau mỗi task lưu:

```text
Task type
Model
Context size
Output size
Cost
Latency
Success
Retry
User correction
```

Router dần học:

> Với user/project này, loại task X dùng model Y là hiệu quả nhất.

---

# 56. USER CORRECTION SIGNAL

Nếu user nói:

"Không đúng."

"Undo."

"Đừng làm thế."

"Model này làm sai."

được coi là negative signal.

Nếu:

"OK."

"Đúng rồi."

test pass

user accepts patch

→ positive signal.

---

# 57. MVP SCOPE

MVP không cần làm mọi thứ.

## Phase 1

Build:

1. Project Workspace
2. Structured Project Memory
3. Incremental Memory Update
4. History Cold Storage
5. Context Retrieval
6. Deduplication
7. Prompt Compiler
8. Output Controller
9. Token Meter
10. Cost Ledger
11. One API provider
12. Local model adapter
13. Memory Inspector

Mục tiêu:

**chứng minh persistent project + giảm context.**

---

# 58. PHASE 2

Thêm:

- multi-provider;
- model router;
- semantic cache;
- model performance learning;
- advanced coding Repo Map;
- progressive retrieval;
- early stopping;
- cost warnings.

---

# 59. PHASE 3

Thêm:

- automatic task decomposition;
- multi-model execution;
- enterprise policy;
- team memory;
- shared project brain;
- organization knowledge;
- model marketplace;
- automated benchmarking.

---

# 60. PROVIDER ABSTRACTION

Interface:

```python
class ModelProvider:

    def chat(...)
    def stream(...)
    def count_tokens(...)
    def pricing(...)
    def capabilities(...)
```

Implement:

```text
OpenAIProvider
AnthropicProvider
GeminiProvider
OpenRouterProvider
OllamaProvider
VLLMProvider
```

Core application không được phụ thuộc provider cụ thể.

---

# 61. CORE ENGINE INTERFACES

```python
class RequestAnalyzer
class MemoryManager
class ContextRetriever
class ContextRanker
class ContextPruner
class PromptCompiler
class ModelRouter
class OutputController
class ExecutionEngine
class SuccessValidator
class MemoryUpdater
class UsageTracker
```

Các module phải độc lập.

Không viết một Agent class khổng lồ.

---

# 62. OBSERVABILITY

Log mỗi stage:

```text
request_received

task_parsed

memory_retrieved

context_candidates

context_selected

context_removed

prompt_compiled

model_selected

request_sent

response_received

validation_completed

memory_updated
```

Phải đo được token ở từng stage.

---

# 63. ANTI-PATTERNS

Codex KHÔNG được:

### A.

Gửi full conversation mỗi request.

### B.

Summary toàn bộ history sau mỗi message.

### C.

Gọi LLM để làm việc regex/rule xử lý được.

### D.

Embedding lại file không thay đổi.

### E.

Đọc full repository trước mọi coding task.

### F.

Generate full file nếu diff đủ.

### G.

Retry không giới hạn.

### H.

Dùng premium model làm router mặc định.

### I.

Lưu một giant project_summary.md rồi gửi toàn bộ mỗi request.

### J.

Đặt một max_tokens cực lớn cho mọi task.

---

# 64. KEY ACCEPTANCE TEST — LONG PROJECT

Create project.

Generate:

```text
1,000 historical interactions.
```

Raw history >500k tokens.

New request chỉ liên quan current task.

PASS nếu:

```text
Full history sent = FALSE

Relevant memory retrieved = TRUE

Context < configurable threshold

Important active constraints preserved
```

---

# 65. KEY ACCEPTANCE TEST — MEMORY

Turn 10:

User quyết định:

```text
Never modify OCR module.
```

Turn 500:

User:

```text
Fix DOCX table.
```

System phải retrieve:

```text
Never modify OCR module.
```

mặc dù raw conversation không được gửi.

---

# 66. KEY ACCEPTANCE TEST — SUPERSEDED MEMORY

Turn 20:

```text
Use PaddleOCR.
```

Turn 100:

```text
Stop using PaddleOCR. Use MinerU.
```

Turn 1,000:

System phải retrieve:

```text
MinerU
```

Không retrieve PaddleOCR như current decision.

---

# 67. KEY ACCEPTANCE TEST — OUTPUT WASTE

Request:

```text
Rename function A → B.
```

PASS:

- patch;
- required references updated.

FAIL:

- architecture explanation;
- README rewrite;
- unrelated refactor;
- long summary.

---

# 68. KEY ACCEPTANCE TEST — EARLY STOP

Task:

```text
Fix failing unit test X.
```

Once:

```text
test X = PASS
affected test suite = PASS
```

Agent stops.

Không tiếp tục optimization ngoài scope.

---

# 69. KEY ACCEPTANCE TEST — FREE TOKEN

Set:

```text
token_price = 0
```

Optimizer vẫn phải:

- deduplicate;
- retrieve relevant context;
- prune irrelevant context;
- control output;
- early stop.

Token price = 0 không được disable optimizer.

---

# 70. UX HOME

Sidebar:

```text
Projects

PDF Converter
Financial Analyzer
Automation Tool
...
```

Main:

```text
Conversation / Work Area
```

Right panel:

```text
AI Efficiency

Model
Context
Cost
Waste avoided
Memory
```

User không cần quản lý session/chat.

---

# 71. REQUEST STATUS

Trong khi chạy:

```text
Understanding task

Retrieving project memory

Found 3 relevant decisions

Found 2 relevant files

Removed 18k irrelevant tokens

Using: Model X

Executing

Testing

Done
```

Không hiển thị hidden chain-of-thought.

Chỉ hiển thị operational status.

---

# 72. RESULT FOOTER

Mỗi response có compact footer:

```text
Model       X
Input       8.4k
Output      624
Avoided     ~31k context
Cost        $0.04
```

Click để mở chi tiết.

---

# 73. PRODUCT DIFFERENTIATOR

Không định vị:

"Cheaper ChatGPT."

Không định vị:

"Prompt compressor."

Không định vị:

"AI router."

Định vị:

## User-Owned AI Workspace

Một workspace:

- nhớ project;
- không khóa vào provider;
- sử dụng đúng context;
- sử dụng đúng model;
- tránh AI waste;
- đo actual cost;
- giữ project knowledge lâu dài.

---

# 74. CORE PRODUCT PROMISE

> Work in one place.  
> Keep your project memory.  
> Send only what AI needs.  
> Generate only what you need.  
> Use expensive intelligence only when necessary.

---

# 75. DEVELOPMENT PRIORITY

Codex phải ưu tiên theo thứ tự:

```text
1 Persistent Project Memory
2 Memory correctness
3 Context retrieval
4 Context minimization
5 Token instrumentation
6 Prompt compilation
7 Output control
8 Coding retrieval
9 Early stopping
10 Model routing
11 UI optimization
```

Không bắt đầu bằng UI đẹp.

Không bắt đầu bằng multi-agent.

Không bắt đầu bằng 20 model providers.

---

# 76. FIRST TECHNICAL MILESTONE

Build một prototype chứng minh:

```text
Project history:
100,000+ tokens

↓

New task

↓

Relevant persistent memory:
<3,000 tokens

+

Relevant artifact context:
<necessary threshold

↓

LLM

↓

Correct result
```

Sau đó so sánh với baseline:

```text
Baseline:
full/large conversation context

Optimized:
MSC Engine
```

Đo:

```text
Input tokens
Output tokens
Latency
Cost
Task success
Retries
```

Nếu token giảm mạnh nhưng task success tương đương hoặc tốt hơn:

**Product thesis validated.**

---

# 77. NON-NEGOTIABLE ARCHITECTURAL RULE

Hệ thống phải phân biệt rõ:

```text
STORAGE ≠ MEMORY ≠ CONTEXT
```

**Storage**

Lưu mọi thứ.

**Memory**

Thông tin project đã được tổ chức.

**Context**

Chỉ những gì model cần cho request hiện tại.

Đây là nguyên tắc kiến trúc quan trọng nhất của toàn bộ sản phẩm.

---

# 78. FINAL SYSTEM OBJECTIVE

Không cố làm model thông minh hơn.

Hệ thống phải làm cho model:

```text
READ LESS

REMEMBER BETTER

CALL LESS

GENERATE LESS

RETRY LESS

PAY LESS

WHILE

COMPLETING THE SAME TASK
```

Mọi feature mới phải trả lời được câu hỏi:

> Feature này có giúp tăng Task Success / AI Efficiency không?

Nếu không:

Không đưa vào core product.

---

# 79. PROJECT ADVISOR VÀ PROJECT BRD GATE

Project Advisor chỉ được kích hoạt khi user bắt đầu một công việc có quy mô hoặc nhiều bước, ví dụ: tạo video, xây phần mềm, coding trong folder, nghiên cứu, phân tích dữ liệu, automation hoặc sản xuất nhiều đầu ra. Chat hỏi đáp thông thường không bị ép qua quy trình dự án.

Khi phát hiện project intent, hệ thống phải:

1. Phỏng vấn user bằng ngôn ngữ nghiệp vụ, ưu tiên tick chọn và Yes/No.
2. Không hỏi user chọn framework, thư viện, API hay kiến trúc trừ khi user chủ động yêu cầu quyền kiểm soát kỹ thuật.
3. Không suy đoán các yêu cầu còn thiếu có thể làm thay đổi kết quả.
4. Tạo Project Brief/BRD ngắn gồm mục tiêu, đầu vào, đầu ra, quy mô, ràng buộc, tiêu chí hoàn thành và quyền thay đổi dữ liệu.
5. Yêu cầu user xác nhận brief trước khi thực thi hoặc tiêu token đáng kể.

# 80. TASK-AWARE MODEL VÀ TOOL ROUTING

Không dùng một model duy nhất cho toàn bộ dự án. Pipeline bắt buộc:

```text
USER GOAL
→ CLARIFICATION
→ PROJECT BRIEF
→ TASK DECOMPOSITION
→ TOOL SELECTION
→ MODEL SELECTION
→ PROVIDER ROUTING
→ VERIFICATION
```

OpenRouter Auto Router có thể được dùng để chọn model theo tác vụ, nhưng Minimum phải kiểm soát allowed models, chính sách dữ liệu, giới hạn chi phí và khả năng tool. Model routing không được nhầm với tool routing: chọn Gemini không tự cấp quyền Gmail; chọn GPT không tự có terminal; chọn Claude không tự có quyền sửa file.

User không phải chọn model trong luồng mặc định. App chỉ xin xác nhận khi đổi model làm tăng đáng kể chi phí, thay đổi chính sách riêng tư, hoặc ảnh hưởng mức chất lượng đã chọn.

# 81. AI PROJECT FINANCE MANAGER

Mỗi project phải có ngân sách AI riêng và ba chiến lược sử dụng:

- **Tiết kiệm:** model rẻ cho phần lớn bước, giới hạn retry và số biến thể.
- **Cân bằng:** model mạnh cho bước quyết định/review, model rẻ cho tác vụ lặp lại.
- **Chất lượng:** model tốt nhất phù hợp tác vụ, nhiều vòng kiểm tra và biến thể hơn.

Dashboard phải hiển thị tối thiểu:

- tổng input/output token;
- chi phí thực tế khi provider cung cấp;
- tác vụ tiêu tốn nhiều nhất;
- tỷ lệ chi phí theo bước;
- retry/rework cost;
- cảnh báo tốc độ đốt ngân sách;
- phương án rẻ hơn và ảnh hưởng dự kiến tới chất lượng.

Nguyên tắc: không hiển thị số liệu giả. Dữ liệu lịch sử không có usage phải được gắn nhãn “chưa đo được”.

# 82. PROJECT EXECUTION CONSENT

Trước khi thực thi, giao diện phải cho user thấy và xác nhận:

```text
PROJECT BRIEF
ROUTING STRATEGY
BUDGET MODE
EXPECTED OUTPUT
WRITE/EXTERNAL ACTION PERMISSIONS
```

Mọi lần dự kiến vượt ngân sách, chuyển sang model đắt hơn đáng kể hoặc gửi dữ liệu sang provider có chính sách khác đều phải yêu cầu xác nhận lại.

# 83. UNIVERSAL TOOL REGISTRY — “TAY CHÂN” CỦA AI

Minimum phải quản lý model và công cụ thành hai lớp độc lập. Model dùng để hiểu, lập kế hoạch và sinh nội dung; Tool Registry dùng để thực hiện hành động thật.

| Nhóm | Adapter mục tiêu | Bằng chứng hoàn thành bắt buộc |
|---|---|---|
| Local project | Filesystem, terminal, package runner | diff, file hash, exit code, test result |
| Video | Sora/Runway/Kling/Veo; Remotion/FFmpeg | video ID hoặc file MP4 kiểm tra được |
| Image | Image generation provider | image ID hoặc file PNG/JPG |
| Audio | TTS, transcription, FFmpeg | audio ID hoặc file MP3/WAV |
| Documents | DOCX/XLSX/PPTX/PDF runtime | file đúng định dạng và mở/validate được |
| Email & calendar | Gmail, Outlook, Calendar | message/event ID từ provider |
| Web & research | Browser/search/citation pipeline | URL, timestamp và nguồn truy xuất |
| Source & deploy | GitHub, Vercel, Cloudflare | commit/deployment ID và URL |
| RPA | UiPath, Power Automate, n8n, Make, Robocorp | job/run ID, trạng thái và output artifact |

Không hard-code theo từng câu user. Mỗi adapter tự công bố machine-readable capability gồm input/output schema, quyền, chi phí, dữ liệu rời thiết bị, khả năng đảo ngược và evidence trả về.

# 84. CAPABILITY NEGOTIATION

Trước khi gọi model hoặc tool, hệ thống phải tạo Capability Plan:

```text
Required outcomes/actions
→ Available adapters
→ Missing adapters or permissions
→ Supported / Partial / Unsupported
→ Cost, privacy and approval requirements
```

UI phải nói bằng ngôn ngữ user: **Làm được**, **Làm được một phần**, hoặc **Chưa làm được**; tách rõ phần thực thi được, phần còn thiếu và connector cần bổ sung. OpenRouter/model luôn nhận Capability Manifest hiện hành và không được tự suy đoán mình có terminal, filesystem, Gmail, browser, video renderer hoặc RPA.

# 85. RPA ORCHESTRATION

Minimum tương tác hai chiều với UiPath, Microsoft Power Automate, n8n, Make và Robocorp qua adapter/API/webhook, ưu tiên input/output có schema thay vì prompt tự do.

```text
TaskSpec → workflow allowlist → map input → preview data/action
→ user approval for side effects → start job → monitor status
→ collect logs/output/artifacts → validate evidence → memory + cost ledger
```

AI không được tự chạy workflow lạ, tự sửa workflow production hoặc truyền secret vào prompt. Gửi email, xóa/ghi đè dữ liệu, upload/publish, giao dịch tài chính, thay đổi quyền và thao tác production luôn cần confirmation gate.

# 86. EXECUTION EVIDENCE CONTRACT

Mọi tuyên bố “đã tạo”, “đã gửi”, “đã chạy”, “đã đăng”, “đã deploy” hoặc “đã cập nhật” phải có evidence do tool trả về:

```text
tool_call_id, adapter_id, action, status,
started_at, completed_at, artifact_ids/external_ids,
validation_result, user_approval_id
```

Không có evidence → không được báo hoàn thành. Model response không phải bằng chứng thực thi.

# 87. DELIVERY PHASES FOR TOOL EXPANSION

1. Foundation: Tool Registry, Capability Manifest, permission/approval engine, evidence ledger.
2. Local execution: filesystem + terminal/runtime + tests.
3. Knowledge work: DOCX/XLSX/PPTX/PDF, browser/search, email/calendar.
4. Media: image, audio, video generation và FFmpeg/Remotion assembly.
5. RPA: n8n/Make webhook trước; UiPath/Power Automate/Robocorp adapters tiếp theo.
6. Production actions: GitHub/deploy và workflow có side effect cao sau security review.

Connector chỉ được chuyển từ “Planned” sang “Available” khi có integration test thật, permission boundary và evidence validation. UI không được gắn nhãn đã kết nối chỉ vì user nhập URL/key.

# 88. MANDATORY LEGAL & SAFETY GATE

Mọi request phải qua Legal & Safety Gate trước model routing và tool execution. Kết quả gồm:

- **ALLOW:** chưa phát hiện rủi ro cần chặn; tiếp tục với policy provider.
- **CONSENT REQUIRED:** có dữ liệu cá nhân, hình ảnh/giọng người thật, tài sản bản quyền hoặc hành động bên ngoài; phải xác nhận quyền, mục đích, provider nhận dữ liệu và phạm vi sử dụng.
- **BLOCK:** mạo danh/lừa đảo, deepfake trái phép, nội dung tình dục không đồng thuận hoặc liên quan trẻ em, malware/phishing, hành vi né luật hoặc gây hại rõ ràng; không gọi model/tool và không tiêu token generation.

Gate phải áp dụng cho chat, upload, project execution, media generation và RPA. Kiểm tra tự động chỉ là lớp an toàn, không phải ý kiến pháp lý; trường hợp không chắc chắn phải chuyển human/legal review.

# 89. SYNTHETIC MEDIA COMPLIANCE

Video, image và TTS phải mặc định:

1. Không clone người khác nếu thiếu consent có thể kiểm chứng.
2. Cấm mạo danh để lừa đảo, thao túng, giao dịch tài chính hoặc tạo bằng chứng giả.
3. Gắn disclosure/provenance máy đọc được và nhãn nhìn thấy khi nội dung có thể bị nhầm là thật.
4. Ghi model/provider, thời điểm, consent ID, prompt hash và artifact ID.
5. Cho phép xoá dữ liệu đầu vào và artifact theo retention policy.
6. Không đưa dữ liệu sinh trắc học/giọng nói vào prompt hoặc log không cần thiết.

MVP chỉ bật TTS bằng giọng tổng hợp có sẵn và video hư cấu/không mô phỏng người thật. Voice cloning và realistic digital replica là tính năng high-risk, chỉ được mở sau legal review, identity/liveness verification và consent ledger.

# 90. LEGAL AUDIT TRAIL

Mỗi request cần lưu tối thiểu:

```text
legal_assessment_id
policy_version
jurisdiction_assumptions
risk_level
matched_risk_categories
consent_id / approval_id
provider_data_disclosure
decision: allow / consent / block / human_review
tool evidence
```

Không lưu hidden chain-of-thought. Chỉ lưu rule/policy match và quyết định vận hành đủ để audit.

# 91. PRODUCT EDITION SPLIT

Minimum có hai edition với ranh giới build-time, không phải UI toggle:

## Personal Edition — private

- Chat và coding.
- Local Companion, filesystem, terminal/runtime.
- Media: image, video, TTS/audio và assembly.
- Documents: DOCX/XLSX/PPTX/PDF.
- Email, calendar, browser, source control và deploy.
- RPA adapters: UiPath, Power Automate, n8n, Make, Robocorp.
- Legal/Safety Gate, consent ledger và evidence ledger bắt buộc.

Personal adapters, provider secrets, workflow definitions và production credentials phải nằm trong private packages/repository và không được publish lên GitHub công khai.

## Community/Commercial GitHub Edition — public

- Chat đa model.
- Đọc file được hỗ trợ.
- Coding workspace: tạo/sửa file code sau khi user duyệt.
- Public adapter interface để cộng đồng tự mở rộng.

Không đóng gói media generation, TTS, Office/PDF runtime, email/calendar, browser automation, deploy connector hoặc RPA implementation. UI không được quảng cáo các capability không có trong build.

# 92. RELEASE ISOLATION

Edition được chọn tại build time (`VITE_MINIMUM_EDITION=personal|community`). Không cho phép user đổi edition trong runtime.

```text
Private monorepo
├─ apps/minimum-core
├─ packages/public-chat-coding
└─ packages/private-adapters
   ├─ media
   ├─ documents
   ├─ communications
   ├─ deploy
   └─ rpa

GitHub release
├─ minimum-core
├─ public-chat-coding
└─ adapter interfaces only
```

CI của Community Edition phải fail nếu bundle/source chứa private adapter implementation, endpoint nội bộ, secret name/value, workflow production hoặc proprietary policy. Personal và Community có artifact, signing key, environment và deployment pipeline riêng.

# 93. EDITION ACCEPTANCE TESTS

Community build PASS khi:

- Chat và coding hoạt động.
- Media/email/RPA request được trả lời rõ là không có trong edition.
- Không import hoặc bundle private adapter.
- Không thể bật private capability bằng sửa localStorage, query string hoặc DevTools.

Personal build PASS khi:

- Tool Registry hiển thị adapter thật theo integration test.
- Legal Gate và confirmation gate chạy trước mọi side effect.
- Mọi completion claim có evidence.
