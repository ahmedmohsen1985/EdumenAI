/**
 * EdumenAI Exercise 4 Frontend Application
 * Handles Telegram auth, identity, task card, image/PDF upload, transcription, evaluation, and report rendering.
 */

(function () {
  'use strict';

  // --- Constants ---
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
    answerFile: null,
    lastGeneratedPdf: null
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
    taskUploadArea: document.getElementById('taskUploadArea'),
    taskLoading: document.getElementById('taskLoading'),
    changeTaskQuestionBtn: document.getElementById('changeTaskQuestionBtn'),
    taskDisplayBox: document.getElementById('taskDisplayBox'),
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
    workspaceSection: document.getElementById('workspaceSection'),
    transcribeBtn: document.getElementById('transcribeBtn'),
    transcribeLoading: document.getElementById('transcribeLoading'),
    studentText: document.getElementById('studentText'),
    submitBtn: document.getElementById('submitBtn'),
    evalLoading: document.getElementById('evalLoading'),

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
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    telegramStatusBanner: document.getElementById('telegramStatusBanner'),
    telegramStatusText: document.getElementById('telegramStatusText'),
    telegramStatusTime: document.getElementById('telegramStatusTime'),

    // Loading
    loadingState: document.getElementById('loadingState'),
    loadingTitle: document.getElementById('loadingTitle'),
    loadingText: document.getElementById('loadingText')
  };

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    populateIdentityFromUrl();
    bindEvents();
  });

  function bindEvents() {
    // Identity
    elements.studentClass.addEventListener('change', () => {
      elements.studentSchool.value = elements.studentClass.value;
    });

    // Task edit & change
    elements.toggleTaskEditBtn.addEventListener('click', showTaskEdit);
    elements.saveTaskEditBtn.addEventListener('click', saveTaskEdit);
    elements.cancelTaskEditBtn.addEventListener('click', hideTaskEdit);
    if (elements.changeTaskQuestionBtn) {
      elements.changeTaskQuestionBtn.addEventListener('click', resetTaskQuestion);
    }

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
    if (elements.downloadPdfBtn) {
      elements.downloadPdfBtn.addEventListener('click', downloadCurrentPdf);
    }
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
      if (elements.taskUploadArea) elements.taskUploadArea.classList.add('hidden');
      if (elements.taskDisplayBox) elements.taskDisplayBox.classList.remove('hidden');
      if (elements.workspaceSection) elements.workspaceSection.classList.remove('hidden');
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
    if (elements.taskDisplayBox) elements.taskDisplayBox.classList.remove('hidden');
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

  function resetTaskQuestion() {
    state.taskFile = null;
    elements.taskPrompt.value = '';
    elements.taskDisplay.textContent = '';
    elements.taskImageInput.value = '';
    elements.taskPdfInput.value = '';
    elements.taskFileThumb.innerHTML = 'FILE';
    elements.taskFilePreview.classList.add('hidden');
    elements.taskDisplayBox.classList.add('hidden');
    if (elements.taskUploadArea) elements.taskUploadArea.classList.remove('hidden');
    if (elements.workspaceSection) elements.workspaceSection.classList.add('hidden');
  }

  function removeTaskFile() {
    resetTaskQuestion();
  }

  async function extractTaskText(file) {
    setTaskLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/extract-task', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Task question extraction failed.');
      }

      const extracted = result.data.taskQuestion || '';
      if (extracted.trim()) {
        elements.taskPrompt.value = extracted.trim();
        elements.taskDisplay.textContent = extracted.trim();

        // Hide upload area, reveal extracted question card, and unlock Step 2
        if (elements.taskUploadArea) elements.taskUploadArea.classList.add('hidden');
        if (elements.taskDisplayBox) elements.taskDisplayBox.classList.remove('hidden');
        if (elements.workspaceSection) elements.workspaceSection.classList.remove('hidden');

        state.taskPromptEdited = true;
        showAlert('Exam question extracted successfully! Proceed to Step 2 to submit your article.', 'success');

        // Smoothly scroll down to Step 2 so student sees the next step
        setTimeout(() => {
          if (elements.workspaceSection) {
            elements.workspaceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      } else {
        showAlert('Could not extract the exam question from the uploaded sheet. Please check the file or edit it manually.', 'error');
      }
    } catch (err) {
      console.error('Task extraction error:', err);
      showAlert(err.message || 'Task question extraction failed. Please try again.', 'error');
    } finally {
      setTaskLoading(false);
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
    elements.studentText.value = '';
    state.rawText = '';
    state.finalText = '';
    const badge = document.getElementById('transcriptionBadge');
    if (badge) badge.classList.add('hidden');
  }

  // --- Transcription ---
  async function handleTranscribe() {
    const file = state.answerFile;
    if (!file) {
      showAlert('Please upload your handwritten article first (image or PDF).', 'error');
      return;
    }

    setTranscribeLoading(true);
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
      elements.studentText.readOnly = true;

      const badge = document.getElementById('transcriptionBadge');
      if (badge) badge.classList.remove('hidden');

      showAlert('Handwriting transcription complete! Text is locked for authentic exam marking.', 'success');
      elements.studentText.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error('Transcription error:', err);
      showAlert(err.message || 'Transcription failed. Please try again.', 'error');
    } finally {
      state.isTranscribing = false;
      setTranscribeLoading(false);
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
      showAlert('Please upload or extract your task question in Step 1 first.', 'error');
      const taskSec = document.getElementById('taskSection');
      if (taskSec) taskSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (!finalText) {
      showAlert('Please upload your handwritten article and click "Transcribe Handwriting" first.', 'error');
      const ansSec = document.getElementById('workspaceSection');
      if (ansSec) ansSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const student = {
      name: elements.studentName.value.trim(),
      telegram: elements.telegramUserId.value.trim() || elements.studentTelegram.value.trim(),
      school: elements.studentSchool.value.trim() || elements.studentClass.value,
      className: elements.studentClass.value
    };

    state.finalText = finalText;

    setEvalLoading(true);
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

      // Generate PDF Report & Dispatch to Telegram
      exportAndSendPdfReport(student, taskPrompt, result.data, finalText, state.rawText);
    } catch (err) {
      console.error('Evaluation error:', err);
      showAlert(err.message || 'Evaluation failed. Please try again.', 'error');
    } finally {
      state.isEvaluating = false;
      setEvalLoading(false);
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

  // --- PDF Generation & Telegram Dispatch ---
  function pdfSafe(text) {
    if (!text) return '';
    const map = {
      '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u2794': '->',
      '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'",
      '\u201C': '"', '\u201D': '"', '\u2026': '...', '\u00A0': ' ',
      '\u2022': '-', '\u25B6': '', '\u25BC': '', '\u2713': 'v', '\u2717': 'x'
    };
    let v = String(text);
    Object.keys(map).forEach((k) => {
      v = v.split(k).join(map[k]);
    });
    return v.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF]/g, '');
  }

  function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function generateExercise4Pdf(studentInfo, taskPrompt, evaluation, finalText) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.warn('[PDF] jsPDF library is not available.');
      return null;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = { left: 15, right: 15, top: 15, bottom: 15 };
    const contentWidth = pageWidth - margin.left - margin.right; // 180 mm
    const BOTTOM = pageHeight - margin.bottom - 10; // 272 mm

    const colours = {
      primary: [24, 34, 55],       // Brand Navy #182237
      secondary: [181, 143, 83],   // Brand Gold #B58F53
      cream: [248, 246, 241],      // Brand Cream #F8F6F1
      dark: [33, 33, 33],
      success: [27, 122, 61],
      danger: [176, 58, 46],
      gray: [120, 120, 120],
      white: [255, 255, 255],
      lightGreen: [232, 245, 233]
    };

    let y = margin.top;
    let pageNumber = 1;

    function addFooter(pageNum) {
      doc.setFontSize(8);
      doc.setTextColor(...colours.gray);
      doc.setFont(undefined, 'normal');
      doc.text('EdumenAI powered by EDUMENIA · Oxford AQA IGCSE ESL Exercise 4', margin.left, 290);
      doc.text(`Page ${pageNum}`, pageWidth - margin.right, 290, { align: 'right' });
    }

    function checkPageBreak(neededHeight) {
      if (y + (neededHeight || 0) > BOTTOM) {
        addFooter(pageNumber);
        doc.addPage();
        pageNumber++;
        y = margin.top + 5;
        return true;
      }
      return false;
    }

    function addSectionHeader(title, colour = colours.primary) {
      checkPageBreak(16);
      doc.setFillColor(...colour);
      doc.roundedRect(margin.left, y, contentWidth, 8, 1.5, 1.5, 'F');
      doc.setTextColor(...colours.white);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(pdfSafe(title), margin.left + 4, y + 5.5);
      y += 12;
      doc.setTextColor(...colours.dark);
      doc.setFont(undefined, 'normal');
    }

    function addWrappedText(text, x, maxWidth, fontSize = 9, lineHeight = 4.5, isBold = false) {
      doc.setFontSize(fontSize);
      doc.setFont(undefined, isBold ? 'bold' : 'normal');
      const safe = pdfSafe(text);
      const lines = doc.splitTextToSize(safe, maxWidth);
      lines.forEach((line) => {
        checkPageBreak(lineHeight);
        doc.text(line, x, y);
        y += lineHeight;
      });
    }

    // --- HEADER BANNER ---
    doc.setFillColor(...colours.primary);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setFillColor(...colours.secondary);
    doc.rect(0, 29, pageWidth, 3, 'F');

    doc.setTextColor(...colours.white);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('Exercise 4: Formal / Semi-Formal / Informal Writing', pageWidth / 2, 13, { align: 'center' });
    doc.setFontSize(10.5);
    doc.setFont(undefined, 'normal');
    doc.text('Oxford AQA IGCSE ESL (9280) — Official AI Examiner Report', pageWidth / 2, 22, { align: 'center' });

    y = 38;

    // --- STUDENT INFO BAR ---
    doc.setFillColor(...colours.cream);
    doc.setDrawColor(...colours.secondary);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin.left, y, contentWidth, 12, 1.5, 1.5, 'FD');

    const studentName = studentInfo.name || 'Student';
    const studentClass = studentInfo.className || studentInfo.school || 'General';
    const examDate = new Date().toLocaleDateString('en-GB');

    doc.setTextColor(...colours.dark);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Student:', margin.left + 4, y + 7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colours.primary);
    doc.text(pdfSafe(studentName), margin.left + 20, y + 7.5);

    doc.setTextColor(...colours.dark);
    doc.setFont(undefined, 'bold');
    doc.text('Class/Group:', margin.left + 80, y + 7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colours.primary);
    doc.text(pdfSafe(studentClass), margin.left + 104, y + 7.5);

    doc.setTextColor(...colours.dark);
    doc.setFont(undefined, 'bold');
    doc.text('Date:', margin.left + 145, y + 7.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colours.primary);
    doc.text(examDate, margin.left + 156, y + 7.5);

    y += 18;

    // --- MARKS OVERVIEW BOXES ---
    const boxW = (contentWidth - 8) / 3;
    const marks = evaluation.marks || { total: 0, content: 0, language: 0 };

    // Total
    doc.setFillColor(...colours.primary);
    doc.roundedRect(margin.left, y, boxW, 20, 2, 2, 'F');
    doc.setTextColor(...colours.secondary);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('TOTAL MARK', margin.left + boxW / 2, y + 6, { align: 'center' });
    doc.setTextColor(...colours.white);
    doc.setFontSize(16);
    doc.text(`${marks.total ?? 0} / 23`, margin.left + boxW / 2, y + 15, { align: 'center' });

    // Content
    doc.setFillColor(...colours.cream);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin.left + boxW + 4, y, boxW, 20, 2, 2, 'FD');
    doc.setTextColor(...colours.gray);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('CONTENT & COMM.', margin.left + boxW + 4 + boxW / 2, y + 6, { align: 'center' });
    doc.setTextColor(...colours.primary);
    doc.setFontSize(15);
    doc.text(`${marks.content ?? 0} / 8`, margin.left + boxW + 4 + boxW / 2, y + 15, { align: 'center' });

    // Language
    doc.setFillColor(...colours.cream);
    doc.roundedRect(margin.left + (boxW + 4) * 2, y, boxW, 20, 2, 2, 'FD');
    doc.setTextColor(...colours.gray);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('LANGUAGE', margin.left + (boxW + 4) * 2 + boxW / 2, y + 6, { align: 'center' });
    doc.setTextColor(...colours.primary);
    doc.setFontSize(15);
    doc.text(`${marks.language ?? 0} / 15`, margin.left + (boxW + 4) * 2 + boxW / 2, y + 15, { align: 'center' });

    y += 26;

    // --- TASK QUESTION ---
    addSectionHeader('TASK QUESTION', colours.primary);
    addWrappedText(taskPrompt || 'No task question prompt recorded.', margin.left + 2, contentWidth - 4, 8.5, 4.2);
    y += 4;

    // --- STUDENT SUBMITTED ARTICLE ---
    addSectionHeader("STUDENT'S SUBMITTED ARTICLE", colours.primary);
    const words = countWords(finalText);
    addWrappedText(finalText || '', margin.left + 2, contentWidth - 4, 8.5, 4.2);
    y += 2;

    // Word count pill
    checkPageBreak(8);
    doc.setFillColor(...colours.cream);
    doc.setDrawColor(...colours.secondary);
    doc.roundedRect(margin.left + 2, y, 40, 5.5, 1.5, 1.5, 'FD');
    doc.setTextColor(...colours.dark);
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'bold');
    doc.text(`Word Count: ${words} words`, margin.left + 5, y + 3.8);
    y += 10;

    // --- EXAMINER VERDICT ---
    addSectionHeader('EXAMINER VERDICT', colours.secondary);
    const just = evaluation.justification || {};
    if (just.content) {
      addWrappedText(`Content: ${just.content}`, margin.left + 2, contentWidth - 4, 8.5, 4.2);
      y += 1;
    }
    if (just.language) {
      addWrappedText(`Language: ${just.language}`, margin.left + 2, contentWidth - 4, 8.5, 4.2);
      y += 3;
    }

    // --- ERRORS DETECTED TABLE ---
    const errors = Array.isArray(evaluation.errors) ? evaluation.errors : [];
    addSectionHeader(`ERRORS IDENTIFIED (${errors.length})`, colours.primary);

    if (errors.length === 0) {
      checkPageBreak(8);
      doc.setFillColor(...colours.lightGreen);
      doc.roundedRect(margin.left, y, contentWidth, 7, 1.5, 1.5, 'F');
      doc.setTextColor(...colours.success);
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'bold');
      doc.text('No significant errors flagged. Excellent control!', margin.left + 5, y + 4.8);
      y += 11;
    } else {
      const colWidths = [38, 48, 28, 66]; // Total = 180 mm
      checkPageBreak(8);
      doc.setFillColor(235, 238, 243);
      doc.rect(margin.left, y, contentWidth, 6, 'F');
      doc.setTextColor(...colours.dark);
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.text('Original', margin.left + 2, y + 4.2);
      doc.text('Correction', margin.left + colWidths[0] + 2, y + 4.2);
      doc.text('Type', margin.left + colWidths[0] + colWidths[1] + 2, y + 4.2);
      doc.text('Explanation', margin.left + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 4.2);
      y += 6.5;

      errors.forEach((errItem, idx) => {
        const orig = pdfSafe(errItem.original || '');
        const corr = pdfSafe(errItem.correction || '');
        const cat = pdfSafe(errItem.category || 'Error');
        const expl = pdfSafe(errItem.explanation || '');

        doc.setFontSize(7.5);
        const explLines = doc.splitTextToSize(expl, colWidths[3] - 4);
        const origLines = doc.splitTextToSize(orig, colWidths[0] - 4);
        const corrLines = doc.splitTextToSize(corr, colWidths[1] - 4);
        const rowLines = Math.max(explLines.length, origLines.length, corrLines.length, 1);
        const rowHeight = Math.max(rowLines * 3.8 + 2.5, 6.5);

        checkPageBreak(rowHeight);

        if (idx % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin.left, y - 0.5, contentWidth, rowHeight, 'F');
        }

        doc.setTextColor(...colours.danger);
        doc.setFont(undefined, 'normal');
        origLines.forEach((l, li) => doc.text(l, margin.left + 2, y + 3.5 + li * 3.8));

        doc.setTextColor(...colours.success);
        doc.setFont(undefined, 'bold');
        corrLines.forEach((l, li) => doc.text(l, margin.left + colWidths[0] + 2, y + 3.5 + li * 3.8));

        doc.setTextColor(...colours.primary);
        doc.setFont(undefined, 'normal');
        doc.text(cat, margin.left + colWidths[0] + colWidths[1] + 2, y + 3.5);

        doc.setTextColor(...colours.dark);
        explLines.forEach((l, li) => doc.text(l, margin.left + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 3.5 + li * 3.8));

        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(margin.left, y + rowHeight - 0.5, margin.left + contentWidth, y + rowHeight - 0.5);

        y += rowHeight;
      });
      y += 4;
    }

    // --- CONTENT FEEDBACK ---
    const feedback = Array.isArray(evaluation.content_feedback) ? evaluation.content_feedback : [];
    if (feedback.length > 0) {
      addSectionHeader('CONTENT & EXPANSION FEEDBACK', colours.success);
      feedback.forEach((pt) => {
        checkPageBreak(6);
        doc.setTextColor(...colours.success);
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'bold');
        doc.text('•', margin.left + 2, y + 4);
        doc.setTextColor(...colours.dark);
        doc.setFont(undefined, 'normal');
        addWrappedText(pt, margin.left + 6, contentWidth - 8, 8.5, 4.2);
        y += 1.5;
      });
      y += 3;
    }

    // --- CORRECTED VERSION ---
    const correctedHtml = evaluation.corrected_version || '';
    if (correctedHtml) {
      addSectionHeader('CORRECTED VERSION', colours.primary);
      const plainCorrected = correctedHtml.replace(/<[^>]*>/g, '');
      addWrappedText(plainCorrected, margin.left + 2, contentWidth - 4, 8.5, 4.5);
      y += 4;
    }

    addFooter(pageNumber);

    return doc;
  }

  function downloadCurrentPdf() {
    if (state.lastGeneratedPdf && state.lastGeneratedPdf.doc) {
      state.lastGeneratedPdf.doc.save(state.lastGeneratedPdf.fileName);
    } else {
      showAlert('PDF report is ready to download.', 'success');
    }
  }

  async function exportAndSendPdfReport(studentInfo, taskPrompt, evaluation, finalText, rawText) {
    try {
      const doc = generateExercise4Pdf(studentInfo, taskPrompt, evaluation, finalText);
      if (!doc) return;

      const safeName = (studentInfo.name || 'student').replace(/\s+/g, '_');
      const fileName = `EdumenAI_Report_${safeName}.pdf`;
      const pdfBlob = doc.output('blob');

      state.lastGeneratedPdf = { doc, blob: pdfBlob, fileName };

      // Dispatch to Telegram via backend relay
      const formData = new FormData();
      formData.append('pdf', pdfBlob, fileName);
      formData.append('student', JSON.stringify(studentInfo));
      formData.append('evaluation', JSON.stringify(evaluation));
      formData.append('rawText', rawText || '');
      formData.append('finalText', finalText || '');
      formData.append('fileName', fileName);

      const res = await fetch('/api/send-telegram-report', {
        method: 'POST',
        body: formData
      });

      const resData = await res.json();

      if (res.ok && resData.success) {
        const studentResult = resData.data?.student;
        const teacherResult = resData.data?.teacherGroup;

        if (studentResult && studentResult.ok) {
          updateTelegramStatusBanner('success', `PDF Report successfully sent to your Telegram account!`);
        } else if (teacherResult && teacherResult.ok) {
          updateTelegramStatusBanner('info', `Report archived & delivered to Teacher Telegram Group.`);
        } else {
          updateTelegramStatusBanner('neutral', `Report ready. Click "Download PDF Report" to save your copy.`);
        }
      }
    } catch (err) {
      console.warn('[PDF/Telegram] Automatic delivery note:', err);
    }
  }

  function updateTelegramStatusBanner(type, message) {
    if (!elements.telegramStatusBanner || !elements.telegramStatusText) return;

    elements.telegramStatusBanner.className = 'mb-4 p-4 rounded-xl border flex items-center justify-between gap-3 text-sm transition';

    if (type === 'success') {
      elements.telegramStatusBanner.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else if (type === 'info') {
      elements.telegramStatusBanner.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-800');
    } else {
      elements.telegramStatusBanner.classList.add('bg-brand-cream/60', 'border-brand-gold/40', 'text-gray-700');
    }

    elements.telegramStatusText.textContent = message;
    if (elements.telegramStatusTime) {
      elements.telegramStatusTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    elements.telegramStatusBanner.classList.remove('hidden');
  }

  // --- Helpers ---
  function setTaskLoading(isLoading) {
    if (elements.taskLoading) {
      elements.taskLoading.classList.toggle('hidden', !isLoading);
    }
    if (elements.taskImageInput) elements.taskImageInput.disabled = isLoading;
    if (elements.taskPdfInput) elements.taskPdfInput.disabled = isLoading;
  }

  function setTranscribeLoading(isLoading) {
    if (elements.transcribeLoading) {
      elements.transcribeLoading.classList.toggle('hidden', !isLoading);
    }
    if (elements.transcribeBtn) {
      elements.transcribeBtn.disabled = isLoading;
      elements.transcribeBtn.classList.toggle('opacity-60', isLoading);
      elements.transcribeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  function setEvalLoading(isLoading) {
    if (elements.evalLoading) {
      elements.evalLoading.classList.toggle('hidden', !isLoading);
    }
    if (elements.submitBtn) {
      elements.submitBtn.disabled = isLoading;
      elements.submitBtn.classList.toggle('opacity-60', isLoading);
      elements.submitBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  function setLoading(isLoading, title = '', text = '') {
    if (elements.loadingState) {
      elements.loadingState.classList.toggle('hidden', !isLoading);
      if (elements.loadingTitle) elements.loadingTitle.textContent = title;
      if (elements.loadingText) elements.loadingText.textContent = text;
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
