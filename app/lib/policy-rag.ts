export type PolicyLocale = "vi" | "en" | "es" | "fr" | "de" | "ja" | "ko" | "zh" | "unknown";
export type PolicyLevel = "allow" | "consent" | "review" | "block";

/** Local keyword / multi-signal policy check. Not vector RAG or remote retrieval. */
export type PolicyMatch = { id: string; title: string; score: number; version: string };
export type PolicyAssessment = {
  level: PolicyLevel; title: string; reason: string; checks: string[];
  locale: PolicyLocale; confidence: number; policyVersion: string; matches: PolicyMatch[];
  decisionBasis: "no-material-match" | "local-keyword-policy" | "multi-signal-rule" | "needs-semantic-review";
};


type PolicyDocument = {
  id: string; version: string; risk: "critical" | "high" | "medium";
  title: Record<"vi" | "en", string>; terms: string[];
};

const POLICY_VERSION = "2026.08.12";
const documents: PolicyDocument[] = [
  { id:"SYN-IMPERSONATION-FRAUD", version:POLICY_VERSION, risk:"critical", title:{vi:"Mạo danh tổng hợp và gian lận",en:"Synthetic impersonation and fraud"}, terms:["mạo danh","giả giọng","nhái giọng","lừa chuyển tiền","mã otp","clone voice","impersonate","wire money","one time password","código otp","suplantar identidad","virement","usurpation","überweisung","なりすまし","송금","冒充","转账"] },
  { id:"MINOR-SEXUAL-SAFETY", version:POLICY_VERSION, risk:"critical", title:{vi:"An toàn trẻ vị thành niên và nội dung thân mật",en:"Minor and intimate-content safety"}, terms:["trẻ em khỏa thân","vị thành niên tình dục","ảnh nhạy cảm không đồng thuận","child sexual","minor nude","non-consensual intimate","menor desnudo","mineur nu","minderjährig nackt","児童ポルノ","아동 성착취","未成年人 色情"] },
  { id:"CYBER-CREDENTIAL-THEFT", version:POLICY_VERSION, risk:"critical", title:{vi:"Mã độc, phishing và đánh cắp thông tin xác thực",en:"Malware, phishing and credential theft"}, terms:["tạo mã độc","đánh cắp mật khẩu","trang phishing","né xác minh","create malware","steal credentials","phishing kit","robar credenciales","voler identifiants","anmeldedaten stehlen","認証情報を盗む","자격 증명 탈취","窃取凭据"] },
  { id:"PRIVACY-BIOMETRICS", version:POLICY_VERSION, risk:"high", title:{vi:"Dữ liệu cá nhân và sinh trắc học",en:"Personal and biometric data"}, terms:["dữ liệu khách hàng","căn cước","sinh trắc học","giọng của nhân viên","personal data","customer list","biometric","employee voice","datos personales","données personnelles","personenbezogene daten","個人情報","개인정보","个人信息"] },
  { id:"COPYRIGHT-PROVENANCE", version:POLICY_VERSION, risk:"medium", title:{vi:"Bản quyền, giấy phép và provenance",en:"Copyright, licensing and provenance"}, terms:["xóa watermark","sao chép nguyên bài hát","dùng logo","remove watermark","copy entire movie","copyrighted asset","eliminar marca de agua","supprimer filigrane","wasserzeichen entfernen","透かしを削除","워터마크 제거","删除水印"] },
  { id:"EXTERNAL-SIDE-EFFECT", version:POLICY_VERSION, risk:"medium", title:{vi:"Hành động có hậu quả bên ngoài",en:"External side effects"}, terms:["gửi email","đăng công khai","chuyển tiền","xóa dữ liệu","send email","publish publicly","transfer money","delete data","enviar correo","publier","überweisen","送信","게시","发布"] },
];

const normalize = (value:string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu," ").replace(/\s+/g," ").trim();
export function detectPolicyLocale(input:string):PolicyLocale {
  if (/[\u3040-\u30ff]/u.test(input)) return "ja";
  if (/[\uac00-\ud7af]/u.test(input)) return "ko";
  if (/[\u3400-\u9fff]/u.test(input)) return "zh";
  const normalized=normalize(input);
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]/i.test(input) || /\b(toi|muon|khong|nguoi|du lieu|yeu cau|phan tich|trong file)\b/i.test(normalized)) return "vi";
  const q=` ${normalized} `;
  if (/\b(el|la|los|las|para|quiero|datos)\b/.test(q)) return "es";
  if (/\b(le|la|les|pour|je|donnees)\b/.test(q)) return "fr";
  if (/\b(der|die|das|fur|ich|daten)\b/.test(q)) return "de";
  return /[a-z]/i.test(input) ? "en" : "unknown";
}

export function retrievePolicies(input:string, topK=4):PolicyMatch[] {
  const q=normalize(input);
  if (!q) return [];
  const locale=detectPolicyLocale(input); const titleLocale=locale==="vi"?"vi":"en";
  return documents.map(doc=>{
    let score=0;
    for(const term of doc.terms){const t=normalize(term); if(q.includes(t)) score+=Math.min(1,.45+t.split(" ").length*.14); else {const words=t.split(" "); const hit=words.filter(w=>w.length>2&&q.includes(w)).length; if(words.length>1&&hit>=2)score+=.18*hit;}}
    return {id:doc.id,title:doc.title[titleLocale],score:Math.min(1,score),version:doc.version};
  }).filter(match=>match.score>=.45).sort((a,b)=>b.score-a.score).slice(0,topK);
}

const hasAny=(q:string,values:string[])=>values.some(value=>q.includes(normalize(value)));
export function assessPolicyRisk(input:string):PolicyAssessment {
  const locale=detectPolicyLocale(input), q=normalize(input), matches=retrievePolicies(input);
  const vi=locale==="vi"; const t=(v:string,e:string)=>vi?v:e;
  const impersonation=hasAny(q,["mạo danh","giả giọng","nhái giọng","clone voice","impersonate","suplantar","usurpation","なりすまし","冒充"]) || (hasAny(q,["clone","copy","giả","nhái"])&&hasAny(q,["voice","giọng","face","khuôn mặt"]));
  const moneyTransfer=hasAny(q,["chuyển tiền","wire money","virement","überweisung","송금","转账"]);
  const fraud=hasAny(q,["lừa","otp","steal password","one time password","robar credenciales"]);
  const sexual=hasAny(q,["khỏa thân","tình dục","sexual","nude","intimate","色情"]), minor=hasAny(q,["trẻ em","vị thành niên","child","minor","menor","mineur","minderjährig","児童","아동","未成年人"]);
  const malware=hasAny(q,["mã độc","malware","ransomware","phishing kit","tạo phishing","create malware"]), theft=hasAny(q,["đánh cắp","steal credentials","steal password","robar credenciales","窃取凭据"]);
  const informational=hasAny(q,["case study","giới thiệu","mô tả","giải thích","documentary","overview","quy trình"]);
  const compositeCritical = (impersonation && fraud) || (sexual && minor) || (malware && theft);
  // Educational / documentary wording must not be treated as an attack (BRD §95).
  if (informational && !compositeCritical) return {level:"allow",title:t("Kiểm tra an toàn đã hoàn tất","Safety check completed"),reason:t("Yêu cầu mang tính mô tả hoặc cung cấp thông tin và không có tín hiệu về hành động bị hạn chế.","The request is informational and contains no signal of a restricted action."),checks:[],locale,confidence:.9,policyVersion:POLICY_VERSION,matches:[],decisionBasis:"multi-signal-rule"};
  if (compositeCritical) return {level:"block",title:t("Bị chặn sau đối chiếu policy","Blocked after policy review"),reason:t("Nhiều tín hiệu độc lập cùng khớp một nhóm rủi ro nghiêm trọng; đây không phải quyết định từ một từ khóa đơn lẻ.","Multiple independent signals match a critical-risk policy; this is not a single-keyword decision."),checks:[t("Không gọi model hoặc công cụ","No model or tool call"),t("Lưu policy ID và lý do để audit","Record policy IDs and rationale for audit"),"0 generation tokens"],locale,confidence:.96,policyVersion:POLICY_VERSION,matches,decisionBasis:"multi-signal-rule"};
  const critical=impersonation||fraud||sexual||minor||malware||theft;
  if (critical) return {level:"review",title:t("Cần làm rõ trước khi quyết định","Review required before a decision"),reason:t("Có tín hiệu rủi ro nhưng chưa đủ ngữ cảnh để tự chặn; cần làm rõ mục đích bằng ngôn ngữ đời thường.","A serious-risk signal exists, but evidence is insufficient for an automatic block. Clarify purpose in plain language."),checks:[t("Không suy đoán ý định","Do not infer intent"),t("Yêu cầu semantic review hoặc người duyệt","Require semantic or human review")],locale,confidence:.58,policyVersion:POLICY_VERSION,matches,decisionBasis:"needs-semantic-review"};
  if(matches.length) return {level:"consent",title:t("Cần xác nhận quyền và phạm vi","Rights and scope confirmation required"),reason:t("Nội dung có thể liên quan dữ liệu, bản quyền hoặc hành động bên ngoài; kiểm tra từ khóa cục bộ không tự kết luận tính hợp pháp.","The request may involve personal data, rights, or an external action. A local keyword policy check alone does not determine legality."),checks:[t("Xác nhận quyền và mục đích","Confirm rights and purpose"),t("Hiển thị dữ liệu gửi tới provider","Disclose provider-bound data"),t("Xác nhận lại trước side effect","Reconfirm before side effects")],locale,confidence:Math.max(...matches.map(m=>m.score)),policyVersion:POLICY_VERSION,matches,decisionBasis:"local-keyword-policy"};
  return {level:"allow",title:t("Chưa phát hiện rủi ro vật chất","No material policy risk detected"),reason:t("Không có mục policy cục bộ nào đạt ngưỡng khớp từ khóa. Policy của provider và kiểm tra đầu ra vẫn tiếp tục áp dụng.","No local keyword policy met the match threshold. Provider policy and output checks still apply."),checks:[t("Không dựa vào từ khóa đơn lẻ","No single-keyword blocking"),t("Tiếp tục kiểm tra theo ngữ cảnh","Continue contextual checks")],locale,confidence:.72,policyVersion:POLICY_VERSION,matches,decisionBasis:"no-material-match"};
}
