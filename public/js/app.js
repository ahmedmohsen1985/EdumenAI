/**
 * EdumenAI Exercise 4 Frontend Application
 * Handles identity forms, image upload, transcription, evaluation, and report rendering.
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    rawText: '',
    finalText: '',
    evaluation: null,
    isTranscribing: false,
    isEvaluating: false
  };

  // --- DOM Elements ---
  const elements = {
    studentName: document.getElementById('studentName'),
    studentTelegram: document.getElementById('studentTelegram'),
    studentSchool: document.getElementById('studentSchool'),
    studentClass: document.getElementById('studentClass'),
    taskPrompt: document.getElementById('taskPrompt'),
    printHeader: document.getElementById('printHeader'),
    printStudentName: document.getElementById('printStudentName'),
    printStudentClass: document.getElementById('printStudentClass'),
    printStudentSchool: document.getElementById('printStudentSchool'),
    printDate: document.getElementById('printDate'),
    printTaskPrompt: document.getElementById('printTaskPrompt'),
    dropZone: document.getElementById('dropZone'),
    imageInput: document.getElementById('imageInput'),
    imagePreview: document.getElementById('imagePreview'),
    previewImg: document.getElementById('previewImg'),
    transcribeBtn: document.getElementById('transcribeBtn'),
    studentText: document.getElementById('studentText'),
    submitBtn: document.getElementById('submitBtn'),
    loadingState: document.getElementById('loadingState'),
    loadingTitle: document.getElementById('loadingTitle'),
    loadingText: document.getElementById('loadingText'),
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
    printBtn: document.getElementById('printBtn')
  };

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    populateIdentityFromUrl();
    bindEvents();
  });

  function bindEvents() {
    elements.dropZone.addEventListener('click', () => elements.imageInput.click());
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.imageInput.addEventListener('change', handleFileSelect);
    elements.transcribeBtn.addEventListener('click', handleTranscribe);
    elements.submitBtn.addEventListener('click', handleSubmit);
    elements.printBtn.addEventListener('click', () => window.print());
    elements.studentText.addEventListener('input', () => {
      state.finalText = elements.studentText.value;
    });
  }

  // --- URL Parameter Auto-Population ---
  function populateIdentityFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const setValue = (element, key, fallbackKey) => {
      const value = params.get(key) || params.get(fallbackKey);
      if (value && element) {
        element.value = decodeURIComponent(value);
      }
    };

    setValue(elements.studentName, 'name', 'studentName');
    setValue(elements.studentTelegram, 'telegram', 'telegramId');
    setValue(elements.studentSchool, 'school', 'studentSchool');
    setValue(elements.studentClass, 'class', 'className');
    setValue(elements.taskPrompt, 'prompt', 'taskPrompt');
  }

  // --- File Upload Handling ---
  function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('border-brand-gold', 'bg-brand-cream');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('border-brand-gold', 'bg-brand-cream');
  }

  function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('border-brand-gold', 'bg-brand-cream');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadImagePreview(files[0]);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      loadImagePreview(file);
    }
  }

  function loadImagePreview(file) {
    if (!file.type.startsWith('image/')) {
      showAlert('Please upload an image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      elements.previewImg.src = event.target.result;
      elements.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Store the file on the input for later upload
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    elements.imageInput.files = dataTransfer.files;
  }

  // --- Transcription ---
  async function handleTranscribe() {
    const file = elements.imageInput.files[0];
    if (!file) {
      showAlert('Please upload a handwriting photo first.', 'error');
      return;
    }

    setLoading(true, 'Transcribing handwriting...', 'Please wait while the AI reads your image.');
    state.isTranscribing = true;

    try {
      const formData = new FormData();
      formData.append('image', file);

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

    if (!taskPrompt) {
      showAlert('Please enter the task prompt.', 'error');
      elements.taskPrompt.focus();
      return;
    }

    if (!finalText) {
      showAlert('Please provide your article text.', 'error');
      elements.studentText.focus();
      return;
    }

    const student = {
      name: elements.studentName.value.trim(),
      telegram: elements.studentTelegram.value.trim(),
      school: elements.studentSchool.value.trim(),
      className: elements.studentClass.value.trim()
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
    const school = elements.studentSchool.value.trim() || '-';
    const className = elements.studentClass.value.trim() || '-';
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
    // Sanitize the corrected version: only allow mark tags with specific classes
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

    // Auto-hide success alerts after 5 seconds
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

        // Convert other block elements to paragraphs/divs
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
