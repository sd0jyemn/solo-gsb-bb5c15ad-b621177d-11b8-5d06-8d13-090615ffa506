import type { Cue } from './types';
import { parseTimecode, formatTimecode } from './time';

/** 吸收浮点噪声（时间戳为毫秒精度，真正的分数差至少 1ms） */
const EPS = 1e-6;

export interface ExcerptHit {
  /** 命中片段在按时间排序后的序号（从 0 计） */
  index: number;
  /** 原时间轴上的交集区间 [clipStart, clipEnd)（秒） */
  clipStart: number;
  clipEnd: number;
  /** 起止裁到交集并统一减去摘录起点后的 cue（标识符/设置/锁定原样保留） */
  cue: Cue;
}

export interface ExcerptPlan {
  /** 摘录区间 [start, end)（秒，左闭右开）；未输入时为 null */
  start: number | null;
  end: number | null;
  hits: ExcerptHit[];
  /** 禁止下载的原因（时间范围无效或无命中）；null 表示可下载 */
  error: string | null;
}

/**
 * 计算片段摘录方案（纯函数，不修改输入，也不改动编辑器数据）：
 * - 仅纳入与左闭右开区间 [start, end) 有正时长交集的 cue，仅端点相接的不纳入；
 * - 各 cue 起止裁到交集 [max(cue.start,start), min(cue.end,end)) 后统一减去 start；
 * - cue 文本中的 WebVTT 时间戳标签只保留落在裁剪后 cue 内部
 *   [clipStart, clipEnd) 的，并按同一偏移（-start）改写；
 *   普通内联标签、文字、标识符、cue 设置原样保留。
 */
export function planExcerpt(cuesInput: Cue[], start: number | null, end: number | null): ExcerptPlan {
  const cues = [...cuesInput].sort((a, b) => a.start - b.start || a.end - b.end);
  const base: ExcerptPlan = { start, end, hits: [], error: null };

  if (cues.length === 0) {
    return { ...base, error: '当前没有可摘录的字幕片段。' };
  }
  if (start === null || end === null) {
    return { ...base, error: '请先输入摘录的起点与终点时间。' };
  }
  if (start < 0) {
    return { ...base, error: '时间范围无效：起点不能早于 00:00.000。' };
  }
  if (!(end > start)) {
    return { ...base, error: '时间范围无效：终点必须晚于起点（左闭右开区间）。' };
  }

  const hits: ExcerptHit[] = [];
  cues.forEach((cue, index) => {
    const clipStart = Math.max(cue.start, start);
    const clipEnd = Math.min(cue.end, end);
    // 仅保留正时长交集；仅端点相接（交集为 0）不纳入
    if (clipEnd - clipStart <= EPS) return;
    hits.push({
      index,
      clipStart,
      clipEnd,
      cue: {
        ...cue,
        start: clipStart - start,
        end: clipEnd - start,
        text: shiftTimestampTags(cue.text, clipStart, clipEnd, start),
      },
    });
  });

  if (hits.length === 0) {
    return {
      start,
      end,
      hits,
      error: `区间 ${formatTimecode(start)} – ${formatTimecode(end)} 内没有命中任何片段（仅端点相接不计入）。`,
    };
  }
  return { start, end, hits, error: null };
}

const TAG_RE = /<([^<>]+)>/g;

/**
 * 改写 cue 文本中的 WebVTT 时间戳标签（如 `<00:01.500>`）：
 * 落在裁剪后 cue 内部 [clipStart, clipEnd) 的标签保留并减去 offset，
 * 区间外（含恰好落在右端点）的标签移除；
 * 非时间戳的内联标签（`<b>`、`<i>`、`<v …>` 等）与文字原样保留。
 */
export function shiftTimestampTags(
  text: string,
  clipStart: number,
  clipEnd: number,
  offset: number,
): string {
  return text.replace(TAG_RE, (whole, inner: string) => {
    const t = parseTimecode(inner);
    if (t === null) return whole; // 普通内联标签原样保留
    if (t < clipStart - EPS || t >= clipEnd - EPS) return '';
    return `<${formatTimecode(t - offset)}>`;
  });
}
