export type InterfaceLanguage = "en" | "zh";
const statuses: Record<string, string> = {
  draft:"草稿",open:"等待加入",live:"进行中",judging:"证据审核中",pending_settlement:"等待结算",
  settled:"已结算",cancelled:"已取消",disputed:"结果复核中",refunded:"积分已退回",
  completed:"已完成",preview:"预览",
};
const proofs: Record<string, string> = { text:"文字",photo:"照片",image:"图片",video:"视频",gps:"位置记录",url:"链接",mixed:"组合证据" };
/** Only canonical interface labels are translated. Never pass user-authored
 * titles/rules or server verdict explanations through these lookup tables. */
export function questStatusText(language: InterfaceLanguage, status: string): string {
  return language === "zh" ? statuses[status] ?? status.replace(/_/g," ") : status.replace(/_/g," ");
}
export function proofTypeText(language: InterfaceLanguage, type: string): string {
  return language === "zh" ? proofs[type] ?? type.replace(/_/g," ") : type.replace(/_/g," ");
}
