
  const API_GENERATE_ENDPOINT = "/api/generate";
  const GEMINI_API_KEY = "SERVER_SIDE_NETLIFY_ENV"; // Not used in browser. Netlify function reads process.env.GEMINI_API_KEY.
  const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  const VIDEOS_ENABLED = false;
  const PRIMARY_MODEL = "gemini-2.5-flash";
  const SECONDARY_MODEL = "gemini-2.5-pro";
  const LEGACY_MODEL = "gemini-2.5-flash-lite";
  const MODEL_FALLBACKS = [SECONDARY_MODEL, LEGACY_MODEL];
  const QUESTION_BANNED_TERMS = ["horoscope", "astrology", "zodiac", "religion", "political party", "birth date", "social security"];
  const DOCUMENT_PLACEHOLDER_PATTERNS = [/lorem ipsum/i, /\[insert/i, /\[company name\]/i, /\[your /i, /to be \(determined|filled\)/i];


  const ROLE_POLICIES = {
    general: { label: "General Professional", regulated: false, trustedSources: ["Official employer posting", "Current public web results", "Industry bodies when relevant"], focusAreas: ["required qualifications", "preferred qualifications", "keywords", "selection signals", "measurable outcomes"] },
    pilot: { label: "Pilot / Aviation", regulated: true, trustedSources: ["FAA", "BLS Occupational Outlook Handbook", "O*NET", "airline/employer posting"], focusAreas: ["certificate level", "ratings", "medical class", "flight hours", "Part 121/135 or employer-specific mins", "currency or type-specific requirements"] },
    mechanic: { label: "Mechanic / Technician", regulated: true, trustedSources: ["FAA for A&P if aviation", "ASE / employer posting if automotive", "BLS", "O*NET"], focusAreas: ["licenses/certifications", "specialty systems", "troubleshooting depth", "aircraft or vehicle classes", "inspection/compliance experience"] },
    restaurant_manager: { label: "Restaurant Manager", regulated: false, trustedSources: ["Employer posting", "BLS", "industry best practice sources"], focusAreas: ["P&L", "labor scheduling", "food cost", "inventory", "guest service", "high-volume operations"] },
    chef: { label: "Chef / Culinary Lead", regulated: false, trustedSources: ["Employer posting", "BLS", "industry best practice sources"], focusAreas: ["menu development", "food cost", "kitchen leadership", "volume", "food safety", "training"] },
    classic_restorer: { label: "Classic Car Restorer", regulated: false, trustedSources: ["Employer posting", "specialty restoration shops", "industry publications", "BLS where relevant"], focusAreas: ["frame-off restoration", "fabrication", "body/paint", "mechanical rebuilds", "portfolio evidence"] },
    electrician: { label: "Electrician", regulated: true, trustedSources: ["State licensing board", "BLS", "O*NET", "employer posting"], focusAreas: ["license level", "state requirements", "residential vs commercial", "service vs new construction", "NEC/code knowledge"] },
    plumber: { label: "Plumber", regulated: true, trustedSources: ["State licensing board", "BLS", "O*NET", "employer posting"], focusAreas: ["license level", "state requirements", "service vs new construction", "residential vs commercial", "specialty systems"] },
    contractor: { label: "Contractor / Construction Manager", regulated: true, trustedSources: ["State contractor board", "BLS", "O*NET", "employer posting"], focusAreas: ["license class", "ground-up vs remodel", "trade coordination", "permitting", "budget scope", "sub management"] },
    finance_exec: { label: "Accounting / Controller / CFO", regulated: false, trustedSources: ["Employer posting", "BLS", "O*NET", "reputable accounting bodies when relevant"], focusAreas: ["GAAP", "financial reporting", "audit/tax", "ERP stack", "cash flow", "leadership scope", "board/executive reporting"] },
    operations_consultant: { label: "Operations / Process Optimization", regulated: false, trustedSources: ["Employer posting", "BLS", "O*NET", "reputable operations/technology sources"], focusAreas: ["automation", "integrations", "cross-functional process redesign", "cost/time savings", "systems ownership", "change management"] }
  };


  const shell = document.getElementById('app-shell');
  const mainGrid = document.getElementById('app-main-grid');
  const qaWrapper = document.getElementById('chat-container-wrapper');
  const reviewPanel = document.getElementById('review-panel');
  const outputPanel = document.getElementById('main-outputs-panel');
  const promptContainer = document.getElementById('prompt-container');
  const stepCounter = document.getElementById('step-counter');
  const step0Inputs = document.getElementById('step-0-inputs');
  const nameIn = document.getElementById('user-name');
  const roleIn = document.getElementById('target-role');
  const chatInput = document.getElementById('chat-input');
  const btnBack = document.getElementById('back-button');
  const btnSkip = document.getElementById('skip-button');
  const btnSkipAll = document.getElementById('skip-all-button');
  const btnSend = document.getElementById('send-button');
  const loader = document.getElementById('typing-indicator');
  const overlay = document.getElementById('raccoonOverlay');
  const ovVid = document.getElementById('rtOverlayVideo');
  const reviewOutput = document.getElementById('review-output');
  const outputEl = document.getElementById('output');
  const copyBtn = document.getElementById('copyBtn');
  const copyReviewBtn = document.getElementById('copyReviewBtn');
  const outputLoader = document.getElementById('output-loader');
  const tabToolbar = document.getElementById('tab-toolbar');
  const introScreen = document.getElementById('intro-screen');
  const introVideo = document.getElementById('intro-video');
  const reviewTabsContainer = document.getElementById('review-tabs-container');
  const tabsContainer = document.getElementById('tabs-container');


  const wizardSteps = [
    { key: "profile", type: "profile", prompt: "To begin, enter your full **name** and the exact **role** you are applying for.", stepLabel: "Step 1 of 6" },
    { key: "resume", type: "textarea", prompt: "Paste your **current résumé** below. Plain text works best.", placeholder: "Paste your current résumé text here, or drag and drop a plain-text file..." },
    { key: "highlights", type: "textarea", prompt: "List your **strongest professional achievements** to highlight — include metrics, scope, cost savings, or notable outcomes.", placeholder: "e.g. Reduced operational costs by 22%, managed a 4-person team, deployed ERP system across 3 sites..." },
    { key: "story", type: "textarea", prompt: "Give the short **career context**. What kind of work do you do best, and why does this next move make sense?", placeholder: "e.g. 8 years in supply chain operations, transitioning from individual contributor to management..." },
    { key: "jd", type: "textarea", prompt: "Paste the **full job description**. If you only have title/company/location, use that — a full job description will yield more targeted results.", placeholder: "Paste the full job description here..." },
    { key: "constraints", type: "textarea", prompt: "Anything else to respect? Add links, location limits, start date, travel, compensation context, portfolio, or say **skip**.", placeholder: "e.g. Available June 2025, open to relocation, portfolio at linkedin.com/in/yourname..." }
  ];


  let appBooted = false;
  let quickReplyRow = null;
  let reviewBtnMap = {};
  let outputBtnMap = {};


  let appState = {
    currentPhase: 'wizard',
    wizardStepIndex: 0,
    isAwaitingInput: true,
    isGenerating: false,
    userInfo: { name: '', role: '' },
    roleKey: 'general',
    rolePolicy: ROLE_POLICIES.general,
    inputs: { resume: '', highlights: '', story: '', jd: '', constraints: '' },
    resumeReview: { active: false, phase: 'askChange', edits: { employment: [], contact: '', other: [] } },
    reviewReady: false,
    reviewTab: 'researchBrief',
    activeTab: 'researchBrief',
    reviewData: null,
    followUpQuestionsList: [],
    currentFollowUpSubIndex: 0,
    collectedFollowUpAnswers: [],
    missingQueue: [],
    currentMissingIndex: 0,
    missingFixes: [],
    finalDetails: '',
    lastGeneratedData: null,
    lastGroundingSources: []
  };


  function bootApp() {
    if (appBooted) return;
    appBooted = true;
    try { if (introVideo && introVideo.pause) introVideo.pause(); } catch (_) {}
    if (introScreen) introScreen.classList.add('hidden');
    shell.classList.remove('hidden');
    buildDynamicUI();
    bindResumeDropSupport();
    renderCurrentQuestion();
  }


  function initIntroScreen() {
    bootApp();
  }


  function buildDynamicUI() {
    if (!quickReplyRow) {
      quickReplyRow = document.createElement('div');
      quickReplyRow.id = 'quick-reply-row';
      quickReplyRow.className = 'toolbar-row hidden';
      const anchor = document.getElementById('quick-reply-anchor');
      if (anchor) { anchor.appendChild(quickReplyRow); } else { const qaFooter = document.querySelector('.qa-footer'); qaFooter.parentNode.insertBefore(quickReplyRow, qaFooter); }
    }


    [["verifiedRequirements","Requirements"],["sourceAudit","Source Audit"]].forEach(([key,label]) => {
      if (!reviewBtnMap[key]) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.type = 'button';
        btn.dataset.reviewTab = key;
        btn.textContent = label;
        reviewTabsContainer.appendChild(btn);
        reviewBtnMap[key] = btn;
      }
      if (!outputBtnMap[key]) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.type = 'button';
        btn.dataset.tab = key;
        btn.textContent = label;
        tabsContainer.insertBefore(btn, document.querySelector('[data-tab="previewExport"]'));
        outputBtnMap[key] = btn;
      }
    });


    reviewTabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-review-tab]');
      if (!btn) return;
      [...reviewTabsContainer.querySelectorAll('[data-review-tab]')].forEach(x => x.classList.remove('tab-btn-active'));
      btn.classList.add('tab-btn-active');
      appState.reviewTab = btn.dataset.reviewTab;
      renderReviewTab();
    });


    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      [...tabsContainer.querySelectorAll('[data-tab]')].forEach(x => x.classList.remove('tab-btn-active'));
      btn.classList.add('tab-btn-active');
      appState.activeTab = btn.dataset.tab;
      renderOutput();
    });
  }


  function showRaccoonOverlay(video) {
    if (!VIDEOS_ENABLED) return;
  }


  function hideRaccoonOverlay() {
    if (!VIDEOS_ENABLED) return;
  }


  async function playRaccoonScene(videoName, maxMs = 12000) {
    return Promise.resolve();
  }


  overlay.addEventListener('click', () => overlay.classList.contains('active') && hideRaccoonOverlay());
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('active')) hideRaccoonOverlay(); });


  function setInputState(disabled, text = '') {
    const bar = document.getElementById('processing-bar');
    if (bar) bar.classList.toggle('active', !!disabled);
    nameIn.disabled = disabled;
    roleIn.disabled = disabled;
    chatInput.disabled = disabled;
    btnSend.disabled = disabled;
    btnSkip.disabled = disabled;
    btnSkipAll.disabled = disabled;
    btnBack.disabled = disabled;
    loader.style.display = disabled ? 'block' : 'none';
    if (disabled) document.getElementById('loader-label').innerText = text || 'Analyzing your materials — this may take a moment...';
  }


  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }


  function normalizeHTML(value, fallbackTitle = '') {
    if (!value) return fallbackTitle ? `<p>${escapeHtml(fallbackTitle)}</p>` : '<p>No content.</p>';
    return String(value).replace(/```html/gi, '').replace(/```/g, '').trim();
  }


  function plainTextFromHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.innerText || tmp.textContent || '';
  }


  function editableTextToHTML(text) {
    const clean = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!clean) return '<p>No content.</p>';
    return `<pre style="white-space:pre-wrap; font-family:Inter, Helvetica, Arial, sans-serif; line-height:1.55;">${escapeHtml(clean)}</pre>`;
  }


  function formattedToday() {
    try {
      return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
      return new Date().toLocaleDateString();
    }
  }


  function applyFinalOutputCleanups(html) {
    let out = String(html || '');
    out = out.replace(/\[Date\]/gi, formattedToday());
    out = out.replace(/NASA\s+Safety\s+Certificate/gi, 'NASA Certificate of Outstanding Achievement in Aerospace Research');
    out = out.replace(/NASA\s+Certificate\s+of\s+Outstanding\s+Achievement\s+in\s+Aerospace\s+Safety/gi, 'NASA Certificate of Outstanding Achievement in Aerospace Research');
    out = out.replace(/Turbine\s*\/\s*Turbojet\s*:\s*([0-9,]+)/gi, 'Turbine: $1; turbojet allocation should be confirmed');
    out = out.replace(/Turbine\s*:\s*([0-9,]+)\s*\(includes\s+Turbojet\)/gi, 'Turbine: $1; turbojet allocation should be confirmed');
    out = out.replace(/([0-9,]+)\s+turbine\/turbojet/gi, '$1 turbine; turbojet allocation should be confirmed');
    return out;
  }


  function cleanupGeneratedPackage(data) {
    if (!data) return data;
    ['researchBrief','roleSummary','gapAnalysis','edgeQuestions','verifiedRequirements','sourceAudit','resumeATS','resumeTailored','coverLetter','keywordAddendum','strategyAdvice'].forEach(key => {
      if (data[key]) data[key] = applyFinalOutputCleanups(data[key]);
    });
    return data;
  }


  function parseAIJSONResponse(text) {
    try {
      return JSON.parse(String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (_) {
      throw new Error('Failed to parse AI response.');
    }
  }


  
function showErrorPanel(msg) {
  appState.currentPhase = 'error';
  const errorTarget = document.getElementById('output') || document.getElementById('main-outputs-panel');
  if (!errorTarget) return alert(msg);
  errorTarget.innerHTML = 
    `<div style="padding:32px;text-align:center;color:#ff6b6b;max-width:820px;margin:0 auto;">
      <h2 style="margin-bottom:16px;">⚠️ Generation Error</h2>
      <p>${escapeHtml(msg)}</p>
      <div style="margin-top:24px;">
        <button onclick="location.reload()" class="btn-primary" style="margin-right:12px;">🔄 Start Over</button>
        <button onclick="appState.currentPhase='followups';renderFollowUpQuestion();" class="btn-secondary">↺ Retry Follow-ups</button>
      </div>
    </div>`;
  document.querySelector('.app-shell').scrollTop = 0;
  setInputState(false);
}


function detectRoleKey(roleInput) {
    const r = String(roleInput || '').toLowerCase();
    if (/\bpilot|first officer|captain|aviation\b/.test(r)) return 'pilot';
    if (/\bmechanic|technician|a&p|airframe|powerplant\b/.test(r)) return 'mechanic';
    if (/\brestaurant manager|general manager|foh|boh\b/.test(r)) return 'restaurant_manager';
    if (/\bchef|sous chef|executive chef|culinary\b/.test(r)) return 'chef';
    if (/\brestor|classic car|fabricator|hot rod\b/.test(r)) return 'classic_restorer';
    if (/\belectrician|journeyman electrician|master electrician\b/.test(r)) return 'electrician';
    if (/\bplumber|journeyman plumber|master plumber\b/.test(r)) return 'plumber';
    if (/\bcontractor|superintendent|construction manager|project manager\b/.test(r)) return 'contractor';
    if (/\bcfo|controller|accountant|accounting|finance manager|financial controller\b/.test(r)) return 'finance_exec';
    if (/\bconsultant|operations|process|integration|automation|optimizer\b/.test(r)) return 'operations_consultant';
    return 'general';
  }


  function rolePolicyText(roleKey) {
    const policy = ROLE_POLICIES[roleKey] || ROLE_POLICIES.general;
    return [
      `Role family: ${policy.label}`,
      `Regulated role: ${policy.regulated ? 'Yes' : 'No'}`,
      `Trusted sources to prioritize: ${policy.trustedSources.join('; ')}`,
      `Focus areas: ${policy.focusAreas.join('; ')}`
    ].join('\n');
  }


  function extractCompanyName(jd) {
    const lines = String(jd || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const labeled = lines.find(line => /^company[:\-]/i.test(line));
    if (labeled) return labeled.replace(/^company[:\-]\s*/i, '').trim();
    return '';
  }


  function finalizeQuestionList(rawQuestions) {
    const cleaned = (Array.isArray(rawQuestions) ? rawQuestions : [])
      .map(x => String(x || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((q, idx, arr) => arr.indexOf(q) === idx)
      .filter(q => q.length > 12)
      .filter(q => !QUESTION_BANNED_TERMS.some(term => q.toLowerCase().includes(term)))
      .slice(0, 6);
    if (cleaned.length) return cleaned.map(q => q.endsWith('?') ? q : `${q}?`);
    return [
      "What specific measurable outcomes from your recent work best prove fit for this role?",
      "Which licenses, certifications, systems, or specialized tools should be explicitly named?",
      "What leadership, cross-functional, or problem-solving example would most improve your odds?",
      "What constraints or details matter here — location, travel, start date, schedule, clearance, or portfolio?"
    ];
  }


  function sanitizeMissingQueue(items) {
    const unique = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      const clean = String(item || '').replace(/\s+/g, ' ').trim();
      if (clean && !unique.includes(clean)) unique.push(clean);
    });
    return unique.slice(0, 8);
  }


  function mergeGroundingSources(raw, htmlBlock = '') {
    const found = [];
    const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach(chunk => {
      const web = chunk?.web;
      if (web?.uri && !found.some(x => x.uri === web.uri)) found.push({ title: escapeHtml(web.title || web.uri), uri: escapeHtml(web.uri) });
    });
    appState.lastGroundingSources = found;
    if (!found.length) return htmlBlock;
    const sourceHtml = `<h3>Grounded source trail</h3><ul>${found.map(src => `<li><a href="${src.uri}" target="_blank" rel="noopener noreferrer">${src.title}</a></li>`).join('')}</ul>`;
    return normalizeHTML(htmlBlock || '', '') + sourceHtml;
  }


  function documentContainsPlaceholders(html) {
    const text = String(html || '');
    return DOCUMENT_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
  }


  async function fetchWithBackoff(url, options, maxRetries = 3) {
    const delays = [1000, 2000, 4000, 7000];
    let lastError = null;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        const clone = response.clone();
        if (response.ok) return response;
        const body = await clone.text().catch(() => '');
        lastError = new Error(body || `HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (i < maxRetries) await new Promise(r => setTimeout(r, delays[i] || 7000));
    }
    throw lastError || new Error('Request failed.');
  }


  function getCandidateText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  return parts && parts.length
    ? parts.map(part => part.text || '').join('\n').trim()
    : '';
}






  function buildGeminiPayload(payload) {
    const result = {
      contents: [{ role: "user", parts: [{ text: payload.prompt || "" }] }],
      generationConfig: {
        temperature: payload.temperature == null ? 0.35 : payload.temperature,
        maxOutputTokens: payload.maxOutputTokens || 8192
      }
    };


    if (payload.systemPrompt) {
      result.systemInstruction = {
        role: "system",
        parts: [{ text: payload.systemPrompt }]
      };
    }

    if (payload.responseMimeType) {
      result.generationConfig.responseMimeType = payload.responseMimeType;
    }

        if (payload.useGoogleSearch) {
      result.tools = [{ google_search: {} }];
    }


    return result;
  }


  async function fetchModelJSON(model, payload, action = "analysis") {
    const response = await fetchWithBackoff(API_GENERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, payload, action })
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
    }

    return {
      text: json?.text || getCandidateText(json?.raw || json),
      raw: json?.raw || json,
      model: json?.model || model
    };
  }


  async function fetchWithModelFallback(preferredModel, payload, action = "analysis") {
    const models = [preferredModel, ...MODEL_FALLBACKS.filter(m => m !== preferredModel)];
    const tried = [];
    let lastError = null;
    for (const model of models) {
      try {
        const json = await fetchModelJSON(model, payload, action);
        return { json, model };
      } catch (error) {
        tried.push(`${model}: ${error.message}`);
        lastError = error;
      }
    }
    throw new Error(tried.join(' | ') || lastError?.message || 'Request failed.');
  }


  function selectedModel() {
    const value = String(appState.userInfo.name || nameIn.value || '').trim().toUpperCase();
    return value === 'TEST' ? SECONDARY_MODEL : PRIMARY_MODEL;
  }


  function bindResumeDropSupport() {
    function handleDroppedFile(file) {
      if (!file) return;
      const isTextLike = file.type.startsWith('text/') || /\.(txt|md|rtf)$/i.test(file.name);
      if (!isTextLike) return alert('This build supports drag-and-drop of plain text files only.');
      const reader = new FileReader();
      reader.onload = () => {
        if (!(appState.currentPhase === 'wizard' && wizardSteps[appState.wizardStepIndex]?.key === 'resume')) return;
        chatInput.value = String(reader.result || '');
        chatInput.focus();
      };
      reader.readAsText(file);
    }
    ['dragenter','dragover'].forEach(evt => {
      chatInput.addEventListener(evt, e => {
        if (!(appState.currentPhase === 'wizard' && wizardSteps[appState.wizardStepIndex]?.key === 'resume')) return;
        e.preventDefault(); e.stopPropagation(); chatInput.classList.add('drag-over');
      });
    });
    ['dragleave','dragend','drop'].forEach(evt => {
      chatInput.addEventListener(evt, e => {
        if (evt === 'drop' && appState.currentPhase === 'wizard' && wizardSteps[appState.wizardStepIndex]?.key === 'resume') {
          e.preventDefault(); e.stopPropagation(); handleDroppedFile((e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null);
        }
        chatInput.classList.remove('drag-over');
      });
    });
  }


  function setQuickReplies(items = []) {
    if (!quickReplyRow) return;
    quickReplyRow.innerHTML = '';
    if (!items.length) { quickReplyRow.classList.add('hidden'); return; }
    items.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-secondary';
      button.textContent = item.label;
      button.addEventListener('click', () => {
        if (item.value === '__SKIP__') return handleNext('skip');
        chatInput.value = item.value;
        handleNext('send');
      });
      quickReplyRow.appendChild(button);
    });
    quickReplyRow.classList.remove('hidden');
  }


  function setStandardFooterState() {
    const inWizard = appState.currentPhase === 'wizard';
    const inFollowups = appState.currentPhase === 'followups';
    const inMissing = appState.currentPhase === 'missingInfo';
    const inResumeReview = appState.currentPhase === 'resumeReview';
    btnBack.style.display = (inWizard && appState.wizardStepIndex > 0) || inFollowups ? 'inline-flex' : 'none';
    btnSkip.style.display = (inWizard && appState.wizardStepIndex > 0) || inFollowups || inMissing || inResumeReview || appState.currentPhase === 'finalDetails' ? 'inline-flex' : 'inline-flex';
    btnSkipAll.style.display = (inFollowups && appState.followUpQuestionsList.length > 1) ? 'inline-flex' : 'none';
  }


  function renderWizardStep() {
    const step = wizardSteps[appState.wizardStepIndex];
    promptContainer.innerHTML = `<div>${String(step.prompt).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
    setQuickReplies([]);
    step0Inputs.classList.toggle('hidden', step.type !== 'profile');
    chatInput.classList.toggle('hidden', step.type === 'profile');
    if (step.type === 'profile') {
      nameIn.value = appState.userInfo.name;
      roleIn.value = appState.userInfo.role;
    } else {
      chatInput.value = appState.inputs[step.key] || '';
      chatInput.placeholder = step.placeholder || 'Type your answer here...';
    }
    stepCounter.innerText = step.stepLabel || `Step ${appState.wizardStepIndex + 1} of ${wizardSteps.length}`;
    setStandardFooterState();
    setInputState(false);
    appState.isAwaitingInput = true;
  }


  function renderResumeReview() {
    const phase = appState.resumeReview.phase;
    step0Inputs.classList.add('hidden');
    chatInput.classList.remove('hidden');
    stepCounter.innerText = 'Résumé Tune-Up';
    setStandardFooterState();
    if (phase === 'askChange') {
      promptContainer.innerHTML = `<div>Before we move on, do you want to make any <strong>changes to the résumé details</strong> you just pasted?</div>`;
      chatInput.value = ''; chatInput.placeholder = 'Type yes or no...';
      setQuickReplies([{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]);
    } else if (phase === 'chooseArea') {
      promptContainer.innerHTML = `<div>Which section of your résumé would you like to update?<span class="helper-text">Choose one at a time so nothing gets lost.</span></div>`;
      chatInput.value = ''; chatInput.placeholder = "Type employment, contact, other, or next...";
      setQuickReplies([{ label: 'Employment', value: 'employment' }, { label: 'Contact', value: 'contact' }, { label: 'Other', value: 'other' }, { label: 'Next', value: 'next' }]);
    } else if (phase === 'employment_name_dates') {
      promptContainer.innerHTML = `<div>Add the <strong>most recent/current employer</strong> update.<span class="helper-text">Use one line like: <em>Acme Corp — Jan 2022 to Present — Senior Ops Manager</em>.</span></div>`;
      chatInput.value = ''; chatInput.placeholder = 'Employer — Dates — Title...'; setQuickReplies([]);
    } else if (phase === 'employment_more') {
      promptContainer.innerHTML = `<div>Add another employer update?</div>`;
      chatInput.value = ''; chatInput.placeholder = "Type yes, no, or next...";
      setQuickReplies([{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Next', value: 'next' }]);
    } else if (phase === 'contact') {
      promptContainer.innerHTML = `<div>Update <strong>contact information</strong>.<span class="helper-text">Add anything that changed: name, email, phone, city/state, LinkedIn, portfolio URL.</span></div>`;
      chatInput.value = ''; chatInput.placeholder = 'Paste updated contact details...'; setQuickReplies([]);
    } else if (phase === 'other') {
      promptContainer.innerHTML = `<div>What else should be added, removed, or corrected in the résumé facts?</div>`;
      chatInput.value = ''; chatInput.placeholder = 'Add or remove facts here...'; setQuickReplies([]);
    }
    setInputState(false); appState.isAwaitingInput = true;
  }


  function buildFollowUpPrompt(question, index, total) {
    return `<div><span class="qa-eyebrow">Targeted Follow-Up ${index + 1} of ${total}</span><h1 class="qa-title" style="margin-top:8px;">${escapeHtml(question)}</h1><span class="helper-text">Please answer as directly as possible, or skip if not applicable.</span></div>`;
  }


  function renderFollowUpQuestion() {
    const total = appState.followUpQuestionsList.length;
    if (appState.currentFollowUpSubIndex >= total) { startMissingInfoPhase(); return; }
    const question = appState.followUpQuestionsList[appState.currentFollowUpSubIndex];
    promptContainer.innerHTML = buildFollowUpPrompt(question, appState.currentFollowUpSubIndex, total);
    step0Inputs.classList.add('hidden'); chatInput.classList.remove('hidden');
    chatInput.value = ''; chatInput.placeholder = 'Answer as directly as you can, or use Skip if this one should stay out.';
    stepCounter.innerText = 'Targeted Questioning'; setQuickReplies([]); setStandardFooterState(); setInputState(false); appState.isAwaitingInput = true;
  }


  function renderMissingInfoQuestion() {
    const issue = appState.missingQueue[appState.currentMissingIndex];
    if (!issue) { runFinalGeneration(); return; }
    promptContainer.innerHTML = `<div><span class="qa-eyebrow">Missing Detail ${appState.currentMissingIndex + 1} of ${appState.missingQueue.length}</span><h1 class="qa-title" style="margin-top:8px;">Additional Information Needed</h1><span class="helper-text">${escapeHtml(issue)}</span></div>`;
    step0Inputs.classList.add('hidden'); chatInput.classList.remove('hidden');
    chatInput.value = ''; chatInput.placeholder = 'Provide the missing detail, or Skip to leave it out of the application package.';
    stepCounter.innerText = 'Missing Info Repair'; setQuickReplies([]); setStandardFooterState(); setInputState(false); appState.isAwaitingInput = true;
  }


  function renderFinalDetailsQuestion() {
    promptContainer.innerHTML = `<div>Final additions — is there anything else to incorporate?<span class="helper-text">Portfolio links, constraints, availability, one last brag, or just hit Skip.</span></div>`;
    step0Inputs.classList.add('hidden'); chatInput.classList.remove('hidden');
    chatInput.value = appState.finalDetails || ''; chatInput.placeholder = 'Add final details here, or skip if done...';
    stepCounter.innerText = 'Final Details'; setQuickReplies([]); setStandardFooterState(); setInputState(false); appState.isAwaitingInput = true;
  }


  function renderCurrentQuestion() {
    if (appState.currentPhase === 'wizard') return renderWizardStep();
    if (appState.currentPhase === 'resumeReview') return renderResumeReview();
    if (appState.currentPhase === 'followups') return renderFollowUpQuestion();
    if (appState.currentPhase === 'missingInfo') return renderMissingInfoQuestion();
    if (appState.currentPhase === 'finalDetails') return renderFinalDetailsQuestion();
  }


  function handleSkipCurrent() {
  if (appState.isGenerating) return;

    if (appState.currentPhase === 'wizard') {
      const step = wizardSteps[appState.wizardStepIndex];
      if (step.type === 'profile') return;
      appState.inputs[step.key] = '';
      if (step.key === 'constraints') return runAnalysisPhase();
      appState.wizardStepIndex += 1; return renderCurrentQuestion();
    }
    if (appState.currentPhase === 'resumeReview') { appState.resumeReview.phase = 'chooseArea'; return renderCurrentQuestion(); }
    if (appState.currentPhase === 'followups') {
      const question = appState.followUpQuestionsList[appState.currentFollowUpSubIndex];
      appState.collectedFollowUpAnswers.push(`Question: ${question}\nAnswer: [SKIPPED]`);
      appState.currentFollowUpSubIndex += 1; return renderCurrentQuestion();
    }
    if (appState.currentPhase === 'missingInfo') {
      const issue = appState.missingQueue[appState.currentMissingIndex];
      appState.missingFixes.push(`Issue: ${issue}\nResolution: [SKIPPED]`);
      appState.currentMissingIndex += 1; return renderCurrentQuestion();
    }
    if (appState.currentPhase === 'finalDetails') { appState.finalDetails = ''; return beginMissingQueueAfterFinalDetails(); }
  }


  function handleResumeReviewInput(rawInput) {
    const input = String(rawInput || '').trim();
    const lower = input.toLowerCase();
    const review = appState.resumeReview;
    if (review.phase === 'askChange') {
      if (['no','n','skip','next'].includes(lower)) { review.active = false; appState.currentPhase = 'wizard'; appState.wizardStepIndex = 2; return renderCurrentQuestion(); }
      if (['yes','y'].includes(lower)) { review.phase = 'chooseArea'; return renderCurrentQuestion(); }
      return alert('Please answer yes or no.');
    }
    if (review.phase === 'chooseArea') {
      if (['next','no','done'].includes(lower)) { review.active = false; appState.currentPhase = 'wizard'; appState.wizardStepIndex = 2; return renderCurrentQuestion(); }
      if (['employment','1'].includes(lower)) { review.phase = 'employment_name_dates'; return renderCurrentQuestion(); }
      if (['contact','2'].includes(lower)) { review.phase = 'contact'; return renderCurrentQuestion(); }
      review.phase = 'other'; return renderCurrentQuestion();
    }
    if (review.phase === 'employment_name_dates') {
      if (!input) return alert('Add at least employer and dates.');
      review.edits.employment.push(input); review.phase = 'employment_more'; return renderCurrentQuestion();
    }
    if (review.phase === 'employment_more') { review.phase = ['yes','y'].includes(lower) ? 'employment_name_dates' : 'chooseArea'; return renderCurrentQuestion(); }
    if (review.phase === 'contact') { review.edits.contact = [review.edits.contact, input].filter(Boolean).join('\n'); review.phase = 'chooseArea'; return renderCurrentQuestion(); }
    if (review.phase === 'other') { if (input) review.edits.other.push(input); review.phase = 'chooseArea'; return renderCurrentQuestion(); }
  }


  function reviewEditsText() {
    const edits = appState.resumeReview.edits;
    return [
      edits.employment.length ? `Employment edits:\n- ${edits.employment.join('\n- ')}` : '',
      edits.contact ? `Contact edits:\n${edits.contact}` : '',
      edits.other.length ? `Other edits:\n- ${edits.other.join('\n- ')}` : ''
    ].filter(Boolean).join('\n\n') || 'No explicit resume edits.';
  }


  async function callAnalysis() {
    const prompt = [
      `Applicant Name: ${appState.userInfo.name}`,
      `Target Role: ${appState.userInfo.role}`,
      `Role Policy:\n${rolePolicyText(appState.roleKey)}`,
      `Resume:\n${appState.inputs.resume || '[None supplied]'}`,
      `Resume Edits:\n${reviewEditsText()}`,
      `Key Highlights:\n${appState.inputs.highlights || '[None supplied]'}`,
      `Career Context:\n${appState.inputs.story || '[None supplied]'}`,
      `Job Description:\n${appState.inputs.jd || '[None supplied]'}`,
      `Constraints / Extras:\n${appState.inputs.constraints || '[None supplied]'}`,
      appState.liveResearch ? `--- LIVE MARKET RESEARCH (web-grounded — use to inform your analysis) ---\n${appState.liveResearch}` : ''
    ].filter(Boolean).join('\n\n');


    const systemPrompt = [
      'You are an elite application strategist and verifier.',
      'Use the provided job description, user facts, and current public information.',
      'For regulated or certification-heavy roles, prioritize official/current sources and clearly separate legal minimums, common market expectations, and employer-specific preferences.',
      'Never invent citations. If a fact is uncertain, label it Needs Verification instead of fabricating.',
      'REGULATED FACT PRESERVATION: For licenses, ratings, certifications, medical status, flight hours, aircraft types, legal qualifications, security clearances, training programs, degree status, and regulated-role requirements, preserve the exact user-provided wording. Do not rename, convert, upgrade, simplify, or infer equivalent wording. If the job requires a different or more specific term than the resume/user answers provide, mark it Needs confirmation instead of converting it.',
      'Generate a tightly useful research review and a follow-up plan.',
      '',
      'Return ONLY valid JSON with these keys:',
      '{',
      '  "researchBrief": "HTML string",',
      '  "criteriaMap": "HTML string table or list",',
      '  "gapAnalysis": ["array of concrete gaps or weakly supported items"],',
      '  "verifiedRequirements": "HTML string grouping legal minimums / market expectations / employer specifics",',
      '  "sourceAudit": "HTML string summarizing source types and trust notes",',
      '  "questions": ["array of up to 4 targeted follow-up questions FOR THE APPLICANT to answer — gaps in their materials: missing metrics, unnamed tools/systems, unverified credentials, leadership scope, context the model cannot infer. Specific to this role and resume, never generic."],',
      '  "edgeQuestions": ["array of 3-4 tough questions the INTERVIEWER might ask — adversarial, edge-case, or high-stakes tests of the applicant\'s weakest points relative to this role."],',
      '  "atsKeywords": ["array of keywords"],',
      '  "selectionProcess": ["array of likely hiring stages"],',
      '  "missingCritical": ["array of missing facts that should be repaired before final drafting if available"]',
      '}',
      'questions: Targeted to THIS applicant\'s specific resume and role. Never generic. edgeQuestions are separate — do not mix them into the questions array.'
    ].join('\n');


    const payload = { prompt, systemPrompt, responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 };
    const { json, model } = await fetchWithModelFallback(selectedModel(), payload, 'analysis');
    const parsed = parseAIJSONResponse(json?.text || '{}');
    parsed.questions = finalizeQuestionList(parsed.questions);
    parsed.edgeQuestions = Array.isArray(parsed.edgeQuestions) ? parsed.edgeQuestions.slice(0, 4) : [];
    parsed.gapAnalysis = Array.isArray(parsed.gapAnalysis) ? parsed.gapAnalysis : [];
    parsed.missingCritical = sanitizeMissingQueue(parsed.missingCritical || parsed.gapAnalysis || []);
    parsed.researchBrief = normalizeHTML(parsed.researchBrief, 'No research brief returned.');
    parsed.criteriaMap = normalizeHTML(parsed.criteriaMap, 'No criteria map returned.');
    parsed.verifiedRequirements = mergeGroundingSources(json?.raw, normalizeHTML(parsed.verifiedRequirements, 'No verified requirements returned.'));
    parsed.sourceAudit = mergeGroundingSources(json?.raw, normalizeHTML(parsed.sourceAudit, 'No source audit returned.'));
    parsed.gapAnalysisHTML = parsed.gapAnalysis.length ? `<h3>Gap Analysis</h3><ol>${parsed.gapAnalysis.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>` : '<p>No gap analysis returned.</p>';
    parsed.edgeQuestionsHTML = parsed.edgeQuestions.length
      ? `<h3>Edge Questions</h3><ol>${parsed.edgeQuestions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
      : '<p>No edge questions returned.</p>';
    parsed.modelUsed = model;
    return parsed;
  }


  async function runAnalysisPhase() {
    appState.currentPhase = 'analyzing';
    setInputState(true, 'Researching role requirements...');
    await playRaccoonScene('', 0);
    try {
      // Call 1 — Google Search grounding (non-fatal)
      appState.liveResearch = '';
      try {
        const groundingPayload = {
          prompt: [
            `Role being applied for: ${appState.userInfo.role}`,
            appState.inputs.jd
              ? `Job Description provided — focus research on company context, role norms, and current market for this specific posting.`
              : `No job description provided — research current market standards, typical requirements, salary norms, and hiring practices for this role.`,
            ``,
            `Return a structured plain-text research brief covering:`,
            `1. Current market requirements and must-have qualifications for this role`,
            `2. Common nice-to-have skills and certifications`,
            `3. Typical hiring process and evaluation criteria`,
            `4. Salary range and compensation norms`,
            `5. Industry-specific red flags or differentiators`,
            `6. Company context (if JD provided with identifiable employer)`,
            `Be specific and flag anything uncertain.`
          ].join('\n'),
          systemPrompt: 'You are a hiring market research specialist. Return factual, current information only in plain text. Never invent citations.',
          useGoogleSearch: true,
          temperature: 0.1,
          maxOutputTokens: 4096
        };
        const { json: gr } = await fetchWithModelFallback(selectedModel(), groundingPayload, 'simple');
        appState.liveResearch = gr?.text || '';
      } catch (_) { /* non-fatal — proceed without grounding */ }

      setInputState(true, 'Analyzing your profile...');
      const analysis = await callAnalysis();
      appState.reviewData = analysis;
      // followUpQuestionsList: targeted applicant questions ONLY (edgeQuestions go to tab display only)
      appState.followUpQuestionsList = analysis.questions.slice(0, 4);
      appState.currentFollowUpSubIndex = 0;
      appState.collectedFollowUpAnswers = [];
      appState.reviewReady = true;
      showReviewPanel();
    } catch (error) {
      hideRaccoonOverlay();
      appState.isGenerating = false;
      setInputState(false);
      const message = `Analysis Error: ${error.message}`;
      if (/reported as leaked|API key|PERMISSION_DENIED|403/i.test(error.message)) {
        alert(`${message}

The Gemini key in this browser build is invalid/rejected. Check the Netlify GEMINI_API_KEY environment variable and redeploy.`);
      } else {
        alert(message);
      }
      appState.currentPhase = 'wizard';
      renderCurrentQuestion();
    } finally {
      appState.isGenerating = false;
      setInputState(false);
    }
  }


  function showReviewPanel() {
    appState.currentPhase = 'review';
    qaWrapper.style.display = 'none';
    shell.classList.add('is-dashboard');
    mainGrid.classList.remove('centered-mode');
    reviewPanel.classList.remove('hidden');
    reviewPanel.style.display = 'flex';
    outputPanel.style.display = 'none';
    appState.reviewTab = 'researchBrief';
    [...reviewTabsContainer.querySelectorAll('[data-review-tab]')].forEach(x => x.classList.remove('tab-btn-active'));
    reviewTabsContainer.querySelector('[data-review-tab="researchBrief"]').classList.add('tab-btn-active');
    renderReviewTab();
  }


  function returnToQuestions() {
    appState.currentPhase = 'followups';
    reviewPanel.style.display = 'none';
    qaWrapper.style.display = 'flex';
    renderCurrentQuestion();
  }


  function renderReviewTab() {
    const data = appState.reviewData || {};
    const blocks = { researchBrief: data.researchBrief, criteriaMap: data.criteriaMap, gapAnalysis: data.gapAnalysisHTML, edgeQuestions: data.edgeQuestionsHTML, verifiedRequirements: data.verifiedRequirements, sourceAudit: data.sourceAudit };
    reviewOutput.innerHTML = blocks[appState.reviewTab] || '<p>No content.</p>';
  }


  function startMissingInfoPhase() { appState.currentPhase = 'finalDetails'; renderCurrentQuestion(); }


  function beginMissingQueueAfterFinalDetails() {
    appState.missingQueue = sanitizeMissingQueue(appState.reviewData?.missingCritical || []);
    appState.currentMissingIndex = 0;
    appState.missingFixes = [];
    if (!appState.missingQueue.length) return runFinalGeneration();
    appState.currentPhase = 'missingInfo'; renderCurrentQuestion();
  }


  async function runFinalGeneration() {
    appState.currentPhase = 'generating';
    setInputState(true, 'Analyzing your materials — this may take a moment...');
    showRaccoonOverlay('');
    try {
      const prompt = [
        `Applicant Name: ${appState.userInfo.name}`,
        `Target Role: ${appState.userInfo.role}`,
        `Company Name: ${extractCompanyName(appState.inputs.jd) || 'Unknown'}`,
        `Role Policy:\n${rolePolicyText(appState.roleKey)}`,
        `Resume:\n${appState.inputs.resume || '[None supplied]'}`,
        `Resume Edits:\n${reviewEditsText()}`,
        `Key Highlights:\n${appState.inputs.highlights || '[None supplied]'}`,
        `Career Context:\n${appState.inputs.story || '[None supplied]'}`,
        `Job Description:\n${appState.inputs.jd || '[None supplied]'}`,
        `Constraints / Extras:\n${appState.inputs.constraints || '[None supplied]'}`,
        `Research Brief Summary: Key role insights already reviewed.`,
        `Criteria Summary: Role requirements already reviewed.`,
        `Gap Analysis Summary: Gaps already reviewed and addressed.`,
        `Requirements Summary: Verified standards already reviewed.`,
        `Sources Summary: Research sources already reviewed.`,
        `Follow-Up Q&A:\n${appState.collectedFollowUpAnswers.join('\n\n') || '[None]'}`,
        `Final Details:\n${appState.finalDetails || '[None supplied]'}`,
        `Missing Info Repair Log:\n${appState.missingFixes.join('\n\n') || '[None]'}`,
        `ATS Keywords:\n${(appState.reviewData?.atsKeywords || []).join(', ')}`,
        `Likely Selection Process:\n${(appState.reviewData?.selectionProcess || []).join('\n- ')}`,
        `Interview Edge Questions (generate a full prep guide for each):\n${(appState.reviewData?.edgeQuestions || []).map((q, i) => `${i + 1}. ${q}`).join('\n') || '[None provided]'}`
      ].join('\n\n');


      const systemPrompt = [
        'You are an expert professional application package writer.',
        'Use only supported user facts plus verified/inferred role analysis already provided.',
        'Do not fabricate credentials, dates, metrics, hours, licenses, certifications, or tools.',
        'REGULATED FACT PRESERVATION: For licenses, ratings, certifications, medical status, flight hours, aircraft types, legal qualifications, security clearances, training programs, degree status, and regulated-role requirements, preserve the exact user-provided wording. Do not rename, convert, upgrade, simplify, or infer equivalent wording. Do not treat related terms as equivalent unless the user explicitly confirms equivalence. If the job requires a more specific term than the user provided, keep the user-facing document clean but put the uncertainty in missingInfo and audit sections.',
        'Examples of the preservation rule: do not convert turbine to turbojet; do not convert G-200 to G650; do not rewrite a certificate title into a different certificate title; do not infer a clean driving record, zero incidents, security clearance, degree, or license currency unless the user confirms it.',
        'Do not insert placeholders inside the final resume or cover letter. If something is unresolved, omit the unsupported claim and list the issue in missingInfo.',
        'Keep the final documents clean, professional, ATS-conscious, and role-specific.',
        'For regulated roles, preserve the distinction between legal minimums, common hiring expectations, and employer-specific preferences.',
        '',
        'Return ONLY valid JSON with keys:',
        '{',
        '  "missingInfo": ["remaining unresolved items"],',
        '  "researchBrief": "HTML string",',
        '  "roleSummary": "HTML string",',
        '  "gapAnalysis": "HTML string",',
        '  "edgeQuestions": "HTML string — a complete Interview Prep Guide. For EACH edge question provided, produce a structured section with: an <h3> with the question text; <p><strong>Why this question matters:</strong> 1-2 sentences on its relevance to this specific role and what it is probing for; <p><strong>What the interviewer wants to hear:</strong> the quality or signal a great answer demonstrates; <p><strong>Suggested answer framework:</strong> a concrete 3-5 sentence suggested answer tailored to this applicant\'s actual background, experience, and the role — not generic advice; <p><strong>Tips & traps:</strong> an <ul> of 2-3 practical bullet points — what to emphasize, common mistakes to avoid, or how to make the answer memorable. Write the full guide as clean, print-ready HTML.",',
        '  "verifiedRequirements": "HTML string",',
        '  "sourceAudit": "HTML string",',
        '  "resumeATS": "HTML string",',
        '  "resumeTailored": "HTML string",',
        '  "coverLetter": "HTML string",',
        '  "keywordAddendum": "HTML string",',
        '  "strategyAdvice": "HTML string with interview prep, outreach note, and alternate targets",',
        '  "meta": { "applicantName": "", "companyName": "", "role": "" }',
        '}'
      ].join('\n');


      const payload = { prompt, systemPrompt, responseMimeType: 'application/json', temperature: 0.18, maxOutputTokens: 16384 };
      const { json } = await fetchWithModelFallback(selectedModel(), payload, 'generate');
      const parsed = parseAIJSONResponse(json?.text || '{}');
      parsed.missingInfo = sanitizeMissingQueue(parsed.missingInfo || []);
      parsed.researchBrief = normalizeHTML(parsed.researchBrief || appState.reviewData?.researchBrief, 'No research brief returned.');
      parsed.roleSummary = normalizeHTML(parsed.roleSummary || appState.reviewData?.criteriaMap, 'No role summary returned.');
      parsed.gapAnalysis = normalizeHTML(parsed.gapAnalysis || appState.reviewData?.gapAnalysisHTML, 'No gap analysis returned.');
      parsed.edgeQuestions = normalizeHTML(parsed.edgeQuestions || appState.reviewData?.edgeQuestionsHTML, 'No edge questions returned.');
      parsed.verifiedRequirements = mergeGroundingSources(json?.raw, normalizeHTML(parsed.verifiedRequirements || appState.reviewData?.verifiedRequirements, 'No verified requirements returned.'));
      parsed.sourceAudit = mergeGroundingSources(json?.raw, normalizeHTML(parsed.sourceAudit || appState.reviewData?.sourceAudit, 'No source audit returned.'));
      parsed.resumeATS = normalizeHTML(parsed.resumeATS, 'No ATS resume returned.');
      parsed.resumeTailored = normalizeHTML(parsed.resumeTailored, 'No tailored resume returned.');
      parsed.coverLetter = normalizeHTML(parsed.coverLetter, 'No cover letter returned.');
      parsed.keywordAddendum = normalizeHTML(parsed.keywordAddendum, 'No keyword addendum returned.');
      parsed.strategyAdvice = normalizeHTML(parsed.strategyAdvice, 'No strategy advice returned.');
      parsed.meta = parsed.meta || {};
      parsed.meta.applicantName = parsed.meta.applicantName || appState.userInfo.name || 'Applicant';
      parsed.meta.companyName = parsed.meta.companyName || extractCompanyName(appState.inputs.jd) || 'Company';
      parsed.meta.role = parsed.meta.role || appState.userInfo.role || 'Target Role';
      if (documentContainsPlaceholders(parsed.resumeTailored) || documentContainsPlaceholders(parsed.coverLetter)) parsed.missingInfo.push('Placeholder-style content detected in a final document. Review before use.');
      parsed.missingInfo = sanitizeMissingQueue(parsed.missingInfo);
      cleanupGeneratedPackage(parsed);
      appState.lastGeneratedData = parsed;
      hideRaccoonOverlay();
      transitionToOutputs();
      setTimeout(() => playRaccoonScene('', 0), 300);
    } catch (error) {
      hideRaccoonOverlay();
      appState.isGenerating = false;
      setInputState(false);
      const message = `Generation Error: ${error.message}`;
      if (/reported as leaked|API key|PERMISSION_DENIED|403/i.test(error.message)) {
        alert(`${message}

The Gemini key in this browser build is invalid/rejected. Check the Netlify GEMINI_API_KEY environment variable and redeploy.`);
      } else {
        alert(`${message}

Your research data is preserved. Please try again after checking the console/network error.`);
      }
      appState.currentPhase = appState.reviewData ? 'finalDetails' : 'wizard';
      renderCurrentQuestion();
    }
  }


  function transitionToOutputs() {
    appState.currentPhase = 'outputs';
    qaWrapper.style.display = 'none';
    reviewPanel.style.display = 'none';
    shell.classList.add('is-dashboard');
    mainGrid.classList.remove('centered-mode');
    outputPanel.classList.remove('hidden');
    outputPanel.style.display = 'flex';
    appState.activeTab = 'researchBrief';
    [...tabsContainer.querySelectorAll('[data-tab]')].forEach(x => x.classList.remove('tab-btn-active'));
    tabsContainer.querySelector('[data-tab="researchBrief"]').classList.add('tab-btn-active');
    renderOutput();
  }


  function calculateATSScore() {
    const keywords = (appState.reviewData?.atsKeywords || []).map(k => String(k || '').toLowerCase().trim()).filter(Boolean);
    if (!keywords.length) return 0;
    const text = plainTextFromHTML(appState.lastGeneratedData?.resumeTailored || '').toLowerCase();
    const hits = keywords.filter(keyword => text.includes(keyword)).length;
    return Math.max(0, Math.min(100, Math.round((hits / keywords.length) * 100)));
  }



  function setReviewEditorValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const plain = plainTextFromHTML(applyFinalOutputCleanups(value || ''));
    el.value = plain;
    el.dataset.originalPlain = plain;
  }

  function syncExportReviewEdits() {
    const data = appState.lastGeneratedData;
    if (!data) return;
    const fields = [
      ['export-edit-tailored', 'resumeTailored'],
      ['export-edit-ats', 'resumeATS'],
      ['export-edit-cover', 'coverLetter'],
      ['export-edit-strategy', 'strategyAdvice']
    ];
    fields.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentPlain = String(el.value || '').trim();
      const originalPlain = String(el.dataset.originalPlain || '').trim();
      if (currentPlain && currentPlain !== originalPlain) {
        data[key] = editableTextToHTML(applyFinalOutputCleanups(currentPlain));
      } else {
        data[key] = applyFinalOutputCleanups(data[key]);
      }
    });
    cleanupGeneratedPackage(data);
  }

  function buildUserAnswersLog() {
    const lines = [
      'Application Appropriation — User Answers Log',
      '---',
      `Applicant: ${appState.userInfo.name || ''}`,
      `Target Role: ${appState.userInfo.role || ''}`,
      `Role Family: ${appState.rolePolicy?.label || appState.roleKey || 'general'}`,
      '',
      '=== Original Intake ===',
      'Highlights:',
      appState.inputs.highlights || '[None supplied]',
      '',
      'Career Story / Context:',
      appState.inputs.story || '[None supplied]',
      '',
      'Constraints / Extras:',
      appState.inputs.constraints || '[None supplied]',
      '',
      'Resume Edits:',
      reviewEditsText(),
      '',
      '=== Targeted Follow-Up Answers ===',
      ...(appState.collectedFollowUpAnswers && appState.collectedFollowUpAnswers.length ? appState.collectedFollowUpAnswers : ['[None captured]']),
      '',
      '=== Final Details ===',
      appState.finalDetails || '[None supplied]',
      '',
      '=== Missing Info Repair Log ===',
      ...(appState.missingFixes && appState.missingFixes.length ? appState.missingFixes : ['[None captured]'])
    ];
    return lines.join('\n');
  }

  function renderExportPanel() {
    const data = appState.lastGeneratedData;
    const atsScore = calculateATSScore();
    const smartName = `${(data.meta?.applicantName || 'Applicant').replace(/\s+/g, '_')}_${(data.meta?.companyName || 'Company').replace(/\s+/g, '_')}_Application.zip`;
    document.getElementById('panel-preview-export').innerHTML = `
      <h3 style="font-size:1.2rem; margin-bottom:8px;">Review & Download</h3>
      <p class="muted" style="margin-bottom:14px;">Make any final edits below. Edits are saved into the ZIP when you download.</p>
      <div class="notice notice-warning" style="margin-bottom:14px; text-align:left;">
        <div style="font-weight:800; margin-bottom:6px; color:#fde68a;">Final review checkpoint</div>
        <div>Verify credentials, dates, flight hours, ratings, employer facts, and any user-added claims before using the documents. Anything added during résumé tune-up will be treated as user-confirmed facts in the downloaded package. This warning stays in the app screen and is not inserted into the résumé or cover letter.</div>
      </div>
      <div class="notice notice-good" style="margin-bottom:16px; text-align:left;">
        <div style="font-weight:800; margin-bottom:8px;">ATS Match Estimate</div>
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="width:160px; height:16px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden;"><div style="height:100%; width:${atsScore}%; background:#39ff14;"></div></div>
          <div style="font-weight:700;">${atsScore}%</div>
        </div>
        <div class="muted" style="margin-top:6px;">Estimate based on detected priority keywords in the tailored résumé.</div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px; text-align:left; margin-bottom:16px;">
        <div class="banner">
          <h3 style="margin-top:0;">Tailored Résumé</h3>
          <textarea id="export-edit-tailored" class="field-input" style="min-height:280px; font-family:monospace; white-space:pre; overflow:auto;"></textarea>
        </div>
        <div class="banner">
          <h3 style="margin-top:0;">Cover Letter</h3>
          <textarea id="export-edit-cover" class="field-input" style="min-height:280px; font-family:monospace; white-space:pre; overflow:auto;"></textarea>
        </div>
        <div class="banner">
          <h3 style="margin-top:0;">ATS Résumé</h3>
          <textarea id="export-edit-ats" class="field-input" style="min-height:220px; font-family:monospace; white-space:pre; overflow:auto;"></textarea>
        </div>
        <div class="banner">
          <h3 style="margin-top:0;">Interview Prep / Strategy</h3>
          <textarea id="export-edit-strategy" class="field-input" style="min-height:220px; font-family:monospace; white-space:pre; overflow:auto;"></textarea>
        </div>
      </div>
      <button id="tp-btn-zip" class="btn-primary" style="margin-bottom: 12px;" type="button">📦 Download ZIP</button>
      <p class="muted" style="margin-bottom:16px;">ZIP contains two folders: <strong>User_Package</strong> and <strong>Full_Audit_Package</strong>. Filename: <strong id="smart-filename-preview" style="font-family: monospace;">${escapeHtml(smartName)}</strong></p>
      <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
        <button id="tp-btn-pdf" class="btn-secondary" type="button">Save Active Section as PDF</button>
      </div>
    `;
    setReviewEditorValue('export-edit-tailored', data.resumeTailored);
    setReviewEditorValue('export-edit-cover', data.coverLetter);
    setReviewEditorValue('export-edit-ats', data.resumeATS);
    setReviewEditorValue('export-edit-strategy', data.strategyAdvice);
    document.getElementById('tp-btn-pdf').addEventListener('click', exportCurrentTabToPrint);
    document.getElementById('tp-btn-zip').addEventListener('click', downloadUserPackageZip);
  }

  function renderOutput() {
    const data = appState.lastGeneratedData;
    if (!data) return;
    const unresolved = Array.isArray(data.missingInfo) ? data.missingInfo.filter(Boolean) : [];
    if (unresolved.length) {
      document.getElementById('missingList').innerHTML = unresolved.map(i => `<li>${escapeHtml(i)}</li>`).join('');
      document.getElementById('missingWrap').classList.remove('hidden');
    } else {
      document.getElementById('missingWrap').classList.add('hidden');
    }
    const map = { researchBrief: data.researchBrief, roleSummary: data.roleSummary, gapAnalysis: data.gapAnalysis, edgeQuestions: data.edgeQuestions, verifiedRequirements: data.verifiedRequirements, sourceAudit: data.sourceAudit, resumeATS: data.resumeATS, resumeTailored: data.resumeTailored, coverLetter: data.coverLetter, keywordAddendum: data.keywordAddendum, strategyAdvice: data.strategyAdvice };
    if (appState.activeTab === 'previewExport') {
      renderExportPanel();
      const exportPanel = document.getElementById('panel-preview-export');
      exportPanel.classList.remove('hidden');
      exportPanel.style.display = 'block';
      outputEl.style.display = 'none';
      tabToolbar.classList.add('hidden');
      return;
    }
    const exportPanel = document.getElementById('panel-preview-export');
    exportPanel.classList.add('hidden');
    exportPanel.style.display = 'none';
    outputEl.style.display = 'block';
    tabToolbar.classList.remove('hidden');
    tabToolbar.innerHTML = '';
    if (appState.activeTab === 'coverLetter') {
      tabToolbar.innerHTML = `
        <button class="btn-secondary" data-rewrite-tab="coverLetter" data-rewrite="Make it executive-level, leadership-forward, highly professional, concise, and fact-bound.">Executive / Leadership</button>
        <button class="btn-secondary" data-rewrite-tab="coverLetter" data-rewrite="Make it warm, polished, and approachable while staying professional and truthful.">Warm / Professional</button>
        <button class="btn-secondary" data-rewrite-tab="coverLetter" data-rewrite="Make it highly concise, direct, and punchy.">Punchy & Concise</button>
        <button class="btn-secondary" data-rewrite-tab="coverLetter" data-rewrite="Make it highly formal and traditional.">Formal</button>`;
    }
    outputEl.innerHTML = map[appState.activeTab] || '<p>No content.</p>';
  }


  async function rewriteFeature(tab, instruction) {
    if (!appState.lastGeneratedData || !appState.lastGeneratedData[tab]) return;
    outputLoader.style.display = 'block';
    try {
      const payload = { prompt: `Rewrite the following HTML content according to this instruction: "${instruction}". Keep facts intact, keep HTML valid, and do not invent anything.\n\n${appState.lastGeneratedData[tab]}`, systemPrompt: 'You are a factual professional application writer. Return valid HTML only.', temperature: 0.15, maxOutputTokens: 4096 };
      const { json } = await fetchWithModelFallback(selectedModel(), payload, 'simple');
      appState.lastGeneratedData[tab] = normalizeHTML(json?.text || appState.lastGeneratedData[tab]);
      renderOutput();
    } catch (_) { alert('Rewrite failed.'); } finally { outputLoader.style.display = 'none'; }
  }


  function buildExportMeta() {
    const meta = appState.lastGeneratedData?.meta || {};
    return { applicantName: meta.applicantName || appState.userInfo.name || 'Applicant', companyName: meta.companyName || extractCompanyName(appState.inputs.jd) || 'Company', role: meta.role || appState.userInfo.role || 'Target Role', generatedAt: new Date().toLocaleString() };
  }


  function wrapHTML(content, title) {
    const meta = buildExportMeta();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta name="viewport" content="width=device-width, initial-scale=1" /><style>:root { --ink:#111827; --muted:#475569; --line:#cbd5e1; --soft:#f8fafc; --accent:#0f172a; }body { font-family: 'Inter', Helvetica, Arial, sans-serif; line-height: 1.58; color: var(--ink); max-width: 860px; margin: 0 auto; padding: 42px; background: #fff; }.doc-shell { border: 1px solid #e2e8f0; border-radius: 18px; padding: 34px 36px; box-shadow: 0 10px 30px rgba(15,23,42,0.06); }.doc-header { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; padding-bottom:18px; border-bottom:2px solid var(--accent); margin-bottom:24px; }.doc-kicker { font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }.doc-title { font-size:30px; line-height:1.15; margin:0; color:#020617; }.doc-meta { min-width: 220px; border:1px solid var(--line); border-radius:12px; background:var(--soft); padding:12px 14px; font-size:12.5px; }.doc-meta strong { display:inline-block; width:84px; color:#0f172a; }h1 { font-size: 26px; margin: 0 0 18px; color: #0f172a; }h2 { margin-top: 24px; font-size: 18px; border-bottom: 1px solid var(--line); padding-bottom: 6px; color: #0f172a; }h3 { font-size: 15px; font-weight: 700; margin-bottom: 6px; margin-top: 16px; color: #0f172a; }p { margin: 8px 0; font-size: 14px; }ul, ol { margin: 8px 0 12px; padding-left: 22px; }li { margin-bottom: 6px; font-size: 14px; }table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }th, td { border: 1px solid var(--line); padding: 9px 10px; vertical-align: top; }th { background: #f8fafc; text-align: left; }blockquote { margin: 14px 0; padding: 10px 14px; border-left: 4px solid #94a3b8; background: #f8fafc; }hr { border: none; border-top: 1px solid var(--line); margin: 20px 0; }a { color: #1d4ed8; text-decoration: none; font-weight: 500; }.doc-footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }@page { size: letter; margin: 0.65in; }</style></head><body><div class="doc-shell"><div class="doc-header"><div><div class="doc-kicker">Application Appropriation Package</div><h1 class="doc-title">${escapeHtml(title)}</h1></div><div class="doc-meta"><div><strong>Applicant</strong>${escapeHtml(meta.applicantName)}</div><div><strong>Company</strong>${escapeHtml(meta.companyName)}</div><div><strong>Role</strong>${escapeHtml(meta.role)}</div><div><strong>Generated</strong>${escapeHtml(meta.generatedAt)}</div></div></div>${content}<div class="doc-footer">Prepared from structured application inputs. Review all facts before sending.</div></div></body></html>`;
  }


  function exportCurrentTabToPrint() {
    if (!appState.lastGeneratedData) return alert('Generate data first.');
    const titleMap = { researchBrief: 'Research Brief', roleSummary: 'Criteria Map', gapAnalysis: 'Gap Analysis', edgeQuestions: 'Edge Questions', verifiedRequirements: 'Verified Requirements', sourceAudit: 'Source Audit', resumeATS: 'ATS Resume', resumeTailored: 'Tailored Resume', coverLetter: 'Cover Letter', keywordAddendum: 'Keyword Addendum', strategyAdvice: 'Strategy & Edge' };
    const contentMap = { researchBrief: appState.lastGeneratedData.researchBrief, roleSummary: appState.lastGeneratedData.roleSummary, gapAnalysis: appState.lastGeneratedData.gapAnalysis, edgeQuestions: appState.lastGeneratedData.edgeQuestions, verifiedRequirements: appState.lastGeneratedData.verifiedRequirements, sourceAudit: appState.lastGeneratedData.sourceAudit, resumeATS: appState.lastGeneratedData.resumeATS, resumeTailored: appState.lastGeneratedData.resumeTailored, coverLetter: appState.lastGeneratedData.coverLetter, keywordAddendum: appState.lastGeneratedData.keywordAddendum, strategyAdvice: appState.lastGeneratedData.strategyAdvice };
    const title = titleMap[appState.activeTab] || 'Application Export';
    const printable = wrapHTML(contentMap[appState.activeTab] || outputEl.innerHTML, title);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
    if (!printWindow) return alert('Pop-up blocked. Please allow pop-ups for printing.');
    printWindow.document.open(); printWindow.document.write(printable); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 250);
  }


  async function copyHTMLText(html, buttonEl, defaultLabel = 'Copy Text') {
    const text = plainTextFromHTML(html);
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const textArea = document.createElement('textarea'); textArea.value = text; document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea);
      }
      const original = buttonEl.textContent; buttonEl.textContent = 'Copied!'; setTimeout(() => buttonEl.textContent = original || defaultLabel, 1600);
    } catch (_) { alert('Copy failed.'); }
  }


  async function downloadUserPackageZip() {
    if (!appState.lastGeneratedData) return alert('Generate data first.');
    syncExportReviewEdits();

    const zip = new JSZip();
    const meta = appState.lastGeneratedData.meta || {};
    const applicant = (meta.applicantName || appState.userInfo.name || 'Applicant').replace(/\s+/g, '_');
    const company = (meta.companyName || extractCompanyName(appState.inputs.jd) || 'Company').replace(/\s+/g, '_');
    const baseName = `${applicant}_${company}`;
    const data = appState.lastGeneratedData;
    const generatedAt = new Date().toISOString();
    const userFolder = zip.folder('User_Package');
    const auditFolder = zip.folder('Full_Audit_Package');

    const userFiles = [
      ['Tailored_Resume', data.resumeTailored],
      ['ATS_Resume', data.resumeATS],
      ['Cover_Letter', data.coverLetter],
      ['Interview_Prep_Strategy', data.strategyAdvice]
    ];
    userFiles.forEach(([label, content]) => {
      userFolder.file(`${baseName}_${label}.html`, wrapHTML(content || '<p>No content.</p>', label.replace(/_/g, ' ')));
    });

    const auditFiles = [
      ['Research_Brief', data.researchBrief],
      ['Criteria_Map', data.roleSummary],
      ['Gap_Analysis', data.gapAnalysis],
      ['Verified_Requirements', data.verifiedRequirements],
      ['Source_Audit', data.sourceAudit],
      ['Edge_Questions', data.edgeQuestions],
      ['ATS_Resume', data.resumeATS],
      ['Tailored_Resume', data.resumeTailored],
      ['Cover_Letter', data.coverLetter],
      ['Keyword_Addendum', data.keywordAddendum],
      ['Strategy', data.strategyAdvice]
    ];
    auditFiles.forEach(([label, content]) => {
      auditFolder.file(`${baseName}_${label}.html`, wrapHTML(content || '<p>No content.</p>', label.replace(/_/g, ' ')));
    });

    const combined = auditFiles.map(([label, content]) => `<h2>${escapeHtml(label.replace(/_/g, ' '))}</h2>${content || '<p>No content.</p>'}`).join('');
    auditFolder.file(`${baseName}_Full_Package.html`, wrapHTML(combined, 'Full Application Package'));

    const originalResume = appState.inputs.resume || '';
    const jobDescription = appState.inputs.jd || '';
    const userInputs = {
      applicantName: meta.applicantName || appState.userInfo.name || '',
      companyName: meta.companyName || extractCompanyName(appState.inputs.jd) || '',
      targetRole: meta.role || appState.userInfo.role || '',
      roleKey: appState.roleKey || 'general',
      generatedAt,
      inputsIncluded: {
        originalResume: Boolean(originalResume),
        jobDescription: Boolean(jobDescription),
        highlights: Boolean(appState.inputs.highlights),
        careerStory: Boolean(appState.inputs.story),
        constraints: Boolean(appState.inputs.constraints),
        finalDetails: Boolean(appState.finalDetails)
      },
      resumeEdits: appState.resumeReview?.edits || {},
      highlights: appState.inputs.highlights || '',
      careerStory: appState.inputs.story || '',
      constraints: appState.inputs.constraints || '',
      followUpAnswers: appState.collectedFollowUpAnswers || [],
      missingInfoRepairLog: appState.missingFixes || [],
      remainingMissingInfo: data.missingInfo || [],
      atsKeywords: appState.reviewData?.atsKeywords || [],
      selectionProcess: appState.reviewData?.selectionProcess || [],
      groundingSources: appState.lastGroundingSources || []
    };

    auditFolder.file(`${baseName}_Original_Resume.txt`, originalResume || 'No original resume text captured.');
    auditFolder.file(`${baseName}_Job_Description.txt`, jobDescription || 'No job description text captured.');
    auditFolder.file(`${baseName}_Metadata.json`, JSON.stringify(userInputs, null, 2));
    auditFolder.file(`${baseName}_User_Answers_Log.txt`, buildUserAnswersLog());

    const copyPaste = [
      'Application Appropriation Package',
      `Applicant: ${meta.applicantName || appState.userInfo.name || 'Unknown'}`,
      `Company: ${meta.companyName || extractCompanyName(appState.inputs.jd) || 'Unknown'}`,
      `Role: ${meta.role || appState.userInfo.role || 'Unknown'}`,
      `Generated: ${generatedAt}`,
      '',
      '=== Tailored Resume ===', plainTextFromHTML(data.resumeTailored),
      '',
      '=== ATS Resume ===', plainTextFromHTML(data.resumeATS),
      '',
      '=== Cover Letter ===', plainTextFromHTML(data.coverLetter),
      '',
      '=== Interview Prep / Strategy ===', plainTextFromHTML(data.strategyAdvice)
    ].join('\n');
    userFolder.file('Application_CopyPaste.txt', copyPaste);

    const tocLines = [
      'Application Appropriation ZIP',
      '---',
      'User_Package/',
      ...userFiles.map(([label]) => `  ${baseName}_${label}.html — ${label.replace(/_/g, ' ')}`),
      '  Application_CopyPaste.txt — Text-only copy of the user-facing package',
      '',
      'Full_Audit_Package/',
      ...auditFiles.map(([label]) => `  ${baseName}_${label}.html — ${label.replace(/_/g, ' ')}`),
      `  ${baseName}_Full_Package.html — Combined audit package`,
      `  ${baseName}_Original_Resume.txt — Source resume text entered by user`,
      `  ${baseName}_Job_Description.txt — Source job description text entered by user`,
      `  ${baseName}_Metadata.json — Applicant/job metadata, inputs summary, follow-up answers, missing-info log, keyword and source metadata`,
      `  ${baseName}_User_Answers_Log.txt — Exact intake, follow-up, final-detail, and missing-info answers captured by the app`
    ];
    zip.file('TOC.txt', tocLines.join('\n'));
    zip.file('README.txt', [
      'Application Package ZIP',
      '',
      'User_Package contains the files a normal applicant is most likely to use.',
      'Full_Audit_Package contains source inputs, generated analysis, metadata, and answer logs for review/debugging.',
      'Open the HTML files in any browser.'
    ].join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${baseName}_Application.zip`);
  }

  async function handleNext(actionType = 'send') {
    if (!appState.isAwaitingInput || appState.isGenerating) return;
    if (actionType === 'skipAll' && appState.currentPhase === 'followups') {
      while (appState.currentFollowUpSubIndex < appState.followUpQuestionsList.length) {
        const question = appState.followUpQuestionsList[appState.currentFollowUpSubIndex];
        appState.collectedFollowUpAnswers.push(`Question: ${question}\nAnswer: [SKIPPED]`);
        appState.currentFollowUpSubIndex += 1;
      }
      return renderCurrentQuestion();
    }
    if (actionType === 'skip') return handleSkipCurrent();
    if (appState.currentPhase === 'wizard' && wizardSteps[appState.wizardStepIndex].type === 'profile') {
      const name = nameIn.value.trim(), role = roleIn.value.trim();
      if (!name || !role) return alert('Please enter both name and target role.');
      appState.userInfo.name = name; appState.userInfo.role = role; appState.roleKey = detectRoleKey(role); appState.rolePolicy = ROLE_POLICIES[appState.roleKey] || ROLE_POLICIES.general; appState.wizardStepIndex += 1; return renderCurrentQuestion();
    }
    const value = chatInput.value.trim();
    if (!value) return alert('Please answer the current question or use Skip.');
    if (appState.currentPhase === 'resumeReview') { chatInput.value = ''; return handleResumeReviewInput(value); }
    if (appState.currentPhase === 'followups') { const question = appState.followUpQuestionsList[appState.currentFollowUpSubIndex]; appState.collectedFollowUpAnswers.push(`Question: ${question}\nAnswer: ${value}`); chatInput.value = ''; appState.currentFollowUpSubIndex += 1; return renderCurrentQuestion(); }
    if (appState.currentPhase === 'missingInfo') { const issue = appState.missingQueue[appState.currentMissingIndex]; appState.missingFixes.push(`Issue: ${issue}\nResolution: ${value}`); chatInput.value = ''; appState.currentMissingIndex += 1; return renderCurrentQuestion(); }
    if (appState.currentPhase === 'finalDetails') { appState.finalDetails = value; chatInput.value = ''; return beginMissingQueueAfterFinalDetails(); }
    if (appState.currentPhase === 'wizard') {
      const step = wizardSteps[appState.wizardStepIndex];
      appState.inputs[step.key] = value; chatInput.value = '';
      if (step.key === 'resume') { appState.currentPhase = 'resumeReview'; appState.resumeReview.active = true; appState.resumeReview.phase = 'askChange'; return renderCurrentQuestion(); }
      if (step.key === 'constraints') return runAnalysisPhase();
      appState.wizardStepIndex += 1; return renderCurrentQuestion();
    }
  }


  function handleBack() {
    if (appState.isGenerating) return;
    if (appState.currentPhase === 'followups' && appState.currentFollowUpSubIndex > 0) { appState.currentFollowUpSubIndex -= 1; appState.collectedFollowUpAnswers.pop(); return renderCurrentQuestion(); }
    if (appState.currentPhase === 'wizard' && appState.wizardStepIndex > 0) { appState.wizardStepIndex -= 1; return renderCurrentQuestion(); }
  }


  function handleSendClick(e) {
    if (e && e.preventDefault) e.preventDefault();
    return handleNext('send');
  }

  btnSend.addEventListener('click', handleSendClick);
  btnSkip.addEventListener('click', () => handleNext('skip'));
  btnSkipAll.addEventListener('click', () => handleNext('skipAll'));
  btnBack.addEventListener('click', handleBack);
  document.getElementById('continueToQuestionsBtn').addEventListener('click', returnToQuestions);
  document.getElementById('resetBtn').addEventListener('click', () => { if (confirm('Start over?')) location.reload(); });
  if (copyBtn) copyBtn.addEventListener('click', () => copyHTMLText(outputEl.innerHTML, copyBtn));
  if (copyReviewBtn) copyReviewBtn.addEventListener('click', () => copyHTMLText(reviewOutput.innerHTML, copyReviewBtn, 'Copy Section'));  
  [nameIn, roleIn].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleNext('send'); } }));
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNext('send'); } });
  tabToolbar.addEventListener('click', e => { const btn = e.target.closest('[data-rewrite-tab]'); if (!btn) return; rewriteFeature(btn.dataset.rewriteTab, btn.dataset.rewrite || ''); });
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootApp, { once: true });
  } else {
    bootApp();
  }
  document.getElementById('exportBtn').addEventListener('click', () => {
    // Activate the export tab programmatically
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('tab-btn-active'));
    appState.activeTab = 'previewExport';
    renderExportPanel();
    const exportPanel = document.getElementById('panel-preview-export');
    exportPanel.classList.remove('hidden');
    exportPanel.style.display = 'block';
    document.getElementById('output').style.display = 'none';
    document.getElementById('tab-toolbar').classList.add('hidden');
  });

  try { window.handleNext = handleNext; window.handleSendClick = handleSendClick; } catch (_) {}
