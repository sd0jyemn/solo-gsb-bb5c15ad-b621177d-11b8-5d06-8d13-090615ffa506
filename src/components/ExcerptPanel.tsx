import { useMemo, useState } from 'react';
import type { Cue } from '../lib/types';
import { planExcerpt } from '../lib/excerpt';
import { serializeVTT } from '../lib/vtt';
import { downloadTextFile } from '../lib/download';
import { formatTimecode } from '../lib/time';
import TimeCodeInput from './TimeCodeInput';

interface Props {
  /** 当前字幕（已按 start 排序），仅读取，不会被修改 */
  cues: Cue[];
  /** 文件头（NOTE/STYLE/REGION 等），摘录导出时原样写回 */
  preamble: string[];
  onToast: (msg: string) => void;
}

function firstLine(text: string): string {
  return text.split('\n')[0]?.replace(/<[^>]+>/g, '') ?? '';
}

/**
 * 片段摘录导出面板：
 * 输入原时间轴上的起止时间（左闭右开区间），实时预览命中的 cue 数量与
 * 裁剪后的时间码，再下载独立的 WebVTT 文件；当前编辑内容不变。
 * 无命中或时间范围无效时说明原因并禁止下载。
 */
export default function ExcerptPanel({ cues, preamble, onToast }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  // 未手动输入时默认覆盖整条时间轴
  const contentEnd = useMemo(() => cues.reduce((m, c) => Math.max(m, c.end), 0), [cues]);
  const effStart = start ?? 0;
  const effEnd = end ?? contentEnd;

  // cues 为空时 planExcerpt 会先返回“没有可摘录的片段”，与起止时间无关
  const plan = useMemo(() => planExcerpt(cues, effStart, effEnd), [cues, effStart, effEnd]);

  const canDownload = !plan.error && plan.hits.length > 0;

  function download() {
    if (!canDownload || plan.start === null || plan.end === null) return;
    // 复用现有序列化与浏览器下载；文件头原样写回，编辑器数据不变
    const text = serializeVTT(plan.hits.map((h) => h.cue), preamble);
    const stamp = (s: number) => formatTimecode(s).replace(/[:.]/g, '-');
    downloadTextFile(`subtitles-excerpt-${stamp(plan.start)}-${stamp(plan.end)}.vtt`, text);
    onToast(`已导出片段摘录：${plan.hits.length} 个片段（当前编辑内容未改动）。`);
  }

  return (
    <section className="panel excerpt-panel">
      <h2>
        片段摘录导出
        <span className="muted small ml">左闭右开区间</span>
      </h2>
      <p className="muted small">
        输入原时间轴上的起止时间，仅导出与区间有正时长交集的片段：起止裁到交集后统一减去摘录起点，
        时间戳标签同步改写；当前编辑内容不变。
      </p>

      <div className="row time-row">
        <span>起点</span>
        <TimeCodeInput value={effStart} disabled={cues.length === 0} onCommit={setStart} />
        <span className="muted small">含</span>
      </div>
      <div className="row time-row">
        <span>终点</span>
        <TimeCodeInput value={effEnd} disabled={cues.length === 0} onCommit={setEnd} />
        <span className="muted small">不含</span>
      </div>

      {plan.error ? (
        <div className="sync-status bad">⛔ {plan.error}</div>
      ) : (
        <div className="sync-status ok">
          ✅ 命中 <strong>{plan.hits.length}</strong> 个片段 · 摘录时长{' '}
          {formatTimecode((plan.end ?? 0) - (plan.start ?? 0))}，下载后时间码从 00:00.000 起算。
        </div>
      )}

      {plan.hits.length > 0 && (
        <ul className="excerpt-list">
          {plan.hits.map((hit) => (
            <li key={hit.cue.id} className="excerpt-row">
              <div className="excerpt-head mono">
                <span className="excerpt-idx">#{hit.index + 1}</span>
                <span>
                  {formatTimecode(hit.cue.start)} → {formatTimecode(hit.cue.end)}
                </span>
                <span className="muted">
                  原 {formatTimecode(hit.clipStart)} – {formatTimecode(hit.clipEnd)}
                </span>
              </div>
              <div className="excerpt-text">{firstLine(hit.cue.text) || '(空文本)'}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="excerpt-actions">
        <button className="btn primary" disabled={!canDownload} onClick={download}>
          下载摘录 WebVTT{canDownload ? `（${plan.hits.length} 个片段）` : ''}
        </button>
      </div>
    </section>
  );
}
