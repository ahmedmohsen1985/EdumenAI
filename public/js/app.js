/**
 * EdumenAI Exercise 4 Frontend Application
 * Handles Telegram auth, identity, task card, image/PDF upload, transcription, evaluation, and report rendering.
 */

(function () {
  'use strict';

  // --- Constants ---
  const DEFAULT_TASK_PROMPT = `You see this announcement in your school magazine.

Articles wanted: Social media in modern life
Have we become too dependent on social media? Write an article giving your views.

Write your article in about 100–150 words.`;

  const OFFICIAL_SCHOOLS = [
    'Capital',
    'Capital Lotus',
    'MES',
    "MANARET AL'EMAN",
    'AMGAD',
    'SUMMITS',
    'IMPERIAL',
    'BRS',
    'OXFORD G 1',
    'OXFORD G 2 (ONLINE)'
  ];

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

  // --- State ---
  const state = {
    rawText: '',
    finalText: '',
    evaluation: null,
    isTranscribing: false,
    isEvaluating: false,
    taskPromptEdited: false,
    activeTaskTab: 'image',
    activeAnswerTab: 'image',
    taskFile: null,
    answerFile: null
  };

  // --- DOM Elements ---
  const elements = {
    // Identity
    telegramLoginArea: document.getElementById('telegramLoginArea'),
    verifiedStudentInfo: document.getElementById('verifiedStudentInfo'),
    verifiedStudentLabel: document.getElementById('verifiedStudentLabel'),
    studentName: document.getElementById('studentName'),
    studentTelegram: document.getElementById('studentTelegram'),
    telegramUserId: document.getElementById('telegramUserId'),
    studentClass: document.getElementById('studentClass'),
    studentSchool: document.getElementById('studentSchool'),

    // Task
    taskDisplay: document.getElementById('taskDisplay'),
    taskPrompt: document.getElementById('taskPrompt'),
    taskPromptEdit: document.getElementById('taskPromptEdit'),
    taskEditArea: document.getElementById('taskEditArea'),
    toggleTaskEditBtn: document.getElementById('toggleTaskEditBtn'),
    saveTaskEditBtn: document.getElementById('saveTaskEditBtn'),
    cancelTaskEditBtn: document.getElementById('cancelTaskEditBtn'),

    // Task tabs
    taskTabImage: document.getElementById('taskTabImage'),
    taskTabPdf: document.getElementById('taskTabPdf'),
    taskContentImage: document.getElementById('taskContentImage'),
    taskContentPdf: document.getElementById('taskContentPdf'),
    taskImageInput: document.getElementById('taskImageInput'),
    taskPdfInput: document.getElementById('taskPdfInput'),
    taskDropZoneImage: document.getElementById('taskDropZoneImage'),
    taskDropZonePdf: document.getElementById('taskDropZonePdf'),
    taskFilePreview: document.getElementById('taskFilePreview'),
    taskFileName: document.getElementById('taskFileName'),
    taskFileSize: document.getElementById('taskFileSize'),
    taskFileThumb: document.getElementById('taskFileThumb'),
    removeTaskFileBtn: document.getElementById('removeTaskFileBtn'),

    // Answer tabs
    answerTabImage: document.getElementById('answerTabImage'),
    answerTabPdf: document.getElementById('answerTabPdf'),
    answerContentImage: document.getElementById('answerContentImage'),
    answerContentPdf: document.getElementById('answerContentPdf'),
    answerImageInput: document.getElementById('answerImageInput'),
    answerPdfInput: document.getElementById('answerPdfInput'),
    answerDropZoneImage: document.getElementById('answerDropZoneImage'),
    answerDropZonePdf: document.getElementById('answerDropZonePdf'),
    answerImagePreview: document.getElementById('answerImagePreview'),
    answerPreviewImg: document.getElementById('answerPreviewImg'),
    answerPdfPreview: document.getElementById('answerPdfPreview'),
    answerPdfName: document.getElementById('answerPdfName'),
    answerPdfSize: document.getElementById('answerPdfSize'),
    removeAnswerPdfBtn: document.getElementById('removeAnswerPdfBtn'),

    // Workspace
    transcribeBtn: document.getElementById('transcribeBtn'),
    studentText: document.getElementById('studentText'),
    submitBtn: document.getElementById('submitBtn'),

    // Report
    printHeader: document.getElementById('printHeader'),
    printStudentName: document.getElementById('printStudentName'),
    printStudentClass: document.getElementById('printStudentClass'),
    printStudentSchool: document.getElementById('printStudentSchool'),
    printDate: document.getElementById('printDate'),
    printTaskPrompt: document.getElementById('printTaskPrompt'),
    reportSection: document.getElementById('reportSection'),
    alertContainer: document.getElementById('alertContainer'),
    totalMark: document.getElementById('totalMark'),
    contentMark: document.getElementById('contentMark'),
    languageMark: document.getElementById('languageMark'),
    contentJustification: document.getElementById('contentJustification'),
    languageJustification: document.getElementById('languageJustification'),
    errorsTableBody: document.getElementById('errorsTableBody'),
    noErrorsMsg: document.getElementById('noErrorsMsg'),
    contentFeedbackList: document.getElementById('contentFeedbackList'),
    correctedVersion: document.getElementById('correctedVersion'),
    printBtn: document.getElementById('printBtn'),

    // Loading
    loadingState: document.getElementById('loadingState'),
    loadingTitle: document.getElementById('loadingTitle'),
    loadingText: document.getElementById('loadingText')
  };

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    initTaskPrompt();
    populateIdentityFromUrl();
    bindEvents();
  });

  function initTaskPrompt() {
    elements.taskPrompt.value = DEFAULT_TASK_PROMPT;
    elements.taskDisplay.textContent = DEFAULT_TASK_PROMPT;
  }

  function bindEvents() {
    // Identity
    elements.studentClass.addEventListener('change', () => {
      elements.studentSchool.value = elements.studentClass.value;
    });

    // Task edit
    elements.toggleTaskEditBtn.addEventListener('click', showTaskEdit);
    elements.saveTaskEditBtn.addEventListener('click', saveTaskEdit);
    elements.cancelTaskEditBtn.addEventListener('click', hideTaskEdit);

    // Task tabs
    elements.taskTabImage.addEventListener('click', () => switchTaskTab('image'));
    elements.taskTabPdf.addEventListener('click', () => switchTaskTab('pdf'));

    // Task upload
    bindDropZone(elements.taskDropZoneImage, elements.taskImageInput, handleTaskFileSelect);
    bindDropZone(elements.taskDropZonePdf, elements.taskPdfInput, handleTaskFileSelect);
    elements.removeTaskFileBtn.addEventListener('click', removeTaskFile);

    // Answer tabs
    elements.answerTabImage.addEventListener('click', () => switchAnswerTab('image'));
    elements.answerTabPdf.addEventListener('click', () => switchAnswerTab('pdf'));

    // Answer upload
    bindDropZone(elements.answerDropZoneImage, elements.answerImageInput, handleAnswerFileSelect);
    bindDropZone(elements.answerDropZonePdf, elements.answerPdfInput, handleAnswerFileSelect);
    elements.removeAnswerPdfBtn.addEventListener('click', removeAnswerFile);

    // Actions
    elements.transcribeBtn.addEventListener('click', handleTranscribe);
    elements.submitBtn.addEventListener('click', handleSubmit);
    elements.printBtn.addEventListener('click', () => window.print());
    elements.studentText.addEventListener('input', () => {
      state.finalText = elements.studentText.value;
    });
  }

  // --- Telegram Auth (global callback required by widget) ---
  window.onTelegramAuth = function (user) {
    if (!user || !user.id) return;

    elements.telegramLoginArea.classList.add('hidden');
    elements.verifiedStudentInfo.classList.remove('hidden');

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    elements.studentName.value = fullName;
    elements.studentTelegram.value = user.username ? `@${user.username}` : '';
    elements.telegramUserId.value = String(user.id);

    const label = fullName
      ? `Verified as ${fullName} (Telegram ID: ${user.id})`
      : `Verified with Telegram ID: ${user.id}`;
    elements.verifiedStudentLabel.textContent = label;
  };

  // --- URL Parameter Auto-Population ---
  function populateIdentityFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const tgId = params.get('tg_id');
    const name = params.get('name');
    const school = params.get('school');
    const className = params.get('class');
    const prompt = params.get('prompt');

    let identityFromUrl = false;

    if (tgId) {
      elements.telegramUserId.value = decodeURIComponent(tgId);
      identityFromUrl = true;
    }

    if (name) {
      elements.studentName.value = decodeURIComponent(name);
      identityFromUrl = true;
    }

    const groupValue = className || school;
    if (groupValue) {
      const decoded = decodeURIComponent(groupValue);
      setSelectValue(elements.studentClass, decoded);
      elements.studentSchool.value = decoded;
      identityFromUrl = true;
    }

    if (prompt) {
      const decodedPrompt = decodeURIComponent(prompt);
      elements.taskPrompt.value = decodedPrompt;
      elements.taskDisplay.textContent = decodedPrompt;
      state.taskPromptEdited = true;
    }

    if (identityFromUrl) {
      elements.telegramLoginArea.classList.add('hidden');
      elements.verifiedStudentInfo.classList.remove('hidden');
      elements.verifiedStudentLabel.textContent = 'Identity loaded from your learning platform.';
    }
  }

  function setSelectValue(select, value) {
    const match = Array.from(select.options).find((opt) => opt.value.toLowerCase() === value.toLowerCase());
    if (match) {
      select.value = match.value;
    } else {
      // Add a temporary option for unknown values so nothing is lost
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
      select.value = value;
    }
  }

  // --- Tab Switching ---
  function switchTaskTab(tab) {
    state.activeTaskTab = tab;
    elements.taskTabImage.className = tab === 'image'
      ? 'task-tab flex-1 py-2 text-sm font-medium text-brand-navy border-b-2 border-brand-navy bg-brand-cream/30'
      : 'task-tab flex-1 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-navy';
    elements.taskTabPdf.className = tab === 'pdf'
      ? 'task-tab flex-1 py-2 text-sm font-medium text-brand-navy border-b-2 border-brand-navy bg-brand-cream/30'
      : 'task-tab flex-1 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-navy';
    elements.taskContentImage.classList.toggle('hidden', tab !== 'image');
    elements.taskContentPdf.classList.toggle('hidden', tab !== 'pdf');
  }

  function switchAnswerTab(tab) {
    state.activeAnswerTab = tab;
    elements.answerTabImage.className = tab === 'image'
      ? 'answer-tab flex-1 py-2 text-sm font-medium text-brand-navy border-b-2 border-brand-navy bg-brand-cream/30'
      : 'answer-tab flex-1 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-navy';
    elements.answerTabPdf.className = tab === 'pdf'
      ? 'answer-tab flex-1 py-2 text-sm font-medium text-brand-navy border-b-2 border-brand-navy bg-brand-cream/30'
      : 'answer-tab flex-1 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-navy';
    elements.answerContentImage.classList.toggle('hidden', tab !== 'image');
    elements.answerContentPdf.classList.toggle('hidden', tab !== 'pdf');
  }

  // --- Task Prompt Edit ---
  function showTaskEdit() {
    elements.taskPromptEdit.value = elements.taskPrompt.value;
    elements.taskEditArea.classList.remove('hidden');
    elements.toggleTaskEditBtn.classList.add('hidden');
  }

  function hideTaskEdit() {
    elements.taskEditArea.classList.add('hidden');
    elements.toggleTaskEditBtn.classList.remove('hidden');
  }

  function saveTaskEdit() {
    const value = elements.taskPromptEdit.value.trim();
    if (!value) {
      showAlert('Task question cannot be empty.', 'error');
      return;
    }
    elements.taskPrompt.value = value;
    elements.taskDisplay.textContent = value;
    state.taskPromptEdited = true;
    hideTaskEdit();
  }

  // --- Drop Zone Helpers ---
  function bindDropZone(zone, input, handler) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('border-brand-gold', 'bg-brand-cream');
    });
    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      zone.classList.remove('border-brand-gold', 'bg-brand-cream');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('border-brand-gold', 'bg-brand-cream');
      if (e.dataTransfer.files.length > 0) {
        handler(e.dataTransfer.files[0]);
      }
    });
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handler(e.target.files[0]);
      }
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateFile(file, acceptedTypes) {
    if (file.size > MAX_FILE_SIZE) {
      showAlert('File is too large. Maximum size is 15 MB.', 'error');
      return false;
    }
    if (!acceptedTypes.includes(file.type) && !acceptedTypes.some((t) => file.name.toLowerCase().endsWith(t.replace('*', '')))) {
      showAlert('File type not accepted for this upload.', 'error');
      return false;
    }
    return true;
  }

  // --- Task File Handling ---
  function handleTaskFileSelect(file) {
    const accepted = state.activeTaskTab === 'image'
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
      : ['application/pdf', '.pdf'];

    if (!validateFile(file, accepted)) return;

    state.taskFile = file;

    // Show preview
    elements.taskFileName.textContent = file.name;
    elements.taskFileSize.textContent = formatFileSize(file.size);
    elements.taskFilePreview.classList.remove('hidden');

    if (state.activeTaskTab === 'image' && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        elements.taskFileThumb.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded" alt="Task preview">`;
      };
      reader.readAsDataURL(file);
    } else {
      elements.taskFileThumb.innerHTML = 'PDF';
    }

    // Auto-extract task text
    extractTaskText(file);
  }

  function removeTaskFile() {
    state.taskFile = null;
    elements.taskFilePreview.classList.add('hidden');
    elements.taskImageInput.value = '';
    elements.taskPdfInput.value = '';
    elements.taskFileThumb.innerHTML = 'FILE';
  }

  async function extractTaskText(file) {
    setLoading(true, 'Reading task sheet...', 'Please wait while the AI extracts the task question.');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Task extraction failed.');
      }

      const extracted = result.data.transcription || '';
      if (extracted.trim()) {
        elements.taskPrompt.value = extracted.trim();
        elements.taskDisplay.textContent = extracted.trim();
        state.taskPromptEdited = true;
        showAlert('Task question extracted from uploaded sheet.', 'success');
      } else {
        showAlert('Could not extract any text from the task sheet. You can edit it manually.', 'error');
      }
    } catch (err) {
      console.error('Task extraction error:', err);
      showAlert(err.message || 'Task extraction failed.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // --- Answer File Handling ---
  function handleAnswerFileSelect(file) {
    const accepted = state.activeAnswerTab === 'image'
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
      : ['application/pdf', '.pdf'];

    if (!validateFile(file, accepted)) return;

    state.answerFile = file;

    if (state.activeAnswerTab === 'image' && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        elements.answerPreviewImg.src = e.target.result;
        elements.answerImagePreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
      elements.answerPdfPreview.classList.add('hidden');
    } else {
      elements.answerPdfName.textContent = file.name;
      elements.answerPdfSize.textContent = formatFileSize(file.size);
      elements.answerPdfPreview.classList.remove('hidden');
      elements.answerImagePreview.classList.add('hidden');
    }
  }

  function removeAnswerFile() {
    state.answerFile = null;
    elements.answerImageInput.value = '';
    elements.answerPdfInput.value = '';
    elements.answerImagePreview.classList.add('hidden');
    elements.answerPdfPreview.classList.add('hidden');
    elements.answerPreviewImg.src = '';
  }

  // --- Transcription ---
  async function handleTranscribe() {
    const file = state.answerFile;
    if (!file) {
      showAlert('Please upload your handwritten article first (image or PDF).', 'error');
      return;
    }

    setLoading(true, 'Transcribing handwriting...', 'Please wait while the AI reads your work.');
    state.isTranscribing = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Transcription failed.');
      }

      const transcription = result.data.transcription || '';
      state.rawText = transcription;
      state.finalText = transcription;
      elements.studentText.value = transcription;

      showAlert('Transcription complete. Please check the text carefully before marking.', 'success');
    } catch (err) {
      console.error('Transcription error:', err);
      showAlert(err.message || 'Transcription failed. Please try again.', 'error');
    } finally {
      state.isTranscribing = false;
      setLoading(false);
    }
  }

  // --- Evaluation ---
  async function handleSubmit() {
    const taskPrompt = elements.taskPrompt.value.trim();
    const finalText = elements.studentText.value.trim();

    if (!elements.studentName.value.trim()) {
      showAlert('Please enter your full name.', 'error');
      elements.studentName.focus();
      return;
    }

    if (!elements.studentClass.value) {
      showAlert('Please select your class / group.', 'error');
      elements.studentClass.focus();
      return;
    }

    if (!taskPrompt) {
      showAlert('Task question is missing. Please enter or upload it.', 'error');
      return;
    }

    if (!finalText) {
      showAlert('Please provide your article text.', 'error');
      elements.studentText.focus();
      return;
    }

    const student = {
      name: elements.studentName.value.trim(),
      telegram: elements.telegramUserId.value.trim() || elements.studentTelegram.value.trim(),
      school: elements.studentSchool.value.trim() || elements.studentClass.value,
      className: elements.studentClass.value
    };

    state.finalText = finalText;

    setLoading(true, 'Marking your article...', 'The AI examiner is applying the Oxford AQA rubric.');
    state.isEvaluating = true;

    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student,
          taskPrompt,
          rawText: state.rawText,
          finalText
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Evaluation failed.');
      }

      state.evaluation = result.data;
      renderReport(result.data);
      showAlert('Evaluation complete! Your report is ready below.', 'success');
    } catch (err) {
      console.error('Evaluation error:', err);
      showAlert(err.message || 'Evaluation failed. Please try again.', 'error');
    } finally {
      state.isEvaluating = false;
      setLoading(false);
    }
  }

  // --- Report Rendering ---
  function renderReport(data) {
    const marks = data.marks || {};
    const justification = data.justification || {};
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const feedback = Array.isArray(data.content_feedback) ? data.content_feedback : [];

    elements.totalMark.textContent = marks.total ?? 0;
    elements.contentMark.textContent = marks.content ?? 0;
    elements.languageMark.textContent = marks.language ?? 0;

    elements.contentJustification.textContent = justification.content || 'No justification provided.';
    elements.languageJustification.textContent = justification.language || 'No justification provided.';

    renderErrors(errors);
    renderFeedback(feedback);
    renderCorrectedVersion(data.corrected_version || '');
    renderPrintHeader();

    elements.reportSection.classList.remove('hidden');
    elements.reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPrintHeader() {
    if (!elements.printHeader) return;

    const name = elements.studentName.value.trim() || 'Unknown';
    const school = elements.studentSchool.value.trim() || elements.studentClass.value || '-';
    const className = elements.studentClass.value || '-';
    const taskPrompt = elements.taskPrompt.value.trim() || '-';

    if (elements.printStudentName) elements.printStudentName.textContent = name;
    if (elements.printStudentSchool) elements.printStudentSchool.textContent = school;
    if (elements.printStudentClass) elements.printStudentClass.textContent = className;
    if (elements.printTaskPrompt) elements.printTaskPrompt.textContent = taskPrompt;
    if (elements.printDate) elements.printDate.textContent = new Date().toLocaleDateString();
  }

  function renderErrors(errors) {
    elements.errorsTableBody.innerHTML = '';

    if (errors.length === 0) {
      elements.noErrorsMsg.classList.remove('hidden');
      return;
    }

    elements.noErrorsMsg.classList.add('hidden');

    errors.forEach((error) => {
      const row = document.createElement('tr');
      row.className = 'border-b border-gray-100 last:border-0';
      row.innerHTML = `
        <td class="py-3 pr-4 text-red-700 font-medium">${escapeHtml(error.original || '')}</td>
        <td class="py-3 pr-4 text-emerald-700 font-medium">${escapeHtml(error.correction || '')}</td>
        <td class="py-3 pr-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-navy/10 text-brand-navy">
            ${escapeHtml(error.category || 'Other')}
          </span>
        </td>
        <td class="py-3 text-gray-600">${escapeHtml(error.explanation || '')}</td>
      `;
      elements.errorsTableBody.appendChild(row);
    });
  }

  function renderFeedback(feedback) {
    elements.contentFeedbackList.innerHTML = '';

    if (feedback.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No specific content feedback provided.';
      elements.contentFeedbackList.appendChild(item);
      return;
    }

    feedback.forEach((point) => {
      const item = document.createElement('li');
      item.className = 'flex items-start gap-2';
      item.innerHTML = `
        <span class="text-emerald-600 mt-0.5">•</span>
        <span>${escapeHtml(point)}</span>
      `;
      elements.contentFeedbackList.appendChild(item);
    });
  }

  function renderCorrectedVersion(html) {
    const sanitized = sanitizeCorrectedHtml(html);
    elements.correctedVersion.innerHTML = sanitized;
  }

  // --- Helpers ---
  function setLoading(isLoading, title = '', text = '') {
    if (isLoading) {
      elements.loadingTitle.textContent = title;
      elements.loadingText.textContent = text;
      elements.loadingState.classList.remove('hidden');
      elements.transcribeBtn.disabled = true;
      elements.submitBtn.disabled = true;
    } else {
      elements.loadingState.classList.add('hidden');
      elements.transcribeBtn.disabled = false;
      elements.submitBtn.disabled = false;
    }
  }

  function showAlert(message, type = 'error') {
    const isError = type === 'error';
    const bgClass = isError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800';
    const icon = isError
      ? '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
      : '<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';

    elements.alertContainer.innerHTML = `
      <div class="${bgClass} border rounded-xl p-4 flex items-start gap-3">
        ${icon}
        <p class="text-sm font-medium">${escapeHtml(message)}</p>
      </div>
    `;
    elements.alertContainer.classList.remove('hidden');

    if (!isError) {
      setTimeout(() => {
        elements.alertContainer.classList.add('hidden');
      }, 5000);
    }
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sanitizeCorrectedHtml(html) {
    if (typeof html !== 'string') return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const fragment = document.createDocumentFragment();

    function copyNode(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent));
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();

        if (tag === 'mark') {
          const cls = node.getAttribute('class');
          if (cls === 'correction' || cls === 'addition') {
            const newMark = document.createElement('mark');
            newMark.className = cls;
            Array.from(node.childNodes).forEach((child) => copyNode(child, newMark));
            parent.appendChild(newMark);
            return;
          }
        }

        const wrapper = document.createElement(tag === 'div' || tag === 'p' ? 'p' : 'span');
        Array.from(node.childNodes).forEach((child) => copyNode(child, wrapper));
        parent.appendChild(wrapper);
      }
    }

    Array.from(doc.body.childNodes).forEach((child) => copyNode(child, fragment));

    const temp = document.createElement('div');
    temp.appendChild(fragment);
    return temp.innerHTML;
  }
})();
