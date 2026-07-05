/**
 * src/utils/chunker.ts
 * --------------------
 * Utility for structurally chunking source code files.
 * Rather than splitting raw text by arbitrary character counts, this attempts
 * to split code by logical blocks (e.g. functions, classes, interfaces).
 */

export interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
}

const MAX_CHUNK_LINES = 150; // Fallback maximum lines per chunk

/**
 * Parses file content and splits it into logical code blocks.
 * Currently supports a heuristic-based approach for C-like syntaxes 
 * (JS, TS, Java, C#, C++), Python, and general block structures.
 * 
 * @param content The raw string content of the file
 * @param language The programming language of the file
 * @returns Array of CodeChunk objects with start/end lines
 */
export function structurallyChunkFile(content: string, language: string): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  
  if (lines.length === 0) return chunks;

  // For unsupported or unknown languages, fall back to simple line-based chunking
  const supportedStructuralLangs = ['typescript', 'javascript', 'python', 'java', 'go', 'csharp', 'cpp', 'c', 'php', 'ruby'];
  if (!supportedStructuralLangs.includes(language.toLowerCase())) {
    return fallbackChunking(lines);
  }

  let currentChunkLines: string[] = [];
  let currentStartLine = 1;
  let bracketDepth = 0; // Tracks { } depth for C-like languages
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    currentChunkLines.push(line);

    // Python heuristic: checking indentation changes for block completion
    if (language.toLowerCase() === 'python') {
      // Very basic Python heuristic: if we have a def/class, start tracking.
      // End tracking when we hit an unindented non-empty line.
      if (!inBlock && (line.trim().startsWith('def ') || line.trim().startsWith('class '))) {
        inBlock = true;
      } else if (inBlock && line.trim().length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && !line.trim().startsWith('#')) {
        // We hit an unindented line that isn't a comment -> end of block (the *previous* line was the end)
        // Extract the chunk (excluding current line)
        const blockContent = currentChunkLines.slice(0, -1).join('\n').trim();
        if (blockContent) {
           chunks.push({
             content: blockContent,
             startLine: currentStartLine,
             endLine: lineNumber - 1
           });
        }
        currentStartLine = lineNumber;
        currentChunkLines = [line];
        
        // Is this new line the start of another block?
        inBlock = line.trim().startsWith('def ') || line.trim().startsWith('class ');
      }
    } 
    // C-like languages heuristic: tracking brace depth
    else {
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      const previousDepth = bracketDepth;
      bracketDepth += (openBraces - closeBraces);

      // We entered a block
      if (previousDepth === 0 && bracketDepth > 0) {
        inBlock = true;
      }
      
      // We just exited the root block (e.g. end of a function or class)
      if (inBlock && bracketDepth === 0 && previousDepth > 0) {
        const blockContent = currentChunkLines.join('\n').trim();
        if (blockContent) {
          chunks.push({
            content: blockContent,
            startLine: currentStartLine,
            endLine: lineNumber
          });
        }
        // Reset for next chunk
        currentStartLine = lineNumber + 1;
        currentChunkLines = [];
        inBlock = false;
      }
    }

    // Failsafe: if a block is getting too huge (e.g., massive JSON or generated code), force a break
    if (currentChunkLines.length >= MAX_CHUNK_LINES) {
      const blockContent = currentChunkLines.join('\n').trim();
      if (blockContent) {
        chunks.push({
          content: blockContent,
          startLine: currentStartLine,
          endLine: lineNumber
        });
      }
      currentStartLine = lineNumber + 1;
      currentChunkLines = [];
      bracketDepth = 0; // Reset depth to avoid breaking future logic
      inBlock = false;
    }
  }

  // Flush any remaining lines as the last chunk
  if (currentChunkLines.length > 0) {
    const blockContent = currentChunkLines.join('\n').trim();
    if (blockContent) {
      chunks.push({
        content: blockContent,
        startLine: currentStartLine,
        endLine: lines.length
      });
    }
  }

  return chunks;
}

/**
 * Fallback chunker that splits purely based on maximum line counts.
 */
function fallbackChunking(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let currentStart = 1;
  
  for (let i = 0; i < lines.length; i += MAX_CHUNK_LINES) {
    const end = Math.min(i + MAX_CHUNK_LINES, lines.length);
    const chunkLines = lines.slice(i, end);
    const content = chunkLines.join('\n').trim();
    
    if (content) {
      chunks.push({
        content,
        startLine: currentStart,
        endLine: currentStart + chunkLines.length - 1
      });
    }
    currentStart += MAX_CHUNK_LINES;
  }
  
  return chunks;
}
