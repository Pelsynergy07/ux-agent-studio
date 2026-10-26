/** Teams/Zoom .vtt and .srt exports → plain "Speaker: text" lines. Plain text passes through unchanged. */
export function cleanTranscript(text: string): string {
  if (!/^WEBVTT|-->/m.test(text)) return text
  return text
    .replace(/^WEBVTT.*$/m, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^NOTE\b/.test(l))
    .map((l) => l.replace(/<v ([^>]+)>(.*?)(<\/v>)?$/, '$1: $2').replace(/<[^>]+>/g, ''))
    .join('\n')
}
