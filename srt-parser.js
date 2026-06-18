/**
 * Parse / serialize SubRip (.srt) files.
 */
window.SrtParser = (function srtParser() {
  const TIME_RE = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

  function parseTime(h, m, s, ms) {
    return (
      parseInt(h, 10) * 3600
      + parseInt(m, 10) * 60
      + parseInt(s, 10)
      + parseInt(ms, 10) / 1000
    );
  }

  function formatTime(seconds) {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  function parse(content) {
    const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalized) return [];

    const blocks = normalized.split(/\n\n+/);
    const cues = new Array(blocks.length);
    let cueIndex = 0;

    for (let b = 0; b < blocks.length; b += 1) {
      const block = blocks[b];
      const lines = block.split('\n');
      if (lines.length < 2) continue;

      let idx = 0;
      let id = cueIndex + 1;
      const first = lines[0].trim();
      if (/^\d+$/.test(first)) {
        id = parseInt(first, 10);
        idx = 1;
      }

      const timingLine = lines[idx];
      const match = TIME_RE.exec(timingLine);
      if (!match) continue;

      const start = parseTime(match[1], match[2], match[3], match[4]);
      const end = parseTime(match[5], match[6], match[7], match[8]);
      let text = '';
      for (let i = idx + 1; i < lines.length; i += 1) {
        if (i > idx + 1) text += '\n';
        text += lines[i];
      }
      text = text.trim();
      if (!text) continue;

      cues[cueIndex] = { id, start, end, text, translation: null, edited: false };
      cueIndex += 1;
    }

    cues.length = cueIndex;
    return cues;
  }

  function serialize(cues, useTranslation = true) {
    const parts = new Array(cues.length);
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      const text = useTranslation && cue.translation ? cue.translation : cue.text;
      parts[index] = `${index + 1}\r\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\r\n${text}\r\n`;
    }
    return parts.join('\r\n');
  }

  return { parse, serialize, formatTime };
}());
