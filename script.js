/* ============================================
   Convertitore RTF in TXT
   Parser RTF + gestione UI + download
   Compatibile con browser e Node.js (test)
   ============================================ */

'use strict';

// ============================================================
//  RTF PARSER
//  Macchina a stati che estrae solo il testo visibile,
//  rimuovendo TUTTA la formattazione RTF.
// ============================================================

const RTF_SPECIAL_CHARS = {
  'emdash':    '\u2014', // —
  'endash':    '\u2013', // –
  'emspace':   '\u2003',
  'enspace':   '\u2002',
  'lquote':    '\u2018', // '
  'rquote':    '\u2019', // '
  'ldblquote': '\u201C', // "
  'rdblquote': '\u201D', // "
  'bullet':    '\u2022', // •
  'lbrace':    '{',
  'rbrace':    '}',
  'backslash': '\\',
};

/**
 * Verifica se il contenuto sembra un file RTF valido.
 */
function looksLikeRTF(content) {
  const trimmed = content.trimStart();
  return trimmed.startsWith('{\\rtf');
}

/**
 * Parser RTF: estrae il testo semplice rimuovendo tutta la formattazione.
 * @param {string} rtf - Contenuto RTF grezzo
 * @returns {string} Testo semplice estratto
 */
function parseRTF(rtf) {
  if (!rtf || typeof rtf !== 'string') return '';

  let output = '';
  let pos = 0;
  const len = rtf.length;

  // Stack dei gruppi: ogni entry ha { skipDest: bool }
  const groupStack = [];

  function inSkippableGroup() {
    for (let i = 0; i < groupStack.length; i++) {
      if (groupStack[i].skipDest) return true;
    }
    return false;
  }

  // Set di control word che indicano una destinazione da ignorare completamente
  const IGNORABLE_DESTINATIONS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'stylelist', 'listtable', 'listoverridetable',
    'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf',
    'pict', 'object', 'objemb', 'objlink', 'objhtml', 'objocx',
    'info', 'title', 'subject', 'author', 'manager', 'company', 'operator', 'category',
    'keywords', 'comment', 'doccomm', 'hlinkbase', 'creatim', 'revtim', 'printim', 'buptim',
    'generator', 'xmlnstbl', 'themes', 'datastore', 'themedata', 'colorspace',
    'latentstyles', 'ds', 'rsidtbl', 'pgdsctbl',
    'formfield', 'field', 'fldinst', 'fldrslt', 'datafield',
    'footnote', 'endnote', 'ftncn', 'aftncn',
  ]);

  // Flag: siamo appena entrati in un gruppo, la prossima control word potrebbe essere una destinazione
  let justOpenedGroup = false;

  while (pos < len) {
    const ch = rtf[pos];

    if (ch === '{') {
      groupStack.push({ skipDest: false });
      justOpenedGroup = true;
      pos++;
      continue;
    }

    if (ch === '}') {
      if (groupStack.length > 0) groupStack.pop();
      justOpenedGroup = false;
      pos++;
      continue;
    }

    // Whitespace nativo nel sorgente RTF
    if (ch === '\r' || ch === '\n') {
      if (!inSkippableGroup()) output += ' ';
      justOpenedGroup = false;
      pos++;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      // Spazi prima della prima control word non contano per justOpenedGroup
      // (sono spazi di formattazione del file)
      if (!inSkippableGroup()) {
        // Non emettiamo spazi subito dopo l'apertura di un gruppo
        if (!justOpenedGroup) output += ' ';
      }
      pos++;
      continue;
    }

    if (ch === '\\') {
      pos++;
      if (pos >= len) break;

      const nextCh = rtf[pos];

      // --- Control symbol (non-lettera dopo backslash) ---
      if (!/[a-zA-Z]/.test(nextCh)) {

        if (nextCh === '*') {
          if (groupStack.length > 0) {
            groupStack[groupStack.length - 1].skipDest = true;
          }
          pos++;
          if (pos < len && rtf[pos] === ' ') pos++;
          continue;
        }

        if (nextCh === "'") {
          if (pos + 2 < len) {
            const hex = rtf.substring(pos + 1, pos + 3);
            const charCode = parseInt(hex, 16);
            if (!inSkippableGroup() && charCode > 0) {
              output += String.fromCharCode(charCode);
            }
            pos += 3;
          } else {
            pos++;
          }
          continue;
        }

        if (nextCh === '~') {
          if (!inSkippableGroup()) output += '\u00A0';
          pos++;
          if (pos < len && rtf[pos] === ' ') pos++;
          continue;
        }

        if (nextCh === '-') {
          if (!inSkippableGroup()) output += '\u00AD';
          pos++;
          if (pos < len && rtf[pos] === ' ') pos++;
          continue;
        }

        if (nextCh === '_') {
          if (!inSkippableGroup()) output += '\u2011';
          pos++;
          if (pos < len && rtf[pos] === ' ') pos++;
          continue;
        }

        // Altri simboli: \{, \}, \\, \|, \: — saltiamo
        pos++;
        if (pos < len && rtf[pos] === ' ') pos++;
        continue;
      }

      // --- Control word: lettere + parametro numerico opzionale ---
      let word = '';
      while (pos < len && /[a-zA-Z]/.test(rtf[pos])) {
        word += rtf[pos];
        pos++;
      }

      let numericParam = null;
      let numStr = '';
      if (pos < len && rtf[pos] === '-') {
        numStr = '-';
        pos++;
        while (pos < len && /[0-9]/.test(rtf[pos])) {
          numStr += rtf[pos];
          pos++;
        }
        numericParam = parseInt(numStr, 10);
      } else if (pos < len && /[0-9]/.test(rtf[pos])) {
        while (pos < len && /[0-9]/.test(rtf[pos])) {
          numStr += rtf[pos];
          pos++;
        }
        numericParam = parseInt(numStr, 10);
      }

      if (pos < len && rtf[pos] === ' ') pos++;

      if (inSkippableGroup()) continue;

      const lw = word.toLowerCase();

      // --- Se è la prima control word di un gruppo ed è una destinazione, marca il gruppo come ignorabile ---
      if (justOpenedGroup && IGNORABLE_DESTINATIONS.has(lw)) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].skipDest = true;
        }
        justOpenedGroup = false;
        continue;
      }
      justOpenedGroup = false;

      // --- Unicode escape: \uXXXX ? ---
      if (lw === 'u' && numericParam !== null) {
        if (pos < len && rtf[pos] === '?') pos++;
        if (numericParam > 0) {
          output += String.fromCharCode(numericParam);
        }
        continue;
      }

      // --- Paragrafo / nuova riga ---
      if (lw === 'par' || lw === 'line') {
        output += '\n';
        continue;
      }

      // --- Tabulazione ---
      if (lw === 'tab') {
        output += '\t';
        continue;
      }

      // --- Tabella ---
      if (lw === 'cell') {
        output += '\t';
        continue;
      }
      if (lw === 'row') {
        output += '\n';
        continue;
      }

      // --- Page / section break ---
      if (lw === 'page' || lw === 'sect') {
        output += '\n\n';
        continue;
      }

      // --- Caratteri speciali RTF ---
      if (RTF_SPECIAL_CHARS.hasOwnProperty(lw)) {
        output += RTF_SPECIAL_CHARS[lw];
        continue;
      }

      // Altri comandi di formattazione → ignora
      continue;
    }

    // --- Testo semplice ---
    justOpenedGroup = false;
    if (!inSkippableGroup()) {
      output += ch;
    }
    pos++;
  }

  // Pulizia post-estrazione
  output = output.replace(/\n{3,}/g, '\n\n');
  output = output.replace(/[ \t]+$/gm, '');
  output = output.replace(/[ \t]{2,}/g, ' ');
  output = output.replace(/\n[ \t]+\n/g, '\n\n');
  output = output.trim();

  return output;
}

// ============================================================
//  ESPORTAZIONE PER TEST (Node.js)
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseRTF, looksLikeRTF, RTFParser: { parse: parseRTF, looksLikeRTF } };
}

// ============================================================
//  CODICE BROWSER (salta in Node)
// ============================================================
if (typeof document !== 'undefined') (function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // --- Utility ---
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Impossibile leggere il file ' + file.name));
      reader.readAsText(file);
    });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' byte';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function truncateText(text, maxLen) {
    if (text.length <= maxLen) return { text, truncated: false };
    return { text: text.substring(0, maxLen), truncated: true };
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function triggerDownload(filename, content, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- State ---
  const state = {
    files: [],
    activePreviewId: null,
    nextId: 1,
  };

  // --- DOM refs ---
  const dom = {
    dropZone: $('#dropZone'),
    fileInput: $('#fileInput'),
    filesSection: $('#filesSection'),
    fileList: $('#fileList'),
    clearAllBtn: $('#clearAllBtn'),
    zipAction: $('#zipAction'),
    downloadZipBtn: $('#downloadZipBtn'),
    previewSection: $('#previewSection'),
    previewTitle: $('#previewTitle'),
    previewBadge: $('#previewBadge'),
    previewContent: $('#previewContent'),
    previewTruncation: $('#previewTruncation'),
    closePreviewBtn: $('#closePreviewBtn'),
    currentYear: $('#currentYear'),
  };

  // --- Render ---
  function render() {
    renderFileList();
    renderZipButton();
    renderPreview();
  }

  function renderFileList() {
    dom.fileList.innerHTML = '';

    if (state.files.length === 0) {
      dom.filesSection.hidden = true;
      return;
    }

    dom.filesSection.hidden = false;

    state.files.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'file-card' + (f.status === 'processing' ? ' file-card--loading' : '');
      li.setAttribute('role', 'listitem');

      const hasError = f.status === 'error';
      const isOk = f.status === 'done';
      const statusIcon = hasError
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : isOk
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

      const statusClass = hasError ? 'file-card__status--error' : isOk ? 'file-card__status--ok' : '';
      const statusLabel = hasError ? 'Errore' : isOk ? 'Convertito' : 'In elaborazione…';
      const txtSize = f.txtContent ? formatSize(new Blob([f.txtContent]).size) : '—';

      li.innerHTML = `
        <div class="file-card__icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div class="file-card__info">
          <span class="file-card__name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
          <span class="file-card__meta">Originale: ${formatSize(f.size)} &middot; TXT: ${txtSize}</span>
        </div>
        <span class="file-card__status ${statusClass}">${statusIcon} ${statusLabel}</span>
        <div class="file-card__actions">
          ${isOk ? `<button class="btn btn--ghost btn--sm preview-btn" data-id="${f.id}" aria-label="Anteprima di ${escapeHTML(f.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Anteprima
          </button>` : ''}
          ${isOk ? `<button class="btn btn--ghost btn--sm download-btn" data-id="${f.id}" aria-label="Scarica TXT di ${escapeHTML(f.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Scarica
          </button>` : ''}
          <button class="btn btn--danger btn--icon-only remove-btn" data-id="${f.id}" aria-label="Rimuovi ${escapeHTML(f.name)}" title="Rimuovi">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      dom.fileList.appendChild(li);
    });

    dom.fileList.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.classList.contains('preview-btn')) showPreview(id);
      else if (btn.classList.contains('download-btn')) downloadSingle(id);
      else if (btn.classList.contains('remove-btn')) removeFile(id);
    };
  }

  function renderZipButton() {
    const readyFiles = state.files.filter((f) => f.status === 'done');
    dom.zipAction.hidden = readyFiles.length <= 1;
  }

  function renderPreview() {
    if (state.activePreviewId === null) {
      dom.previewSection.hidden = true;
      return;
    }
    const f = state.files.find((x) => x.id === state.activePreviewId);
    if (!f || f.status !== 'done') {
      dom.previewSection.hidden = true;
      state.activePreviewId = null;
      return;
    }
    dom.previewSection.hidden = false;
    dom.previewTitle.textContent = 'Anteprima: ' + f.name;
    dom.previewBadge.textContent = f.txtContent.length.toLocaleString('it') + ' caratteri';
    const truncated = truncateText(f.txtContent, 5000);
    dom.previewContent.textContent = truncated.text;
    dom.previewTruncation.hidden = !truncated.truncated;
  }

  // --- Actions ---
  async function processFile(file) {
    const id = state.nextId++;
    const entry = { id, file, name: file.name, size: file.size, rtfContent: null, txtContent: null, error: null, status: 'processing' };
    state.files.push(entry);
    render();

    try {
      const content = await readFileAsText(file);
      entry.rtfContent = content;
      if (!looksLikeRTF(content)) {
        throw new Error('Il file non sembra essere un documento RTF valido. Verifica che il file inizi con {\\rtf.');
      }
      const txt = parseRTF(content);
      if (!txt || txt.trim().length === 0) {
        throw new Error('Nessun contenuto testuale estraibile dal file.');
      }
      entry.txtContent = txt;
      entry.status = 'done';
    } catch (err) {
      entry.error = err.message;
      entry.status = 'error';
    }
    render();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.rtf') || f.type === 'text/rtf' || f.type === 'application/rtf' || !name.includes('.');
    });
    if (files.length === 0) {
      alert('Nessun file RTF valido selezionato. Assicurati che i file abbiano estensione .rtf.');
      return;
    }
    for (const file of files) {
      await processFile(file);
    }
  }

  function removeFile(id) {
    if (state.activePreviewId === id) state.activePreviewId = null;
    state.files = state.files.filter((f) => f.id !== id);
    render();
  }

  function clearAll() {
    state.files = [];
    state.activePreviewId = null;
    dom.fileInput.value = '';
    render();
  }

  function showPreview(id) {
    state.activePreviewId = id;
    render();
    dom.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function downloadSingle(id) {
    const f = state.files.find((x) => x.id === id);
    if (!f || !f.txtContent) return;
    const txtName = f.name.replace(/\.rtf$/i, '') + '.txt';
    triggerDownload(txtName, f.txtContent, 'text/plain;charset=utf-8');
  }

  async function downloadAllZip() {
    const ready = state.files.filter((f) => f.status === 'done' && f.txtContent);
    if (ready.length === 0) return;
    if (typeof JSZip === 'undefined') {
      alert('Libreria ZIP non disponibile. Ricarica la pagina e riprova.');
      return;
    }
    const zip = new JSZip();
    ready.forEach((f) => {
      const txtName = f.name.replace(/\.rtf$/i, '') + '.txt';
      zip.file(txtName, f.txtContent);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload('convertiti.zip', blob, 'application/zip');
  }

  // --- Event Listeners ---
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dom.fileInput.click();
    }
  });
  dom.fileInput.addEventListener('change', () => {
    if (dom.fileInput.files.length > 0) handleFiles(dom.fileInput.files);
  });

  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.add('drop-zone--active');
  });
  dom.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.remove('drop-zone--active');
  });
  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.dropZone.classList.remove('drop-zone--active');
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  });

  document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });

  dom.clearAllBtn.addEventListener('click', clearAll);
  dom.downloadZipBtn.addEventListener('click', downloadAllZip);
  dom.closePreviewBtn.addEventListener('click', () => {
    state.activePreviewId = null;
    render();
  });

  if (dom.currentYear) {
    dom.currentYear.textContent = new Date().getFullYear();
  }

})();
