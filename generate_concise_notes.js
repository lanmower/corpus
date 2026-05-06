#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { readdirSync, statSync, readFileSync, writeFileSync } = fs;

const CORPUS_ROOT = path.join(__dirname);
const CONCISE_ROOT = path.join(CORPUS_ROOT, 'concise');
const MEDBAK_ROOT = 'D:/medbak';

function cleanFileName(filename) {
  return filename.replace(/\.(txt|yaml|yml)$/i, '').replace(/_/g, ' ');
}

function extractTextFromFile(filepath) {
  try {
    let content = readFileSync(filepath, 'utf-8');
    // Remove page markers
    content = content.replace(/---\s*page\s*\d+\s*---/g, '');
    // Clean extra whitespace
    content = content.replace(/\s+/g, ' ').trim();
    return content.length > 0 ? content : null;
  } catch (err) {
    console.error(`  ! Error reading ${filepath}:`, err.message);
    return null;
  }
}

function collectSubjectContent() {
  const subjects = {};

  const root = fs.existsSync(MEDBAK_ROOT) ? MEDBAK_ROOT : CORPUS_ROOT;
  const entries = readdirSync(root).filter(name => {
    const fullPath = path.join(root, name);
    return statSync(fullPath).isDirectory() &&
           !name.startsWith('.') &&
           name !== 'concise' &&
           name !== 'node_modules';
  });

  entries.forEach(subjectName => {
    const subjectPath = path.join(root, subjectName);
    const transcriptDir = path.join(subjectPath, 'audio-transcripts');
    const bookDir = path.join(subjectPath, 'book-texts');

    const transcripts = [];
    const books = [];

    // Collect transcripts
    if (fs.existsSync(transcriptDir)) {
      readdirSync(transcriptDir).filter(f => f.endsWith('.txt')).forEach(file => {
        const content = extractTextFromFile(path.join(transcriptDir, file));
        if (content) {
          transcripts.push({
            label: cleanFileName(file),
            content: content,
            file: file
          });
        }
      });
    }

    // Collect books (recursively)
    if (fs.existsSync(bookDir)) {
      const walkBooks = (dir) => {
        readdirSync(dir).forEach(item => {
          const fullPath = path.join(dir, item);
          if (statSync(fullPath).isDirectory()) {
            walkBooks(fullPath);
          } else if (item.endsWith('.txt')) {
            const content = extractTextFromFile(fullPath);
            if (content) {
              books.push({
                label: cleanFileName(item),
                content: content,
                file: item
              });
            }
          }
        });
      };
      walkBooks(bookDir);
    }

    if (transcripts.length > 0 || books.length > 0) {
      subjects[subjectName] = { transcripts, books };
    }
  });

  return subjects;
}

function generateGuide(subject, data) {
  const lines = [];
  const title = subject.replace(/-/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  lines.push(`# ${title} — Complete Study Guide`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
  lines.push(`**Sources:** ${data.transcripts.length} lectures + ${data.books.length} book sections`);
  lines.push('');
  lines.push('> This guide compiles all available material to provide complete mastery of the subject.');
  lines.push('');

  // Table of contents
  lines.push('## Contents');
  lines.push('');
  if (data.transcripts.length > 0) {
    lines.push('### Audio Lectures');
    data.transcripts.forEach((t, i) => lines.push(`${i + 1}. ${t.label}`));
    lines.push('');
  }
  if (data.books.length > 0) {
    lines.push('### Textbook Sections');
    data.books.forEach((b, i) => lines.push(`${i + 1}. ${b.label}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Lectures
  if (data.transcripts.length > 0) {
    lines.push('## Lectures & Transcripts');
    lines.push('');
    data.transcripts.forEach(t => {
      lines.push(`### ${t.label}`);
      lines.push('*Audio Transcript*');
      lines.push('');
      lines.push(t.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
  }

  // Books
  if (data.books.length > 0) {
    lines.push('## Textbook References');
    lines.push('');
    data.books.forEach(b => {
      lines.push(`### ${b.label}`);
      lines.push('*Textbook Section*');
      lines.push('');
      lines.push(b.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
  }

  // Study notes
  lines.push('## Study Strategy');
  lines.push('');
  lines.push('### Foundation');
  lines.push('1. Read the lecture transcripts to understand core concepts');
  lines.push('2. Review textbook sections for deeper technical detail');
  lines.push('3. Cross-reference between lectures and textbooks to reinforce learning');
  lines.push('');
  lines.push('### Active Learning');
  lines.push('1. Use the SRS cards (in srs-cards/) for spaced repetition');
  lines.push('2. Create your own notes highlighting key facts');
  lines.push('3. Test yourself with practice questions');
  lines.push('');
  lines.push('### Mastery Checklist');
  lines.push('- [ ] Understand all major concepts from lectures');
  lines.push('- [ ] Can explain key definitions from memory');
  lines.push('- [ ] Know the relationships between different topics');
  lines.push('- [ ] Can apply knowledge to clinical scenarios');
  lines.push('- [ ] Passing rate on SRS cards >90%');
  lines.push('');

  return lines.join('\n');
}

function main() {
  console.log('Generating concise study guides...\n');

  const subjects = collectSubjectContent();

  if (Object.keys(subjects).length === 0) {
    console.log('No subjects found.');
    return;
  }

  // Create concise directory
  if (!fs.existsSync(CONCISE_ROOT)) {
    fs.mkdirSync(CONCISE_ROOT, { recursive: true });
  }

  const results = [];
  Object.entries(subjects).forEach(([subject, data]) => {
    const guide = generateGuide(subject, data);
    const filename = `${subject}_study_guide.md`;
    const filepath = path.join(CONCISE_ROOT, filename);

    writeFileSync(filepath, guide, 'utf-8');
    results.push({
      subject,
      lectures: data.transcripts.length,
      books: data.books.length,
      file: filename
    });
  });

  // Summary
  console.log(`Generated ${results.length} study guides:\n`);
  results.forEach(r => {
    console.log(`✓ ${r.subject}`);
    console.log(`  - ${r.lectures} lectures, ${r.books} book sections`);
    console.log(`  - ${r.file}\n`);
  });

  console.log(`All guides saved to: ${CONCISE_ROOT}`);
}

main();
