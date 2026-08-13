export const supportedLocales = ["en", "vi", "es", "fr", "de", "ja", "ko", "zh"] as const;
export type AppLocale = typeof supportedLocales[number];

export const localeNames: Record<AppLocale, string> = {
  en: "English", vi: "Tiếng Việt", es: "Español", fr: "Français",
  de: "Deutsch", ja: "日本語", ko: "한국어", zh: "中文",
};

const en = {
  newChat: "New chat", newProject: "Create project with folder", connectModel: "Connect model",
  history: "HISTORY & PROJECTS", searchProjects: "Search projects or past work…",
  active: "ACTIVE", archived: "ARCHIVED", dragHere: "Drag projects here", historyItems: "history items",
  noProjects: "No matching project or content.", help: "Help", project: "PROJECT",
  noFolder: "Folder not connected", searchProject: "Search this project…", you: "You",
  normalChat: "Chat", normalChatHint: "Questions and analysis", projectWork: "Work with project",
  chooseFolder: "Choose a folder", changeFolder: "Change folder", attach: "Attach file",
  autoContext: "Automatic context", send: "Send", prompt: "Describe your goal or attach files for analysis…",
  promptNoModel: "Connect a model before sending a request…", current: "Current", memory: "Memory",
  usage: "Usage", language: "Language", processing: "Userward is processing your request",
};

const dictionaries: Record<AppLocale, typeof en> = {
  en,
  vi: {newChat:"Chat mới",newProject:"Tạo dự án có folder",connectModel:"Kết nối model",history:"LỊCH SỬ & DỰ ÁN",searchProjects:"Tìm dự án hoặc nội dung đã làm…",active:"ĐANG LÀM",archived:"ĐÃ LƯU TRỮ",dragHere:"Kéo dự án vào đây",historyItems:"mục lịch sử",noProjects:"Không tìm thấy dự án hoặc nội dung phù hợp.",help:"Trợ giúp",project:"DỰ ÁN",noFolder:"Chưa kết nối folder",searchProject:"Tìm trong dự án…",you:"Bạn",normalChat:"Chat thường",normalChatHint:"Hỏi đáp và phân tích",projectWork:"Làm việc với dự án",chooseFolder:"Chọn folder",changeFolder:"Đổi folder",attach:"Đính kèm file",autoContext:"Context tự động",send:"Gửi",prompt:"Nêu mục tiêu hoặc đính kèm file để phân tích…",promptNoModel:"Kết nối model trước khi gửi yêu cầu…",current:"Hiện tại",memory:"Bộ nhớ",usage:"Sử dụng",language:"Ngôn ngữ",processing:"Minimum đang xử lý yêu cầu"},
  es: {...en,newChat:"Nuevo chat",newProject:"Crear proyecto con carpeta",connectModel:"Conectar modelo",history:"HISTORIAL Y PROYECTOS",searchProjects:"Buscar proyectos o trabajos anteriores…",active:"ACTIVOS",archived:"ARCHIVADOS",help:"Ayuda",project:"PROYECTO",noFolder:"Carpeta no conectada",searchProject:"Buscar en este proyecto…",you:"Tú",normalChat:"Chat",projectWork:"Trabajar con proyecto",chooseFolder:"Elegir carpeta",attach:"Adjuntar archivo",send:"Enviar",language:"Idioma",processing:"Minimum está procesando tu solicitud"},
  fr: {...en,newChat:"Nouveau chat",newProject:"Créer un projet avec dossier",connectModel:"Connecter un modèle",history:"HISTORIQUE ET PROJETS",searchProjects:"Rechercher des projets ou travaux…",active:"ACTIFS",archived:"ARCHIVÉS",help:"Aide",project:"PROJET",noFolder:"Dossier non connecté",searchProject:"Rechercher dans ce projet…",you:"Vous",projectWork:"Travailler sur le projet",chooseFolder:"Choisir un dossier",attach:"Joindre un fichier",send:"Envoyer",language:"Langue",processing:"Minimum traite votre demande"},
  de: {...en,newChat:"Neuer Chat",newProject:"Projekt mit Ordner erstellen",connectModel:"Modell verbinden",history:"VERLAUF & PROJEKTE",searchProjects:"Projekte oder frühere Arbeit suchen…",active:"AKTIV",archived:"ARCHIVIERT",help:"Hilfe",project:"PROJEKT",noFolder:"Ordner nicht verbunden",searchProject:"In diesem Projekt suchen…",you:"Sie",projectWork:"Mit Projekt arbeiten",chooseFolder:"Ordner wählen",attach:"Datei anhängen",send:"Senden",language:"Sprache",processing:"Minimum verarbeitet Ihre Anfrage"},
  ja: {...en,newChat:"新しいチャット",newProject:"フォルダー付きプロジェクトを作成",connectModel:"モデルを接続",history:"履歴とプロジェクト",searchProjects:"プロジェクトや履歴を検索…",active:"進行中",archived:"アーカイブ",help:"ヘルプ",project:"プロジェクト",noFolder:"フォルダー未接続",searchProject:"プロジェクト内を検索…",you:"あなた",projectWork:"プロジェクトで作業",chooseFolder:"フォルダーを選択",attach:"ファイルを添付",send:"送信",language:"言語",processing:"Minimum が処理中です"},
  ko: {...en,newChat:"새 채팅",newProject:"폴더로 프로젝트 만들기",connectModel:"모델 연결",history:"기록 및 프로젝트",searchProjects:"프로젝트 또는 이전 작업 검색…",active:"진행 중",archived:"보관됨",help:"도움말",project:"프로젝트",noFolder:"폴더 연결 안 됨",searchProject:"프로젝트에서 검색…",you:"사용자",projectWork:"프로젝트 작업",chooseFolder:"폴더 선택",attach:"파일 첨부",send:"보내기",language:"언어",processing:"Minimum이 요청을 처리 중입니다"},
  zh: {...en,newChat:"新对话",newProject:"使用文件夹创建项目",connectModel:"连接模型",history:"历史与项目",searchProjects:"搜索项目或历史内容…",active:"进行中",archived:"已归档",help:"帮助",project:"项目",noFolder:"未连接文件夹",searchProject:"在项目中搜索…",you:"你",projectWork:"处理项目",chooseFolder:"选择文件夹",attach:"添加文件",send:"发送",language:"语言",processing:"Minimum 正在处理请求"},
};

export type TranslationKey = keyof typeof en;
export const translate = (locale: AppLocale, key: TranslationKey) => dictionaries[locale]?.[key] ?? en[key];

export function detectLocale(languages: readonly string[] = []): AppLocale {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (supportedLocales.includes(base as AppLocale)) return base as AppLocale;
  }
  return "en";
}
