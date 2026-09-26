/** 触发浏览器下载一个文本文件（主导出与片段摘录共用同一实现） */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/vtt;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
