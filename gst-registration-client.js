(function () {
  'use strict';

  const ROUTES = [
    '/gst-registration',
    '/gst-registration/apply',
    '/gst-registration/documents',
    '/gst-registration/review',
    '/gst-registration/submit',
    '/gst-registration/status',
    '/gst-registration/clarifications',
    '/gst-registration/success',
  ];

  const state = {
    businessId: localStorage.getItem('hisaab_gst_business_id') || 'biz-default-owner',
    applicationId: localStorage.getItem('hisaab_gst_application_id') || null,
    authToken: localStorage.getItem('hisaab_gst_auth_token') || null,
    authenticatedEmail: localStorage.getItem('hisaab_gst_auth_email') || null,
    authMode: 'login',
    csrfToken: null,
    currentApp: null,
    activeClarificationId: null,
    latestClaudeAuditId: null,
    workspaceStarted: Boolean(localStorage.getItem('hisaab_gst_workspace_started')),
  };

  function openConversationWorkspace({ openUploadDrawer = false } = {}) {
    state.workspaceStarted = true;
    localStorage.setItem('hisaab_gst_workspace_started', '1');
    const welcomeEl = document.getElementById('aiWelcomeScreen');
    const workspaceEl = document.getElementById('aiConversationWorkspace');
    const uploadDrawerEl = document.getElementById('aiDocUploadDrawer');
    const activeQuestionCard = document.getElementById('aiActiveQuestionCard');
    if (welcomeEl) welcomeEl.classList.add('hidden');
    if (workspaceEl) workspaceEl.classList.remove('hidden');
    if (activeQuestionCard) activeQuestionCard.classList.remove('hidden');
    if (uploadDrawerEl) {
      if (openUploadDrawer) uploadDrawerEl.classList.remove('hidden');
      else uploadDrawerEl.classList.add('hidden');
    }
  }

  function showAlert(message, type = 'info') {
    const box = document.getElementById('globalAlertBox');
    const txt = document.getElementById('globalAlertText');
    if (!box || !txt) return;
    box.className = `alert alert-${type} rounded-2xl text-xs`;
    txt.textContent = message;
    box.classList.remove('hidden');
  }

  function showAuthModalFeedback(message, type = 'info') {
    const box = document.getElementById('authModalFeedback');
    const txt = document.getElementById('authModalFeedbackText');
    if (!box || !txt) return;
    box.className = `alert alert-${type} text-xs py-2 rounded-xl`;
    txt.textContent = message;
    box.classList.remove('hidden');
  }

  function updateAuthHeaderUi(authenticated, email) {
    const dot = document.getElementById('authStatusDot');
    const label = document.getElementById('authUserEmailLabel');
    const logoutBtn = document.getElementById('authLogoutBtn');
    if (authenticated && email) {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-success';
      if (label) label.textContent = email;
      if (logoutBtn) logoutBtn.classList.remove('hidden');
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-warning';
      if (label) label.textContent = 'Login / Sign Up';
      if (logoutBtn) logoutBtn.classList.add('hidden');
    }
  }

  function openAuthModal() {
    if (window.location.search.includes('noauthmodal=1')) return;
    const modal = document.getElementById('gstAuthModal');
    if (modal && typeof modal.showModal === 'function' && !modal.open) {
      modal.showModal();
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById('gstAuthModal');
    if (modal && typeof modal.close === 'function' && modal.open) {
      modal.close();
    }
  }

  async function apiRequest(path, options = {}) {
    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
        'x-hisaab-business-id': state.businessId,
      },
      options.headers || {}
    );
    if (state.authToken) {
      headers.Authorization = `Bearer ${state.authToken}`;
    }
    if (state.csrfToken) {
      headers['x-csrf-token'] = state.csrfToken;
    }
    const res = await fetch(path, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && !path.includes('/auth/')) {
        updateAuthHeaderUi(false, null);
        openAuthModal();
      }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function getSelectedIndustries() {
    const checked = Array.from(document.querySelectorAll('.industry-chk:checked')).map((el) => el.value);
    return checked.length > 0 ? checked : ['General services'];
  }

  function syncDynamicFormFields() {
    const constitution = document.getElementById('eligConstitution')?.value || 'Sole Proprietorship';
    const category = document.getElementById('eligCategory')?.value || 'Normal Taxpayer';

    const cinField = document.getElementById('dynamicCinLlpinField');
    const cinLabel = document.getElementById('dynamicCinLlpinLabel');
    if (cinField) {
      const needsRegNo = [
        'Limited Liability Partnership (LLP)',
        'Private Limited Company',
        'Public Limited Company',
        'One Person Company (OPC)',
        'Trust',
        'Society',
        'NGO / Section 8 / Other Organization',
      ].includes(constitution);
      if (needsRegNo) {
        cinField.classList.remove('hidden');
        if (cinLabel) {
          cinLabel.textContent =
            constitution === 'Limited Liability Partnership (LLP)'
              ? 'MCA LLP Identification Number (LLPIN)'
              : constitution.includes('Company')
              ? 'MCA Corporate Identity Number (CIN)'
              : 'Trust / Society / NGO Registration Number';
        }
      } else {
        cinField.classList.add('hidden');
      }
    }

    const sezField = document.getElementById('dynamicSezField');
    if (sezField) {
      if (category === 'SEZ Unit' || category === 'SEZ Developer') {
        sezField.classList.remove('hidden');
      } else {
        sezField.classList.add('hidden');
      }
    }

    const casualField = document.getElementById('dynamicCasualTaxField');
    if (casualField) {
      if (category === 'Casual Taxable Person' || category === 'Non-Resident Taxable Person') {
        casualField.classList.remove('hidden');
      } else {
        casualField.classList.add('hidden');
      }
    }
  }

  function renderUnauthenticatedAssistantPreview(envSec) {
    updateUiWithApplication({
      id: 'draft-preview',
      status: 'Draft',
      hisaabPreparationStatus: 'Sign in to auto-save & extract documents',
      officialPortalStatus: 'Not submitted to gst.gov.in',
      environmentSecurity: envSec || { realIdentityUploadsBlocked: true },
      businessDetails: {
        constitution: 'Sole Proprietorship',
        registrationCategory: 'Normal Taxpayer',
        tradeName: '',
        supplyType: 'Services',
      },
      completionProgress: {
        completedMandatoryCount: 0,
        totalMandatoryCount: 16,
        percentage: 0,
        isComplete: false,
      },
      conversationHistory: [
        {
          id: 'welcome-preview',
          role: 'assistant',
          text: 'Hello! Tell me about your business or upload a document (such as your Udyam certificate, PAN card, or business address proof). I will prepare your GST application one step at a time.',
          createdAt: new Date().toISOString(),
        },
      ],
      currentQuestion: {
        questionId: 'q-constitution',
        fieldKey: 'constitution',
        questionType: 'QUICK_SELECT_OR_TEXT',
        isSensitiveVaultField: false,
        prompt: 'What kind of business are you registering?',
        whyRequired: 'Determines your PAN 4th-character validation rule, promoter requirements, and constitution proof in Form GST REG-01.',
        quickOptions: [
          { label: 'Sole proprietorship', fieldKey: 'constitution', value: 'Sole Proprietorship' },
          { label: 'Partnership', fieldKey: 'constitution', value: 'Partnership Firm' },
          { label: 'LLP', fieldKey: 'constitution', value: 'Limited Liability Partnership (LLP)' },
          { label: 'Company', fieldKey: 'constitution', value: 'Private Limited Company' },
          { label: 'Other', fieldKey: 'constitution', value: 'One Person Company (OPC)' },
        ],
      },
      fieldRegistry: [
        { fieldKey: 'constitution', label: 'Business Constitution', displayValue: 'Pending selection', source: 'Pending', confidence: null, populated: false, ownerConfirmed: false },
        { fieldKey: 'registrationCategory', label: 'GST Taxpayer Category', displayValue: 'Normal Taxpayer', source: 'Default', confidence: null, populated: true, ownerConfirmed: false },
        { fieldKey: 'legalName', label: 'Legal Name (As per PAN)', displayValue: 'Pending extraction or answer', source: 'Pending', confidence: null, populated: false, ownerConfirmed: false },
        { fieldKey: 'tradeName', label: 'Trade Name of Business', displayValue: 'Pending extraction or answer', source: 'Pending', confidence: null, populated: false, ownerConfirmed: false },
        { fieldKey: 'pan', label: 'Business / Proprietor PAN', displayValue: 'Protected · Enter in Secure Input', source: 'Secure Input Required', confidence: null, populated: false, ownerConfirmed: false },
        { fieldKey: 'stateAndDistrict', label: 'Principal State & District', displayValue: 'Pending selection', source: 'Pending', confidence: null, populated: false, ownerConfirmed: false },
        { fieldKey: 'principalPlaceAddress', label: 'Principal Place Address & PIN', displayValue: 'Pending extraction or answer', source: 'Pending', confidence: null, populated: false, ownerConfirmed: false },
      ],
      fiveStageJourney: {
        currentStageNumber: 1,
        currentStageId: 'stage_1_business_intro',
        currentStageTitle: 'About your business',
        completedStagesCount: 0,
        totalStagesCount: 5,
        completionPercentage: 0,
        immediateNextActionText: 'What kind of business are you registering?',
        stages: [
          { stageNumber: 1, stageId: 'stage_1_business_intro', shortTitle: '1. About your business', route: '/gst-registration', status: 'IN_PROGRESS', progressText: '0/7 business details confirmed' },
          { stageNumber: 2, stageId: 'stage_2_ai_documents', shortTitle: '2. Documents', route: '/gst-registration', status: 'IN_PROGRESS', progressText: '0/3 documents verified' },
          { stageNumber: 3, stageId: 'stage_3_application_review', shortTitle: '3. Review', route: '/gst-registration/review', status: 'LOCKED', progressText: 'Complete required details first' },
          { stageNumber: 4, stageId: 'stage_4_official_submission', shortTitle: '4. Government submission', route: '/gst-registration/submit', status: 'LOCKED', progressText: 'Ready after owner approval' },
          { stageNumber: 5, stageId: 'stage_5_gstin_tracking', shortTitle: '5. GSTIN approval', route: '/gst-registration/status', status: 'LOCKED', progressText: 'Tracks ARN & GSTIN grant' },
        ],
      },
      dynamicDocumentChecklist: {
        constitution: 'Sole Proprietorship',
        premisesPossession: 'Rented / Leased',
        registrationCategory: 'Normal Taxpayer',
        applicableForm: 'GST REG-01',
        mandatoryPreFilingSatisfied: 0,
        mandatoryPreFilingTotal: 3,
        allPreFilingSatisfied: false,
        digilockerIntegration: {
          connected: false,
          status: 'NOT_CONNECTED',
          badgeLabel: 'Not connected',
          honestDisclosure: 'Optional DigiLocker (API Setu / MeriPehchaan) not configured — use AI document extraction or Encrypted Identity Vault.',
        },
        preFilingItems: [
          {
            id: 'doc_pan_business',
            title: 'PAN of Proprietor (Individual PAN — 4th char "P")',
            requiredBeforeReg01: true,
            satisfied: false,
            acceptedProofs: '10-character Individual PAN verified in Encrypted Identity Vault or extracted via AI',
            statutoryBasis: 'Section 25(6) CGST Act & Rule 8(1)',
            verificationMethod: 'Enter in Encrypted Identity Vault',
          },
          {
            id: 'doc_signatory_identity_and_photo',
            title: 'Promoter / Primary Signatory Photograph & Aadhaar OTP e-KYC',
            requiredBeforeReg01: true,
            satisfied: false,
            acceptedProofs: 'Passport-size photograph (JPEG ≤ 100 KB on gst.gov.in) + Mobile linked with Aadhaar for Section 25(6B)/(6C) OTP',
            statutoryBasis: 'CGST Rule 8(3) & Section 25(6B)/(6C)',
            verificationMethod: 'Configure in Encrypted Identity Vault',
          },
          {
            id: 'doc_constitution_sole_prop',
            title: 'Business Constitution Document (Exempt for Sole Proprietorship; Udyam Optional for AI Auto-Fill)',
            requiredBeforeReg01: false,
            satisfied: true,
            acceptedProofs: 'Sole Proprietorships do NOT require a Partnership Deed or COI on gst.gov.in. Udyam MSME Certificate is optional for AI auto-fill.',
            statutoryBasis: 'FORM GST REG-01 Part B Instruction',
            verificationMethod: 'Extracted via Anthropic Claude AI from Udyam Certificate',
          },
          {
            id: 'doc_premises_proof',
            title: 'Principal Place of Business Proof (Rented / Owned / Home-Based NOC)',
            requiredBeforeReg01: true,
            satisfied: false,
            acceptedProofs: 'Rented: Rent Agreement + Landlord Electricity Bill/Tax Receipt. Home-Based/Family: Family NOC + Owner Electricity Bill.',
            statutoryBasis: 'FORM GST REG-01 Part B — Principal Place of Business',
            verificationMethod: 'Extract via AI or confirm in AI Assistant',
          },
        ],
        postRegistrationRule10AItems: [
          {
            id: 'doc_bank_rule10a',
            title: 'Bank Account Proof (Cancelled Cheque / Passbook) — Post-Registration Under CGST Rule 10A',
            requiredBeforeReg01: false,
            acceptedProofs: 'Cancelled cheque or Bank Passbook first page due within 30 days of GSTIN grant (or before 1st GSTR-1/IFF). Two months of bank statements are NOT required.',
            statutoryBasis: 'CGST Rule 10A (CBIC Notification No. 31/2019 & 38/2023 – Central Tax)',
            verificationMethod: 'Not required before REG-01 submission',
          },
        ],
      },
      rule14AAssessment: {
        isEligible: true,
        optedIn: true,
        estimatedMonthlyB2bOutputTaxInr: 37500,
        criteriaChecklist: [
          { label: 'Normal Taxpayer filing FORM GST REG-01', passed: true },
          { label: 'Monthly B2B output tax ≤ ₹2,50,000 (Current: ₹37,500/mo)', passed: true },
          { label: 'Mandatory Aadhaar OTP e-KYC for Primary Signatory & Promoter', passed: true },
          { label: 'No existing Rule 14A registration on the same PAN in the same State/UT', passed: true },
        ],
      },
      rule10AWorkflow: {
        status: 'DEFERRED_TO_POST_GRANT_RULE_10A',
        statusBadge: 'Deferred to Post-GSTIN Grant (Rule 10A Compliant)',
        deadlineRule: 'Within 30 days from grant of GSTIN (FORM GST REG-06) OR before filing outward supplies in FORM GSTR-1 / IFF, whichever is earlier.',
      },
      preReviewReadiness: {
        readyForFinalReview: false,
        outstandingQuestionsCount: 14,
        missingPreFilingDocumentsCount: 3,
        outstandingQuestions: [
          { label: 'Business Constitution', actionHint: 'Confirm extracted candidate (1 tap)', currentStatus: 'UNCONFIRMED_EXTRACTION' },
          { label: 'GST Taxpayer Category', actionHint: 'Confirm extracted candidate (1 tap)', currentStatus: 'UNCONFIRMED_EXTRACTION' },
          { label: 'Legal Name (As per PAN)', actionHint: 'Extract from Udyam/PAN or answer in AI Assistant', currentStatus: 'MISSING' },
          { label: 'Business / Proprietor PAN', actionHint: 'Enter in Encrypted Identity Vault', currentStatus: 'MISSING' },
        ],
        missingPreFilingDocuments: [
          { title: 'PAN of Proprietor (Individual PAN)', statutoryBasis: 'Section 25(6) CGST Act & Rule 8(1)' },
          { title: 'Promoter / Primary Signatory Photograph & Aadhaar OTP e-KYC', statutoryBasis: 'CGST Rule 8(3) & Section 25(6B)/(6C)' },
          { title: 'Principal Place of Business Proof', statutoryBasis: 'FORM GST REG-01 Part B (CGST Rule 8)' },
        ],
      },
      validation: { blockerCount: 14, errors: [], warnings: [], missingDocuments: [] },
    });
  }

  async function resumeOrInitBusinessApplication() {
    if (state.applicationId) {
      try {
        const app = await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}`, {
          method: 'GET',
        });
        populateFormInputsFromApplication(app);
        updateUiWithApplication(app);
        return app;
      } catch (_) {
        // Fallback to listing business applications
      }
    }
    try {
      const listRes = await apiRequest(
        `/api/gst-registration/applications?businessId=${encodeURIComponent(state.businessId)}`,
        { method: 'GET' }
      );
      if (Array.isArray(listRes.applications) && listRes.applications.length > 0) {
        const latestApp = listRes.applications[listRes.applications.length - 1];
        state.applicationId = latestApp.id;
        localStorage.setItem('hisaab_gst_application_id', latestApp.id);
        populateFormInputsFromApplication(latestApp);
        updateUiWithApplication(latestApp);
        return latestApp;
      }
    } catch (_) {
      // ignore
    }
    return initOrResetUniversalDraft();
  }

  async function initSession() {
    try {
      const session = await apiRequest('/api/gst-registration/session', { method: 'GET' });
      if (!session.authenticated) {
        updateAuthHeaderUi(false, null);
        renderUnauthenticatedAssistantPreview(session.environmentSecurity);
        if (window.location.search.includes('auth=1')) {
          openAuthModal();
        }
        return;
      }
      state.csrfToken = session.csrfToken;
      state.businessId = session.businessId || state.businessId;
      state.authenticatedEmail = session.email || state.authenticatedEmail;
      localStorage.setItem('hisaab_gst_business_id', state.businessId);
      if (state.authenticatedEmail) {
        localStorage.setItem('hisaab_gst_auth_email', state.authenticatedEmail);
      }
      updateAuthHeaderUi(true, state.authenticatedEmail || '');
      await resumeOrInitBusinessApplication();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function initOrResetUniversalDraft() {
    const app = await apiRequest('/api/gst-registration/applications', {
      method: 'POST',
      body: JSON.stringify({
        businessId: state.businessId,
        applicationTitle: 'Universal GST Registration Application',
        businessDetails: {
          constitution: document.getElementById('eligConstitution')?.value || 'Sole Proprietorship',
          registrationCategory: document.getElementById('eligCategory')?.value || 'Normal Taxpayer',
          industryClassifications: getSelectedIndustries(),
          stateCode: document.getElementById('eligStateCode')?.value || '27',
          supplyType: document.getElementById('eligSupplyType')?.value || 'Services',
          natureOfPossession: document.getElementById('eligPossession')?.value || 'Rented / Leased',
          voluntaryRegistration: true,
        },
        people: [],
      }),
    });
    state.applicationId = app.id;
    localStorage.setItem('hisaab_gst_application_id', app.id);
    populateFormInputsFromApplication(app);
    updateUiWithApplication(app);
    return app;
  }

  function populateFormInputsFromApplication(app) {
    if (!app || !app.businessDetails) return;
    const bd = app.businessDetails;
    const addr = bd.principalPlaceAddress || {};
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && v !== undefined && v !== null) el.value = v;
    };
    const setChk = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(v);
    };

    setVal('eligConstitution', bd.constitution || 'Sole Proprietorship');
    setVal('eligCategory', bd.registrationCategory || 'Normal Taxpayer');
    setVal('eligStateCode', bd.stateCode || '27');
    setVal('eligSupplyType', bd.supplyType || 'Services');
    setVal('eligTurnover', bd.annualTurnoverInr || 0);
    setVal('eligPossession', bd.natureOfPossession || 'Rented / Leased');
    setChk('eligInternationalExport', bd.internationalSaasExport);
    setChk('eligInterstate', bd.interstateSupply);
    setChk('eligEcommerceSeller', bd.eCommerceSeller);
    setChk('eligVoluntary', bd.voluntaryRegistration !== false);

    if (Array.isArray(bd.industryClassifications) && bd.industryClassifications.length > 0) {
      document.querySelectorAll('.industry-chk').forEach((chk) => {
        chk.checked = bd.industryClassifications.includes(chk.value);
      });
    }

    setVal('regLegalName', bd.legalName || '');
    setVal('regTradeName', bd.tradeName || '');
    setVal('regUdyamNumber', bd.udyamRegistrationNumber || '');
    setVal('regCinOrLlpin', bd.cinOrLlpinOrRegNo || '');
    setVal('regSezApprovalNo', bd.sezApprovalNumber || '');
    setVal('regCasualEstimatedTax', bd.casualEstimatedTaxLiabilityInr || 0);
    setVal('regDistrict', bd.district || '');
    setVal('regReasonSelect', bd.reasonForRegistration || 'Voluntary Registration u/s 25(3)');
    setVal('regEmail', bd.applicantEmail || '');
    setVal('regCommencementDate', bd.commencementDate || '');
    setVal('regWard', bd.sectorCircleWard || '');

    setVal('regAddrBuilding', addr.buildingOrFlat || '');
    setVal('regAddrStreet', addr.localityOrStreet || '');
    setVal('regAddrCity', addr.city || '');
    setVal('regAddrPin', addr.pinCode || '');

    // Hydrate Step 1 Apple Guided Form inputs
    if (bd.legalName) setVal('rkFullNameInput', bd.legalName);
    else if (Array.isArray(app.people) && app.people[0]?.fullName) setVal('rkFullNameInput', app.people[0].fullName);
    if (bd.tradeName) setVal('rkTradeNameInput', bd.tradeName);
    const knownPan =
      (bd.pan && !String(bd.pan).includes('*') ? bd.pan : '') ||
      (Array.isArray(app.people) && app.people[0]?.pan && !String(app.people[0].pan).includes('*') ? app.people[0].pan : '');
    if (knownPan) {
      setVal('rkRightPanInput', knownPan);
      setVal('regBusinessPan', knownPan);
      setVal('regPersonPan', knownPan);
    }
    if (bd.applicantEmail) setVal('rkEmailInput', bd.applicantEmail);
    if (bd.applicantMobile && !String(bd.applicantMobile).includes('*')) setVal('rkMobileInput', bd.applicantMobile);
    if (bd.constitution) setVal('rkConstitutionSelect', bd.constitution);
    if (bd.stateCode) setVal('rkStateSelect', bd.stateCode);
    if (addr.pinCode) setVal('rkPincodeInput', addr.pinCode);
    const fullStreet = [addr.buildingOrFlat, addr.localityOrStreet].filter(Boolean).join(', ');
    if (fullStreet) setVal('rkAddressLine1Input', fullStreet);
    if (addr.city) setVal('rkCityInput', addr.city);
    if (bd.district) setVal('rkDistrictInput', bd.district);

    if (Array.isArray(bd.hsnSacCommodities) && bd.hsnSacCommodities[0]) {
      setVal('regHsnCode', bd.hsnSacCommodities[0].code || '998314');
      setVal('regHsnDesc', bd.hsnSacCommodities[0].description || '');
    }
    if (Array.isArray(app.people) && app.people[0]) {
      setVal('regPersonName', app.people[0].fullName || '');
      setVal('regPersonFather', app.people[0].fatherOrHusbandName || '');
      setVal('regPersonDesignation', app.people[0].designation || 'Proprietor');
      setVal('regPersonDin', app.people[0].dinOrLlpin || '');
    }
    syncDynamicFormFields();
  }

  let activeGuidedStepNumber = 1;

  // Re-trigger the 240ms enter transition on a newly shown card/section (CSS handles reduced motion).
  function playViewEnter(el) {
    if (!el) return;
    el.classList.remove('il-view-enter');
    void el.offsetWidth;
    el.classList.add('il-view-enter');
  }

  function syncScreen1VaultVisibility(pathname, stepNum = activeGuidedStepNumber) {
    const cleanPath = ROUTES.includes(pathname) ? pathname : '/gst-registration';
    const isScreen1 = cleanPath === '/gst-registration' && stepNum === 1;
    const rightVaultAside = document.getElementById('rightDocumentVaultAside');
    const centerCol = document.getElementById('centerMainWorkspaceCol');
    if (rightVaultAside) {
      if (isScreen1) {
        rightVaultAside.classList.remove('hidden');
      } else {
        rightVaultAside.classList.add('hidden');
      }
    }
    if (centerCol) {
      if (isScreen1) {
        centerCol.classList.remove('lg:col-span-9');
        centerCol.classList.add('lg:col-span-6');
      } else {
        centerCol.classList.remove('lg:col-span-6');
        centerCol.classList.add('lg:col-span-9');
      }
    }
  }

  function renderRoute(pathname) {
    const cleanPath = ROUTES.includes(pathname) ? pathname : '/gst-registration';
    if (cleanPath === '/gst-registration/review') activeGuidedStepNumber = 3;
    else if (cleanPath === '/gst-registration/status') activeGuidedStepNumber = 4;
    else if (cleanPath !== '/gst-registration') activeGuidedStepNumber = 3;

    syncScreen1VaultVisibility(cleanPath, activeGuidedStepNumber);

    document.querySelectorAll('[data-view]').forEach((el) => {
      if (el.getAttribute('data-view') === cleanPath) {
        const wasHidden = el.classList.contains('hidden');
        el.classList.remove('hidden');
        if (wasHidden) playViewEnter(el);
      } else {
        el.classList.add('hidden');
      }
    });

    document.querySelectorAll('#topRouteNav a[data-route]').forEach((a) => {
      if (a.getAttribute('data-route') === cleanPath) {
        a.classList.add('active', 'bg-base-300');
      } else {
        a.classList.remove('active', 'bg-base-300');
      }
    });

    document.querySelectorAll('#mobileRouteSteps a[data-route]').forEach((a) => {
      if (a.getAttribute('data-route') === cleanPath) {
        a.classList.add('btn-success');
        a.classList.remove('btn-ghost');
      } else {
        a.classList.remove('btn-success');
        a.classList.add('btn-ghost');
      }
    });
  }

  function navigateTo(pathname) {
    window.history.pushState({}, '', pathname);
    renderRoute(pathname);
  }

  async function runEligibilityCheck() {
    try {
      syncDynamicFormFields();
      const payload = {
        constitution: document.getElementById('eligConstitution')?.value || 'Sole Proprietorship',
        registrationCategory: document.getElementById('eligCategory')?.value || 'Normal Taxpayer',
        industryClassifications: getSelectedIndustries(),
        stateCode: document.getElementById('eligStateCode')?.value || '27',
        supplyType: document.getElementById('eligSupplyType')?.value || 'Services',
        annualTurnoverInr: Number(document.getElementById('eligTurnover')?.value || 0),
        natureOfPossession: document.getElementById('eligPossession')?.value || 'Rented / Leased',
        internationalSaasExport: Boolean(document.getElementById('eligInternationalExport')?.checked),
        interstateSupply: Boolean(document.getElementById('eligInterstate')?.checked),
        eCommerceSeller: Boolean(document.getElementById('eligEcommerceSeller')?.checked),
        voluntaryRegistration: Boolean(document.getElementById('eligVoluntary')?.checked),
      };
      const result = await apiRequest('/api/gst-registration/eligibility', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const classEl = document.getElementById('eligResultClassification');
      const formBadgeEl = document.getElementById('eligResultFormBadge');
      const heroFormBadgeEl = document.getElementById('heroApplicableFormBadge');
      const headerFormBadgeEl = document.getElementById('headerFormBadge');
      const badgeEl = document.getElementById('eligResultThresholdBadge');
      const schemeEl = document.getElementById('eligResultScheme');
      const timelineEl = document.getElementById('eligFilingTimeline');
      const bannerBox = document.getElementById('eligWorkflowBannerBox');
      const bannerText = document.getElementById('eligWorkflowBannerText');
      const disqEl = document.getElementById('eligDisqualificationsList');
      const rulesEl = document.getElementById('eligMatchedRulesList');

      if (classEl) classEl.textContent = result.registrationClassification;
      if (formBadgeEl) formBadgeEl.textContent = `Form: ${result.applicableForm || 'GST REG-01'}`;
      if (heroFormBadgeEl) heroFormBadgeEl.textContent = `Form ${result.applicableForm || 'GST REG-01'}`;
      if (headerFormBadgeEl) headerFormBadgeEl.textContent = result.applicableForm || 'GST REG-01';
      if (badgeEl) badgeEl.textContent = `Threshold: ₹${Number(result.applicableThresholdInr).toLocaleString('en-IN')}`;
      if (schemeEl) {
        schemeEl.textContent = `Recommended Scheme: ${result.recommendedScheme}${
          result.compositionCategory ? ` — ${result.compositionCategory}` : ''
        }`;
      }
      if (timelineEl && result.statutoryFilingTimeline) {
        timelineEl.textContent = `Statutory Filing Timeline: ${result.statutoryFilingTimeline}`;
      }
      if (bannerBox && bannerText && result.workflowStatusBanner) {
        bannerText.textContent = result.workflowStatusBanner;
        bannerBox.className = `alert text-xs py-2 ${
          result.workflowVerificationStatus === 'REQUIREMENTS_UNDER_VERIFICATION'
            ? 'alert-warning'
            : result.workflowVerificationStatus === 'VERIFIED_PRODUCTION_WORKFLOW'
            ? 'alert-success'
            : 'alert-info'
        }`;
      }
      if (disqEl) {
        disqEl.innerHTML = (result.compositionDisqualifications || [])
          .map((d) => `<div>• ${d}</div>`)
          .join('');
      }
      if (rulesEl) {
        rulesEl.innerHTML = (result.matchedRules || [])
          .map(
            (r) =>
              `<div class="p-1.5 bg-base-100 rounded border border-base-300"><strong>[${r.ruleId}]</strong> (${r.legalSource}, eff. ${r.effectiveStartDate}): ${r.humanExplanation}</div>`
          )
          .join('');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  async function saveDraftApplication() {
    syncDynamicFormFields();
    const hasAddPlace = Boolean(document.getElementById('regHasAdditionalPlace')?.checked);
    const additionalPlaces = hasAddPlace
      ? [
          {
            address: document.getElementById('addPlaceAddress')?.value || '',
            pinCode: document.getElementById('addPlacePin')?.value || '',
          },
        ]
      : [];

    const personName = document.getElementById('regPersonName')?.value || '';
    const personPan = document.getElementById('regPersonPan')?.value || document.getElementById('regBusinessPan')?.value || '';
    const people =
      personName || personPan
        ? [
            {
              personRole: 'primary_authorized_signatory',
              fullName: personName,
              fatherOrHusbandName: document.getElementById('regPersonFather')?.value || '',
              pan: personPan,
              designation: document.getElementById('regPersonDesignation')?.value || 'Proprietor',
              dinOrLlpin: document.getElementById('regPersonDin')?.value || null,
              mobile: document.getElementById('regMobile')?.value || '',
              email: document.getElementById('regEmail')?.value || '',
              aadhaarOptIn: true,
            },
          ]
        : [];

    const payload = {
      applicationId: state.applicationId,
      businessId: state.businessId,
      applicationTitle: 'Universal GST Registration Application',
      businessDetails: {
        constitution: document.getElementById('eligConstitution')?.value || 'Sole Proprietorship',
        registrationCategory: document.getElementById('eligCategory')?.value || 'Normal Taxpayer',
        industryClassifications: getSelectedIndustries(),
        stateCode: document.getElementById('eligStateCode')?.value || '27',
        supplyType: document.getElementById('eligSupplyType')?.value || 'Services',
        annualTurnoverInr: Number(document.getElementById('eligTurnover')?.value || 0),
        natureOfPossession: document.getElementById('eligPossession')?.value || 'Rented / Leased',
        internationalSaasExport: Boolean(document.getElementById('eligInternationalExport')?.checked),
        interstateSupply: Boolean(document.getElementById('eligInterstate')?.checked),
        eCommerceSeller: Boolean(document.getElementById('eligEcommerceSeller')?.checked),
        voluntaryRegistration: Boolean(document.getElementById('eligVoluntary')?.checked),
        compositionOptIn: document.getElementById('eligCategory')?.value === 'Composition Taxpayer',
        hasUdyamMsme: Boolean(document.getElementById('regUdyamNumber')?.value),
        udyamRegistrationNumber: document.getElementById('regUdyamNumber')?.value || '',
        cinOrLlpinOrRegNo: document.getElementById('regCinOrLlpin')?.value || '',
        sezApprovalNumber: document.getElementById('regSezApprovalNo')?.value || '',
        casualEstimatedTaxLiabilityInr: Number(document.getElementById('regCasualEstimatedTax')?.value || 0),
        legalName: document.getElementById('regLegalName')?.value || '',
        tradeName: document.getElementById('regTradeName')?.value || '',
        pan: document.getElementById('regBusinessPan')?.value || '',
        district: document.getElementById('regDistrict')?.value || '',
        reasonForRegistration: document.getElementById('regReasonSelect')?.value || '',
        applicantEmail: document.getElementById('regEmail')?.value || '',
        applicantMobile: document.getElementById('regMobile')?.value || '',
        commencementDate: document.getElementById('regCommencementDate')?.value || '',
        sectorCircleWard: document.getElementById('regWard')?.value || '',
        principalPlaceAddress: {
          buildingOrFlat: document.getElementById('regAddrBuilding')?.value || '',
          localityOrStreet: document.getElementById('regAddrStreet')?.value || '',
          city: document.getElementById('regAddrCity')?.value || '',
          pinCode: document.getElementById('regAddrPin')?.value || '',
        },
        additionalPlaces,
        hsnSacCommodities: [
          {
            code: document.getElementById('regHsnCode')?.value || '998314',
            description:
              document.getElementById('regHsnDesc')?.value ||
              'Information technology (IT) design and development services',
          },
        ],
      },
      people,
    };

    const app = await apiRequest('/api/gst-registration/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.applicationId = app.id;
    localStorage.setItem('hisaab_gst_application_id', app.id);
    updateUiWithApplication(app);
    showAlert(`Saved universal registration draft (${app.hisaabPreparationStatus}).`, 'success');
    return app;
  }

  function statusBadgeHtml(statusText) {
    const map = {
      'Not applicable': 'badge-ghost',
      'Not required': 'badge-ghost',
      Optional: 'badge-ghost',
      Conditional: 'badge-warning',
      Required: 'badge-info',
      Missing: 'badge-error',
      Uploaded: 'badge-primary',
      'AI extracted': 'badge-warning',
      Verified: 'badge-success',
      'Owner verified': 'badge-success',
      Rejected: 'badge-error',
      'Replacement requested': 'badge-warning',
      'Rejected / needs replacement': 'badge-error',
    };
    const cls = map[statusText] || 'badge-ghost';
    return `<span class="badge ${cls} badge-xs font-mono-code">${statusText}</span>`;
  }

  function updateUiWithApplication(app) {
    state.currentApp = app;
    const profile = app.registrationProfile || app.eligibilitySummary?.registrationProfile || {};

    const headerBadge = document.getElementById('headerStatusBadge');
    if (headerBadge) headerBadge.textContent = app.status;
    const headerFormBadge = document.getElementById('headerFormBadge');
    if (headerFormBadge && profile.applicableForm) headerFormBadge.textContent = profile.applicableForm;

    // Update Apply Form Banner & Signatory Rules
    const applyTitle = document.getElementById('applyFormTitle');
    if (applyTitle && profile.applicableForm) {
      applyTitle.textContent = `Dynamic Registration Application (Form ${profile.applicableForm} — ${profile.registrationCategory || 'Normal Taxpayer'})`;
    }
    const applyBannerBox = document.getElementById('applyWorkflowVerificationBanner');
    const applyBannerTxt = document.getElementById('applyWorkflowVerificationText');
    if (applyBannerBox && applyBannerTxt && profile.workflowStatusBanner) {
      applyBannerTxt.textContent = profile.workflowStatusBanner;
      applyBannerBox.className = `alert text-xs ${
        profile.workflowVerificationStatus === 'REQUIREMENTS_UNDER_VERIFICATION'
          ? 'alert-warning'
          : profile.workflowVerificationStatus === 'VERIFIED_PRODUCTION_WORKFLOW'
          ? 'alert-success'
          : 'alert-info'
      }`;
    }
    const sigBadge = document.getElementById('signatoryRuleBadge');
    if (sigBadge && profile.verificationMethods) {
      sigBadge.textContent = `Signing: ${profile.verificationMethods.join(' / ')}`;
    }

    // Sidebar Profile Inspector
    const sideId = document.getElementById('sidebarAppIdBadge');
    if (sideId) sideId.textContent = app.id ? app.id.slice(0, 8) : 'Not saved';
    const sideConst = document.getElementById('sidebarConstitutionText');
    if (sideConst) sideConst.textContent = app.businessDetails?.constitution || 'Sole Proprietorship';
    const sideCat = document.getElementById('sidebarCategoryText');
    if (sideCat) sideCat.textContent = app.businessDetails?.registrationCategory || 'Normal Taxpayer';
    const sideForm = document.getElementById('sidebarFormText');
    if (sideForm) sideForm.textContent = profile.applicableForm || 'GST REG-01';
    const sideWf = document.getElementById('sidebarWorkflowStatusText');
    if (sideWf && profile.workflowVerificationStatus) {
      sideWf.textContent = profile.workflowVerificationStatus;
      sideWf.className = `badge badge-xs font-mono-code ${
        profile.workflowVerificationStatus === 'VERIFIED_PRODUCTION_WORKFLOW'
          ? 'badge-success'
          : profile.workflowVerificationStatus === 'REQUIREMENTS_UNDER_VERIFICATION'
          ? 'badge-warning'
          : 'badge-info'
      }`;
    }
    const sideTrade = document.getElementById('sidebarTradeNameText');
    if (sideTrade) sideTrade.textContent = app.businessDetails?.tradeName || app.businessDetails?.legalName || '—';
    const sideStatus = document.getElementById('sidebarStatusText');
    if (sideStatus) sideStatus.textContent = app.status;
    const sidePrep = document.getElementById('sidebarPrepText');
    if (sidePrep) sidePrep.textContent = app.hisaabPreparationStatus;
    const sidePortal = document.getElementById('sidebarPortalText');
    if (sidePortal) sidePortal.textContent = app.officialPortalStatus;
    const sideBlockers = document.getElementById('sidebarBlockerCount');
    if (sideBlockers && app.validation) {
      sideBlockers.textContent = String(app.validation.blockerCount ?? 0);
      sideBlockers.className = `badge badge-xs font-mono-code ${
        app.validation.blockerCount === 0 ? 'badge-success' : 'badge-warning'
      }`;
    }
    const sidePan = document.getElementById('sidebarPanText');
    if (sidePan) sidePan.textContent = app.businessDetails?.panMasked || '—';
    const sideTrnArn = document.getElementById('sidebarTrnArnText');
    if (sideTrnArn) {
      sideTrnArn.textContent = [app.trnNumber, app.arnNumber].filter(Boolean).join(' / ') || '—';
    }
    const sideGstin = document.getElementById('sidebarGstinText');
    if (sideGstin) sideGstin.textContent = app.approvedGstin || '—';

    // Universal Document Requirement Matrix Table (P0-07)
    const checklistBody = document.getElementById('interactiveChecklistTableBody');
    const univDocs = app.validation?.universalDocumentRequirements || profile.requiredDocuments || app.validation?.requiredChecklist || [];
    if (checklistBody && Array.isArray(univDocs)) {
      checklistBody.innerHTML = univDocs
        .map(
          (item) => `<tr>
            <td class="font-semibold">${item.group || 'General'}</td>
            <td>${item.label} <span class="opacity-60 font-mono-code">(${item.category})</span></td>
            <td>${statusBadgeHtml(item.requirementType || (item.mandatory ? 'Required' : 'Optional'))}</td>
            <td>${statusBadgeHtml(item.status || item.requirementStatus)}</td>
          </tr>`
        )
        .join('');
    }

    // Provider Capability Registry Table (P0-10)
    const capBody = document.getElementById('providerCapabilityTableBody');
    const caps = app.providerCapabilities || profile.providerCapabilities;
    if (capBody && caps) {
      capBody.innerHTML = Object.values(caps)
        .map(
          (c) => `<tr>
            <td><strong>${c.operation}</strong><br/><span class="opacity-70">${c.explanation || ''}</span></td>
            <td class="font-mono-code">${c.mechanism}</td>
            <td><span class="badge badge-outline badge-xs font-mono-code">${c.status}</span></td>
          </tr>`
        )
        .join('');
    }

    // Uploaded Documents table
    const docsBody = document.getElementById('uploadedDocsTableBody');
    if (docsBody) {
      if (!Array.isArray(app.documents) || app.documents.length === 0) {
        docsBody.innerHTML = '<tr><td colspan="5" class="text-center opacity-60 py-4">No documents uploaded yet.</td></tr>';
      } else {
        docsBody.innerHTML = app.documents
          .map((d) => {
            const extKeys = Object.entries(d.extractedFields || {})
              .filter(([k]) => k !== 'pan') // Never render raw unmasked PAN in table
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
            return `<tr>
              <td class="font-semibold">${d.documentCategory}</td>
              <td class="font-mono-code">${d.fileName}<br/><span class="opacity-60">SHA-256: ${d.sha256Digest.slice(0, 12)}…</span></td>
              <td class="font-mono-code">${extKeys || 'None'}</td>
              <td>${
                d.extractionConfirmedByOwner
                  ? statusBadgeHtml(d.requirementStatus || 'Verified')
                  : `<button type="button" data-confirm-doc="${d.id}" class="btn btn-warning btn-xs">Approve Extracted</button>`
              }</td>
              <td class="space-x-1">
                <button type="button" data-delete-doc="${d.id}" class="btn btn-ghost btn-xs text-error">Delete</button>
              </td>
            </tr>`;
          })
          .join('');
      }
    }

    // Update Right-Section Upload Documents Studio Badges
    // Slot readiness comes only from documents the backend actually holds (plus uploads made this session).
    const uploadedCats = new Set((app.documents || []).map((d) => d.documentCategory));
    if (typeof localUploadedRightSlots !== 'undefined') {
      localUploadedRightSlots.forEach((cat) => uploadedCats.add(cat));
    }
    const hasVerifiedPan = Boolean(app.businessDetails?.panMasked && app.businessDetails.panMasked !== '—');
    const slotCategories = [
      { id: 'rightDocStatus_pan_card_business', catKey: 'pan_card_business', cats: ['pan_card_business', 'pan_card_promoter'], alsoOk: hasVerifiedPan, defaultLabel: 'Pending' },
      { id: 'rightDocStatus_electricity_bill_or_tax_receipt', catKey: 'electricity_bill_or_tax_receipt', cats: ['electricity_bill_or_tax_receipt'], alsoOk: false, defaultLabel: 'Pending' },
      { id: 'rightDocStatus_photograph', catKey: 'photograph', cats: ['photograph'], alsoOk: false, defaultLabel: 'Pending' },
      { id: 'rightDocStatus_bank_proof', catKey: 'udyam_msme_certificate', cats: ['bank_proof', 'udyam_msme_certificate'], alsoOk: Boolean(app.businessDetails?.udyamRegistrationNumber || app.businessDetails?.cinOrLlpinOrRegNo), defaultLabel: 'Pending' },
    ];
    let readySlotsCount = 0;
    slotCategories.forEach((slot) => {
      const badgeEl = document.getElementById(slot.id);
      const isUploaded = slot.alsoOk || slot.cats.some((c) => uploadedCats.has(c));
      if (isUploaded) readySlotsCount += 1;
      if (badgeEl) {
        badgeEl.textContent = isUploaded ? 'Ready' : slot.defaultLabel;
        badgeEl.className = `badge ${isUploaded ? 'badge-success' : 'badge-warning'} badge-xs rounded-full shrink-0`;
      }
      if (typeof syncVaultSlotActionSymbol === 'function') {
        syncVaultSlotActionSymbol(slot.catKey, isUploaded);
      }
    });
    const rightCountBadge = document.getElementById('rightPanelDocsCountBadge');
    if (rightCountBadge) {
      rightCountBadge.textContent = `${readySlotsCount}/4 ready`;
      rightCountBadge.className = `badge ${readySlotsCount === 4 ? 'badge-success' : 'badge-warning'} badge-xs rounded-full font-mono-code`;
    }

    // Review Screen Blocker Report
    const readyBadge = document.getElementById('reviewReadyBadge');
    if (readyBadge && app.validation) {
      readyBadge.textContent = app.validation.readyForSubmission
        ? 'Ready for Submission (0 Blockers)'
        : `${app.validation.computedStatus || 'Ready for Review'} (${app.validation.blockerCount ?? 0} Pending Verifications)`;
      readyBadge.className = `badge font-mono-code ${
        app.validation.readyForSubmission ? 'badge-success' : 'badge-warning'
      }`;
    }

    const errBox = document.getElementById('reviewErrorsContainer');
    if (errBox && app.validation) {
      errBox.innerHTML = (app.validation.errors || [])
        .map((e) => `<div class="alert alert-error text-xs"><span><strong>Blocker (${e.field}):</strong> ${e.message}</span></div>`)
        .join('');
    }

    const warnBox = document.getElementById('reviewWarningsContainer');
    if (warnBox && app.validation) {
      warnBox.innerHTML = (app.validation.warnings || [])
        .map((w) => `<div class="alert alert-warning text-xs"><span><strong>Warning (${w.field}):</strong> ${w.message}</span></div>`)
        .join('');
    }

    const missBox = document.getElementById('reviewMissingDocsContainer');
    if (missBox && app.validation) {
      missBox.innerHTML = (app.validation.missingDocuments || [])
        .map((m) => `<div class="alert alert-info text-xs"><span><strong>Missing Mandatory Document [${m.status}]:</strong> ${m.label} (${m.category})</span></div>`)
        .join('');
    }

    const sumGrid = document.getElementById('reviewSummaryGrid');
    if (sumGrid) {
      const bd = app.businessDetails || {};
      sumGrid.innerHTML = [
        `<div>Constitution: <strong>${bd.constitution || 'Sole Proprietorship'}</strong></div>`,
        `<div>Category: <strong>${bd.registrationCategory || 'Normal Taxpayer'}</strong></div>`,
        `<div>Applicable Form: <strong>${profile.applicableForm || 'GST REG-01'}</strong></div>`,
        `<div>Workflow Status: <strong>${profile.workflowVerificationStatus || 'VERIFIED_PRODUCTION_WORKFLOW'}</strong></div>`,
        `<div>Legal Name (PAN): <strong>${bd.legalName || 'Pending Entry'}</strong></div>`,
        `<div>Trade Name: <strong>${bd.tradeName || '—'}</strong></div>`,
        `<div>Masked PAN: <strong>${bd.panMasked || 'Pending Entry'}</strong></div>`,
        `<div>State &amp; District: <strong>${bd.stateCode || '—'} / ${bd.district || '—'}</strong></div>`,
        `<div>Possession: <strong>${bd.natureOfPossession || '—'}</strong></div>`,
        `<div>Primary HSN/SAC: <strong>${bd.hsnSacCommodities?.[0]?.code || '998314'}</strong></div>`,
      ].join('');
    }

    // Status Screen
    const stState = document.getElementById('statusCurrentState');
    if (stState) stState.textContent = app.status;
    const stPrep = document.getElementById('statusPrepDesc');
    if (stPrep) stPrep.textContent = app.hisaabPreparationStatus;
    const stPortal = document.getElementById('statusOfficialPortal');
    if (stPortal) stPortal.textContent = app.officialPortalStatus;

    const timeline = document.getElementById('statusTimelineList');
    if (timeline) {
      timeline.innerHTML = (app.statusHistory || [])
        .slice()
        .reverse()
        .map(
          (ev) =>
            `<li class="p-2 bg-base-200 rounded border border-base-300">[${ev.createdAt.slice(0, 19)}] <strong>${
              ev.newStatus
            }</strong> (${ev.verificationSource}) — ${ev.notes}</li>`
        )
        .join('');
    }

    // =========================================================================
    // AI-First GST Registration Assistant UI Rendering (Req 1–8)
    // =========================================================================
    const prog = app.completionProgress || {
      completedMandatoryCount: 0,
      totalMandatoryCount: 16,
      percentage: 0,
      isComplete: false,
    };

    const hasExistingProgress =
      prog.completedMandatoryCount > 0 ||
      Boolean(app.businessDetails?.tradeName || app.businessDetails?.legalName) ||
      (Array.isArray(app.conversationHistory) && app.conversationHistory.length > 1) ||
      Boolean(app.pendingExtractedCard);

    const welcomeContinueBtn = document.getElementById('welcomeContinueAppBtn');
    const welcomeScreenEl = document.getElementById('aiWelcomeScreen');
    const workspaceEl = document.getElementById('aiConversationWorkspace');
    if (welcomeContinueBtn) {
      if (hasExistingProgress) welcomeContinueBtn.classList.remove('hidden');
      else welcomeContinueBtn.classList.add('hidden');
    }
    if (welcomeScreenEl && workspaceEl) {
      if (state.workspaceStarted || hasExistingProgress) {
        welcomeScreenEl.classList.add('hidden');
        workspaceEl.classList.remove('hidden');
      } else {
        welcomeScreenEl.classList.remove('hidden');
        workspaceEl.classList.add('hidden');
      }
    }

    const headerProgBadge = document.getElementById('headerLiveProgressBadge');
    if (headerProgBadge) {
      headerProgBadge.textContent = `${prog.percentage}%`;
    }
    const mobilePctBadge = document.getElementById('mobileStagePctBadge');
    if (mobilePctBadge) {
      mobilePctBadge.textContent = `${prog.percentage}%`;
    }
    const sideRegBadge = document.getElementById('sidebarRegistryProgressBadge');
    if (sideRegBadge) {
      sideRegBadge.textContent = `${prog.percentage}%`;
    }
    const aiProgStats = document.getElementById('aiLiveProgressStats');
    if (aiProgStats) {
      aiProgStats.textContent = `${prog.percentage}% complete (${prog.completedMandatoryCount} of ${prog.totalMandatoryCount} details)`;
    }
    const aiProgBar = document.getElementById('aiLiveProgressBar');
    if (aiProgBar) {
      aiProgBar.style.width = `${prog.percentage}%`;
    }

    // Compact Extracted Information Confirmation Card (Req 3)
    const extCardEl = document.getElementById('aiExtractedConfirmationCard');
    const extHeadingEl = document.getElementById('aiExtractedCardHeading');
    const extDocTypeEl = document.getElementById('aiExtractedCardDocType');
    const extFieldsEl = document.getElementById('aiExtractedCardFieldsList');
    if (extCardEl) {
      if (app.pendingExtractedCard && Array.isArray(app.pendingExtractedCard.fields) && app.pendingExtractedCard.fields.length > 0 && !app.pendingExtractedCard.confirmedByOwner) {
        extCardEl.classList.remove('hidden');
        if (extHeadingEl) {
          extHeadingEl.textContent = app.pendingExtractedCard.heading || 'I found these business details. Are they correct?';
        }
        if (extDocTypeEl) {
          extDocTypeEl.textContent = 'Extracted from document';
        }
        if (extFieldsEl) {
          extFieldsEl.innerHTML = app.pendingExtractedCard.fields
            .map(
              (f) => `<div class="apple-subcard p-3 space-y-0.5 ${f.hasConflict ? 'border border-warning/60' : ''}">
                <div class="text-[11px] opacity-70">${f.label}</div>
                <div class="font-semibold text-xs">${f.value}</div>
                ${
                  f.hasConflict
                    ? `<div class="text-[11px] text-warning">Differs from earlier value (${f.existingValue})</div>`
                    : ''
                }
              </div>`
            )
            .join('');
        }
      } else {
        extCardEl.classList.add('hidden');
      }
    }

    // Contextual Rule 14A Simplified Option Notice (Only shown when relevant - Req 6)
    const ctx14ABanner = document.getElementById('contextualRule14ABanner');
    if (ctx14ABanner) {
      if (app.rule14AAssessment?.isEligible && prog.completedMandatoryCount >= 2) {
        ctx14ABanner.classList.remove('hidden');
      } else {
        ctx14ABanner.classList.add('hidden');
      }
    }

    // 6 Simple Final Review Cards & Version-Tied Owner Approval (Req 7)
    const reviewCardsGrid = document.getElementById('simpleReviewCardsGrid');
    if (reviewCardsGrid && Array.isArray(app.reviewCards)) {
      reviewCardsGrid.innerHTML = app.reviewCards
        .map((card) => {
          const isReady = card.status === 'Verified';
          const isConflict = card.status === 'Clarification needed';
          const badgeCls = isConflict ? 'badge-error' : isReady ? 'badge-success' : 'badge-warning';
          const itemsHtml = (card.items || [])
            .map(
              (it) => `<div class="flex items-start justify-between gap-2 py-1 border-b border-base-300/40 last:border-none">
                <span class="opacity-70">${it.label}</span>
                <div class="text-right">
                  <div class="font-semibold">${it.value}</div>
                  ${
                    it.conflictWarning
                      ? `<div class="text-[10px] text-error">${it.conflictWarning}</div>`
                      : !it.ready
                      ? `<div class="text-[10px] text-warning">Action needed</div>`
                      : ''
                  }
                </div>
              </div>`
            )
            .join('');
          return `<div class="apple-subcard p-4 space-y-2.5 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-bold text-sm">${card.title}</h3>
                <span class="badge ${badgeCls} badge-xs rounded-full">${card.status}</span>
              </div>
              <div class="space-y-1">${itemsHtml}</div>
            </div>
            <div class="pt-2 flex justify-end">
              <a href="/gst-registration/apply" data-nav="/gst-registration/apply" class="btn btn-ghost btn-xs rounded-full text-xs">
                Edit section →
              </a>
            </div>
          </div>`;
        })
        .join('');
    }

    const invalidatedAlertEl = document.getElementById('ownerApprovalInvalidatedAlert');
    const approveChkEl = document.getElementById('aiOwnerApproveReviewCheckbox');
    if (app.ownerApprovalStatus) {
      if (invalidatedAlertEl) {
        if (app.ownerApprovalStatus.invalidatedByEdit) {
          invalidatedAlertEl.classList.remove('hidden');
        } else {
          invalidatedAlertEl.classList.add('hidden');
        }
      }
      if (approveChkEl) {
        approveChkEl.checked = Boolean(app.ownerApprovalStatus.isApproved);
      }
    }

    // Storage Gate Badge (Req 12)
    const storageGateBadge = document.getElementById('aiStorageGateBadge');
    if (storageGateBadge && app.environmentSecurity) {
      if (app.environmentSecurity.realIdentityUploadsBlocked) {
        storageGateBadge.textContent = 'Binary Vault Blocked (Supabase RLS Gate Active)';
        storageGateBadge.className = 'badge badge-warning badge-xs rounded-full font-mono-code';
      } else {
        storageGateBadge.textContent = 'Private Storage & RLS Verified';
        storageGateBadge.className = 'badge badge-success badge-xs rounded-full font-mono-code';
      }
    }

    // Conversation Thread (Req 2, 10)
    const threadEl = document.getElementById('aiConversationThread');
    if (threadEl && Array.isArray(app.conversationHistory)) {
      threadEl.innerHTML = app.conversationHistory
        .map((msg) => {
          const isUser = msg.role === 'user';
          const isSecurityRedirect = msg.meta?.type === 'security_vault_redirect';
          return `<div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
              isUser
                ? 'bg-[var(--il-ink)] text-[var(--il-page)]'
                : isSecurityRedirect
                ? 'bg-warning/15 border border-warning/40 text-warning'
                : 'bg-base-200/90 border border-base-300/80'
            }">
              <div class="text-[10px] font-mono-code opacity-65 mb-0.5">${
                isUser ? 'You (Owner)' : 'Hisaab.Guru AI Assistant'
              }</div>
              <div>${String(msg.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>
            </div>
          </div>`;
        })
        .join('');
      threadEl.scrollTop = threadEl.scrollHeight;
    }

    // Active Single Question & Quick-Select Options (Req 5, 6, 7)
    const qCard = document.getElementById('aiActiveQuestionCard');
    const qPrompt = document.getElementById('aiCurrentQuestionPrompt');
    const qWhy = document.getElementById('aiCurrentQuestionWhy');
    const qKeyBadge = document.getElementById('aiQuestionFieldKeyBadge');
    const qQuickBox = document.getElementById('aiQuickSelectContainer');
    const vaultCard = document.getElementById('aiSecureVaultCard');

    if (app.currentQuestion) {
      if (qCard) qCard.classList.remove('hidden');
      if (qPrompt) {
        qPrompt.innerHTML = String(app.currentQuestion.prompt || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      }
      if (qWhy) qWhy.textContent = app.currentQuestion.whyRequired || '';
      if (qKeyBadge) qKeyBadge.textContent = app.currentQuestion.fieldKey || '';

      if (qQuickBox) {
        const opts = Array.isArray(app.currentQuestion.quickOptions) ? app.currentQuestion.quickOptions : [];
        qQuickBox.innerHTML = opts
          .map((opt, idx) => {
            const encodedVal = encodeURIComponent(JSON.stringify(opt.value));
            return `<button
              type="button"
              data-quick-select-field="${opt.fieldKey}"
              data-quick-select-val="${encodedVal}"
              id="quickSelectBtn-${opt.fieldKey}-${idx}"
              class="btn btn-xs sm:btn-sm rounded-full bg-[var(--il-green-soft)] hover:bg-[var(--il-green)] hover:text-[var(--il-green-ink)] border border-[var(--il-line-strong)] text-xs font-semibold"
            >
              ${opt.label}
            </button>`;
          })
          .join('');
      }

      if (vaultCard) {
        if (app.currentQuestion.isSensitiveVaultField) {
          vaultCard.classList.remove('hidden');
          const sigNameInput = document.getElementById('vaultSignatoryNameInput');
          if (sigNameInput && !sigNameInput.value && app.businessDetails?.legalName) {
            sigNameInput.value = app.businessDetails.legalName;
          }
        }
      }
    } else if (qCard) {
      qCard.classList.add('hidden');
    }

    // Auto-Generated Complete Form GST REG-01 Review Dossier (Req 14 & 15)
    const autoReviewCard = document.getElementById('aiAutoReviewDossierCard');
    const autoReviewGrid = document.getElementById('aiAutoReviewSummaryGrid');
    const autoReviewFormBadge = document.getElementById('aiReviewFormCodeBadge');
    if (app.autoGeneratedReg01Review && autoReviewCard) {
      autoReviewCard.classList.remove('hidden');
      const rev = app.autoGeneratedReg01Review;
      if (autoReviewFormBadge) autoReviewFormBadge.textContent = `Form ${rev.applicableForm || 'GST REG-01'}`;
      if (autoReviewGrid) {
        autoReviewGrid.innerHTML = [
          `<div class="apple-subcard p-3"><strong>Part A · Legal Name (PAN):</strong><br/>${rev.partASummary?.legalNameAsPerPan || '—'}</div>`,
          `<div class="apple-subcard p-3"><strong>Part A · Masked PAN &amp; State:</strong><br/>${rev.partASummary?.panMasked || '—'} · ${rev.partASummary?.stateUt || '—'}</div>`,
          `<div class="apple-subcard p-3"><strong>Part A · OTP Email &amp; Mobile:</strong><br/>${rev.partASummary?.emailAddress || '—'} · ${rev.partASummary?.mobileNumberMasked || '—'}</div>`,
          `<div class="apple-subcard p-3"><strong>Part B · Trade Name &amp; Constitution:</strong><br/>${rev.partBSummary?.tradeName || '—'} (${rev.partBSummary?.constitution || '—'})</div>`,
          `<div class="apple-subcard p-3"><strong>Part B · Eligibility &amp; Trigger:</strong><br/>${rev.partBSummary?.eligibilityClassification || '—'}</div>`,
          `<div class="apple-subcard p-3"><strong>Part B · Signatory &amp; HSN/SAC:</strong><br/>${rev.partBSummary?.primaryAuthorizedSignatory?.fullName || '—'} · ${(rev.partBSummary?.topCommoditiesHsnSac || []).map((c) => c.code).join(', ')}</div>`,
        ].join('');
      }
    } else if (autoReviewCard) {
      autoReviewCard.classList.add('hidden');
    }

    // Plain-Language Confirmed Details Summary (No raw internal confidence decimals or enum strings)
    const regListEl = document.getElementById('liveFieldRegistryList');
    if (regListEl && Array.isArray(app.fieldRegistry)) {
      regListEl.innerHTML = app.fieldRegistry
        .map((f) => {
          const statusHtml = f.conflictWarning
            ? `<span class="badge badge-error badge-xs rounded-full">Needs clarification</span>`
            : f.ownerConfirmed && f.populated
            ? `<span class="badge badge-success badge-xs rounded-full">Confirmed</span>`
            : f.populated || f.candidateValue
            ? `<button type="button" data-confirm-registry-field="${f.fieldKey}" data-confirm-registry-val="${encodeURIComponent(
                JSON.stringify(f.candidateValue || f.displayValue)
              )}" class="btn btn-warning btn-xs rounded-full text-[10px] px-2.5">Confirm</button>`
            : `<span class="badge badge-ghost badge-xs rounded-full">Pending</span>`;

          return `<div class="apple-subcard p-2.5 space-y-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-[11px]">${f.label}</span>
              ${statusHtml}
            </div>
            <div class="text-xs truncate opacity-90">${f.displayValue}</div>
            ${
              f.conflictWarning
                ? `<div class="text-[10px] text-error font-medium">${f.conflictWarning}</div>`
                : ''
            }
          </div>`;
        })
        .join('');
    }

    // 1. Compact Five-Stage Application Progress Sidebar (Req 2 & 5)
    const journey = app.fiveStageJourney;
    const journeyHeading = document.getElementById('journeyActiveStageHeading');
    const mobileStageInd = document.getElementById('mobileStageIndicatorText');
    const nextActEl = document.getElementById('sidebarImmediateNextAction');
    const wsNextActEl = document.getElementById('workspaceImmediateNextText');
    const journeyTracker = document.getElementById('fiveStageJourneyTracker');
    if (journey) {
      if (journeyHeading) {
        journeyHeading.textContent = `Stage ${journey.currentStageNumber} of 5 · ${journey.currentStageTitle}`;
      }
      if (mobileStageInd) {
        mobileStageInd.textContent = `${journey.currentStageNumber}. ${journey.currentStageTitle}`;
      }
      if (nextActEl && journey.immediateNextActionText) {
        nextActEl.textContent = journey.immediateNextActionText;
      }
      if (wsNextActEl && journey.immediateNextActionText) {
        wsNextActEl.textContent = journey.immediateNextActionText;
      }
      if (journeyTracker) {
        journeyTracker.innerHTML = (journey.stages || [])
          .map((st) => {
            const isCompleted = st.status === 'COMPLETED';
            const isActive = st.stageNumber === journey.currentStageNumber;
            const badgeClass = isCompleted
              ? 'badge-success'
              : st.status === 'ACTION_REQUIRED'
              ? 'badge-warning'
              : isActive
              ? 'badge-info'
              : 'badge-ghost';
            const badgeLabel = isCompleted ? 'Done' : isActive ? 'Current' : 'Upcoming';
            return `<a
              href="${st.route}"
              data-nav="${st.route}"
              class="apple-subcard px-3 py-2.5 flex items-center justify-between gap-2 transition-all ${
                isActive ? 'border-[var(--il-green)] bg-[var(--il-green-soft)]' : 'opacity-80 hover:opacity-100'
              }"
            >
              <div class="min-w-0">
                <div class="font-semibold text-xs truncate">${st.shortTitle}</div>
                <div class="text-[11px] opacity-70 truncate">${st.progressText}</div>
              </div>
              <span class="badge ${badgeClass} badge-xs rounded-full shrink-0">${badgeLabel}</span>
            </a>`;
          })
          .join('');
      }
    }

    // 2. Dynamic Document Checklist by Constitution + Premises + Category & Optional DigiLocker (Req 3, 5, 7)
    const dynCheck = app.dynamicDocumentChecklist;
    if (dynCheck) {
      const subEl = document.getElementById('dynamicChecklistSubtitle');
      if (subEl) {
        subEl.textContent = `Tailored to ${dynCheck.constitution} · ${dynCheck.premisesPossession} · ${dynCheck.registrationCategory} (${dynCheck.applicableForm})`;
      }
      const progEl = document.getElementById('dynamicChecklistProgressBadge');
      if (progEl) {
        progEl.textContent = `${dynCheck.mandatoryPreFilingSatisfied}/${dynCheck.mandatoryPreFilingTotal} Pre-Filing Verified`;
        progEl.className = `badge ${
          dynCheck.allPreFilingSatisfied ? 'badge-success' : 'badge-warning'
        } badge-xs rounded-full font-mono-code`;
      }

      const dl = dynCheck.digilockerIntegration || {};
      const dlBadge = document.getElementById('digilockerStatusBadge');
      const dlText = document.getElementById('digilockerDisclosureText');
      if (dlBadge) {
        dlBadge.textContent = dl.connected ? 'Connected' : 'Not connected';
        dlBadge.className = `badge ${dl.connected ? 'badge-success' : 'badge-warning'} badge-xs rounded-full font-mono-code`;
      }
      if (dlText) {
        dlText.textContent = dl.honestDisclosure || dl.badgeLabel || 'Not connected';
      }

      const preContainer = document.getElementById('dynamicPreFilingChecklistContainer');
      if (preContainer && Array.isArray(dynCheck.preFilingItems)) {
        preContainer.innerHTML = dynCheck.preFilingItems
          .map((item) => {
            const badgeHtml = item.satisfied
              ? '<span class="badge badge-success badge-xs font-mono-code">Verified</span>'
              : item.requiredBeforeReg01
              ? '<span class="badge badge-warning badge-xs font-mono-code">Required Pre-Filing</span>'
              : '<span class="badge badge-ghost badge-xs font-mono-code">Optional AI Accelerator</span>';
            return `<div class="apple-subcard p-3.5 space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-xs">${item.title}</span>
                ${badgeHtml}
              </div>
              <p class="text-[11px] opacity-80 leading-relaxed">${item.acceptedProofs}</p>
              <div class="flex flex-wrap items-center justify-between text-[10px] font-mono-code opacity-65 pt-0.5">
                <span>Basis: ${item.statutoryBasis}</span>
                <span>Status: ${item.verificationMethod}</span>
              </div>
            </div>`;
          })
          .join('');
      }

      const postContainer = document.getElementById('dynamicPostGrantRule10AContainer');
      if (postContainer && Array.isArray(dynCheck.postRegistrationRule10AItems)) {
        postContainer.innerHTML = dynCheck.postRegistrationRule10AItems
          .map(
            (item) => `<div class="apple-subcard p-3.5 border border-info/35 space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-bold text-xs">${item.title}</span>
                <span class="badge badge-info badge-outline badge-xs font-mono-code">Post-Grant · Rule 10A (Not Required Now)</span>
              </div>
              <p class="text-[11px] opacity-80 leading-relaxed">${item.acceptedProofs}</p>
              <div class="flex flex-wrap items-center justify-between text-[10px] font-mono-code opacity-65 pt-0.5">
                <span>Basis: ${item.statutoryBasis}</span>
                <span>${item.verificationMethod}</span>
              </div>
            </div>`
          )
          .join('');
      }
    }

    // 3. Dedicated CGST Rule 14A Simplified Eligibility Assessment (Req 4 & 11)
    const r14 = app.rule14AAssessment;
    if (r14) {
      const r14Badge = document.getElementById('rule14AStatusBadge');
      if (r14Badge) {
        r14Badge.textContent = r14.isEligible
          ? r14.optedIn
            ? 'Rule 14A Eligible & Opted-In'
            : 'Rule 14A Eligible (Opted Out)'
          : 'Standard Track (Rule 14A Ineligible)';
        r14Badge.className = `badge ${r14.isEligible ? 'badge-success' : 'badge-warning'} badge-xs rounded-full font-mono-code`;
      }
      const r14List = document.getElementById('rule14ACriteriaList');
      if (r14List && Array.isArray(r14.criteriaChecklist)) {
        r14List.innerHTML = r14.criteriaChecklist
          .map(
            (c) => `<div class="flex items-center justify-between gap-2 apple-subcard px-2.5 py-1.5">
              <span>${c.label}</span>
              <span class="badge ${c.passed ? 'badge-success' : 'badge-error'} badge-xs font-mono-code">${
              c.passed ? 'Pass' : 'No'
            }</span>
            </div>`
          )
          .join('');
      }
      const r14TaxInput = document.getElementById('rule14AMonthlyB2bTaxInput');
      if (r14TaxInput && typeof r14.estimatedMonthlyB2bOutputTaxInr === 'number') {
        r14TaxInput.value = String(r14.estimatedMonthlyB2bOutputTaxInr);
      }
      const r14OptChk = document.getElementById('rule14AOptInCheckbox');
      if (r14OptChk) {
        r14OptChk.checked = Boolean(r14.optedIn);
      }
    }

    // 4. Dedicated CGST Rule 10A Post-Registration Bank Account Workflow (Req 5 & 11)
    const r10 = app.rule10AWorkflow;
    if (r10) {
      const r10Badge = document.getElementById('rule10AStatusBadge');
      if (r10Badge) {
        r10Badge.textContent = r10.statusBadge;
        r10Badge.className = `badge ${
          r10.status === 'DEFERRED_TO_POST_GRANT_RULE_10A' ? 'badge-info' : 'badge-success'
        } badge-xs rounded-full font-mono-code`;
      }
      const r10Summary = document.getElementById('rule10ADeadlineSummary');
      if (r10Summary) {
        r10Summary.textContent = r10.bankAccountDetails?.accountNumberMasked
          ? `Recorded Bank Account: ${r10.bankAccountDetails.bankName || ''} · IFSC ${r10.bankAccountDetails.ifscCode} · Acct ${
              r10.bankAccountDetails.accountNumberMasked
            } (${r10.bankAccountDetails.proofType})`
          : `Rule 10A Active: ${r10.deadlineRule}`;
      }
    }

    // 5. Pre-Review Readiness: Outstanding Questions & Missing Pre-Filing Documents (Req 9 & 10)
    const preRev = app.preReviewReadiness;
    if (preRev) {
      const preBadge = document.getElementById('preReviewStatusBadge');
      if (preBadge) {
        preBadge.textContent = preRev.readyForFinalReview
          ? 'Ready for your review'
          : `${preRev.outstandingQuestionsCount} Questions · ${preRev.missingPreFilingDocumentsCount} Docs Pending`;
        preBadge.className = `badge ${
          preRev.readyForFinalReview ? 'badge-success' : 'badge-warning'
        } badge-xs rounded-full font-mono-code`;
      }
      const oqCount = document.getElementById('outstandingQuestionsCountBadge');
      if (oqCount) oqCount.textContent = String(preRev.outstandingQuestionsCount || 0);
      const oqList = document.getElementById('outstandingQuestionsList');
      if (oqList) {
        if (!preRev.outstandingQuestions || preRev.outstandingQuestions.length === 0) {
          oqList.innerHTML = '<div class="text-success font-mono-code">All 16 required questions answered.</div>';
        } else {
          oqList.innerHTML = preRev.outstandingQuestions
            .map(
              (q) => `<div class="flex items-center justify-between gap-2 py-1 border-b border-base-300/50 last:border-none">
                <span class="truncate"><strong>${q.label}:</strong> <span class="opacity-70">${q.actionHint}</span></span>
                <span class="badge badge-outline badge-xs font-mono-code shrink-0">${q.currentStatus}</span>
              </div>`
            )
            .join('');
        }
      }
      const mdCount = document.getElementById('missingPreFilingDocsCountBadge');
      if (mdCount) mdCount.textContent = String(preRev.missingPreFilingDocumentsCount || 0);
      const mdList = document.getElementById('missingPreFilingDocsList');
      if (mdList) {
        if (!preRev.missingPreFilingDocuments || preRev.missingPreFilingDocuments.length === 0) {
          mdList.innerHTML =
            '<div class="text-success font-mono-code">Identity and premises proofs are complete. Bank proof can follow later under Rule 10A.</div>';
        } else {
          mdList.innerHTML = preRev.missingPreFilingDocuments
            .map(
              (d) => `<div class="py-1 border-b border-base-300/50 last:border-none">
                <div class="font-semibold">${d.title}</div>
                <div class="text-[10px] opacity-70 font-mono-code">${d.statutoryBasis}</div>
              </div>`
            )
            .join('');
        }
      }
    }

    // 6. Plain-Language GST Registration FAQs & Official CBIC/GSTN Sources (Req 6 & 11)
    const faqListEl = document.getElementById('plainLanguageFaqAccordionList');
    if (faqListEl && Array.isArray(app.plainLanguageFaqs) && !faqListEl.dataset.rendered) {
      faqListEl.dataset.rendered = 'true';
      faqListEl.innerHTML = app.plainLanguageFaqs
        .map(
          (faq, idx) => `<details class="apple-subcard p-3.5" ${idx < 2 ? 'open' : ''}>
            <summary class="cursor-pointer font-bold select-none flex flex-wrap items-center justify-between gap-2">
              <span>${faq.question}</span>
              <span class="badge badge-ghost badge-xs font-mono-code shrink-0">${faq.category}</span>
            </summary>
            <div class="pt-2.5 space-y-1.5 opacity-85 leading-relaxed">
              <p>${faq.answer}</p>
              <div class="text-[10px] font-mono-code text-[var(--il-green)]">Official Source: ${faq.statutoryCitation}</div>
            </div>
          </details>`
        )
        .join('');
    }

    const sourcesEl = document.getElementById('officialStatutorySourcesList');
    if (sourcesEl && Array.isArray(app.officialStatutorySources) && !sourcesEl.dataset.rendered) {
      sourcesEl.dataset.rendered = 'true';
      sourcesEl.innerHTML = app.officialStatutorySources
        .map(
          (src) => `<div class="p-2.5 rounded-xl bg-base-200/70 border border-base-300/60 space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-1 font-mono-code text-[11px]">
              <strong class="text-[var(--il-green)]">${src.reference}</strong>
              <span>Effective: ${src.effectiveFrom} · ${src.officialPortalDomain}</span>
            </div>
            <p class="text-[11px] opacity-80 leading-relaxed">${src.summary}</p>
          </div>`
        )
        .join('');
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Event Listeners
  document.addEventListener('click', async (e) => {
    const navLink = e.target.closest('a[data-route], a[data-nav]');
    if (navLink) {
      e.preventDefault();
      const targetRoute = navLink.getAttribute('data-route') || navLink.getAttribute('data-nav');
      if (targetRoute && targetRoute !== '/gst-registration') {
        if (typeof validateStep1MandatoryFieldsAndVault === 'function' && !validateStep1MandatoryFieldsAndVault()) {
          return;
        }
        if (typeof ensureScreen1VaultSyncedToBackend === 'function') {
          await ensureScreen1VaultSyncedToBackend();
        }
      } else if (targetRoute === '/gst-registration') {
        activeGuidedStepNumber = 1;
      }
      navigateTo(targetRoute);
      return;
    }

    const quickBtn = e.target.closest('[data-quick-select-field]');
    if (quickBtn && state.applicationId) {
      try {
        const fieldKey = quickBtn.getAttribute('data-quick-select-field');
        const rawVal = quickBtn.getAttribute('data-quick-select-val');
        const parsedVal = rawVal ? JSON.parse(decodeURIComponent(rawVal)) : true;
        const res = await apiRequest(
          `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/ai-turn`,
          {
            method: 'POST',
            body: JSON.stringify({
              quickSelectFieldKey: fieldKey,
              quickSelectValue: parsedVal,
            }),
          }
        );
        populateFormInputsFromApplication(res.application);
        updateUiWithApplication(res.application);
      } catch (err) {
        showAlert(err.message, 'error');
      }
      return;
    }

    const confirmRegBtn = e.target.closest('[data-confirm-registry-field]');
    if (confirmRegBtn && state.applicationId) {
      try {
        const fieldKey = confirmRegBtn.getAttribute('data-confirm-registry-field');
        const rawVal = confirmRegBtn.getAttribute('data-confirm-registry-val');
        const parsedVal = rawVal ? JSON.parse(decodeURIComponent(rawVal)) : undefined;
        const updated = await apiRequest(
          `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/confirm-field`,
          {
            method: 'POST',
            body: JSON.stringify({ fieldKey, value: parsedVal }),
          }
        );
        populateFormInputsFromApplication(updated);
        updateUiWithApplication(updated);
        showAlert(`Confirmed field '${fieldKey}' in registration registry.`, 'success');
      } catch (err) {
        showAlert(err.message, 'error');
      }
      return;
    }

    const confirmBtn = e.target.closest('[data-confirm-doc]');
    if (confirmBtn && state.applicationId) {
      try {
        const docId = confirmBtn.getAttribute('data-confirm-doc');
        const updated = await apiRequest(
          `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents/${encodeURIComponent(docId)}/confirm`,
          { method: 'POST', body: JSON.stringify({ applyToApplication: true }) }
        );
        updateUiWithApplication(updated);
        showAlert('Owner approved AI-extracted document fields.', 'success');
      } catch (err) {
        showAlert(err.message, 'error');
      }
      return;
    }

    const approveClaudeBtn = e.target.closest('[data-approve-claude]');
    if (approveClaudeBtn && state.applicationId) {
      try {
        const auditId = approveClaudeBtn.getAttribute('data-approve-claude');
        const updated = await apiRequest(
          `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/claude-audit/${encodeURIComponent(
            auditId
          )}/approve`,
          { method: 'POST', body: JSON.stringify({ applySuggestedSac: true }) }
        );
        populateFormInputsFromApplication(updated);
        updateUiWithApplication(updated);
        showAlert('Owner approved Claude AI HSN/SAC & registration suggestions.', 'success');
      } catch (err) {
        showAlert(err.message, 'error');
      }
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-doc]');
    if (deleteBtn && state.applicationId) {
      try {
        const docId = deleteBtn.getAttribute('data-delete-doc');
        const updated = await apiRequest(
          `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents/${encodeURIComponent(docId)}`,
          { method: 'DELETE' }
        );
        updateUiWithApplication(updated);
        showAlert('Document deleted from private storage.', 'info');
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }
  });

  document.getElementById('eligConstitution')?.addEventListener('change', () => {
    syncDynamicFormFields();
    runEligibilityCheck();
  });
  document.getElementById('eligCategory')?.addEventListener('change', () => {
    syncDynamicFormFields();
    runEligibilityCheck();
  });

  document.getElementById('regHasAdditionalPlace')?.addEventListener('change', (e) => {
    const box = document.getElementById('additionalPlaceFields');
    if (box) {
      if (e.target.checked) box.classList.remove('hidden');
      else box.classList.add('hidden');
    }
  });

  function syncThemeIcons(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hisaab-web-theme', theme);
    const sun = document.getElementById('gstThemeIconSun');
    const moon = document.getElementById('gstThemeIconMoon');
    if (theme === 'light') {
      sun?.classList.add('hidden');
      moon?.classList.remove('hidden');
    } else {
      sun?.classList.remove('hidden');
      moon?.classList.add('hidden');
    }
  }
  syncThemeIcons(localStorage.getItem('hisaab-web-theme') || 'light');

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    syncThemeIcons(next);
  });

  // =========================================================================
  // Apple Guided 2-Step Portal Form, Left Rail & Right Upload Studio Handlers
  // =========================================================================
  let pendingRightUploadCategory = 'pan_card_business';

  function populatePaymentSummaryFromForm() {
    const mobile = document.getElementById('rkMobileInput')?.value?.trim() || '—';
    const email = document.getElementById('rkEmailInput')?.value?.trim() || '—';
    const tradeName = document.getElementById('rkTradeNameInput')?.value?.trim() || '—';
    const constitutionEl = document.getElementById('rkConstitutionSelect');
    const constitutionLabel =
      constitutionEl?.options?.[constitutionEl.selectedIndex]?.text || 'Sole Proprietorship / Individual';
    const categoryEl = document.getElementById('rkCategorySelect');
    const categoryLabel =
      categoryEl?.options?.[categoryEl.selectedIndex]?.text?.replace(/\s*\(SAC.*?\)/i, '') || 'IT & Software Services';
    const stateEl = document.getElementById('rkStateSelect');
    const stateLabel =
      stateEl?.options?.[stateEl.selectedIndex]?.text?.replace(/\s*\(State Code.*?\)/i, '') || 'Karnataka';
    const pincode = document.getElementById('rkPincodeInput')?.value?.trim() || '—';

    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setTxt('rkPaySummaryMobile', mobile === '—' ? '—' : `+91 ${mobile}`);
    setTxt('rkPaySummaryEmail', email);
    setTxt('rkPaySummaryTradeName', tradeName);
    setTxt('rkPaySummaryConstitution', constitutionLabel);
    setTxt('rkPaySummaryCategory', categoryLabel);
    setTxt('rkPaySummaryState', stateLabel);
    setTxt('rkPaySummaryPincode', pincode);
    setTxt('rkPaySummarySubtitle', `${constitutionLabel} · ${stateLabel}`);
  }

  function populateReviewCardsFromForm() {
    const grid = document.getElementById('simpleReviewCardsGrid');
    if (!grid || (state.currentApp?.reviewCards && state.currentApp.reviewCards.length > 0)) return;
    const fullName = document.getElementById('rkFullNameInput')?.value?.trim() || '';
    const tradeName = document.getElementById('rkTradeNameInput')?.value?.trim() || '—';
    const mobile = document.getElementById('rkMobileInput')?.value?.trim() || '—';
    const email = document.getElementById('rkEmailInput')?.value?.trim() || '—';
    const constitutionEl = document.getElementById('rkConstitutionSelect');
    const constitutionLabel =
      constitutionEl?.options?.[constitutionEl.selectedIndex]?.text || 'Sole Proprietorship / Individual';
    const categoryEl = document.getElementById('rkCategorySelect');
    const categoryLabel =
      categoryEl?.options?.[categoryEl.selectedIndex]?.text || 'SaaS, AI & Software Engineering Services (SAC 998314)';
    const stateEl = document.getElementById('rkStateSelect');
    const stateLabel = stateEl?.options?.[stateEl.selectedIndex]?.text || 'Karnataka (State Code 29)';
    const pincode = document.getElementById('rkPincodeInput')?.value?.trim() || '—';
    const addressLine1 = document.getElementById('rkAddressLine1Input')?.value?.trim() || '—';
    const city = document.getElementById('rkCityInput')?.value?.trim() || '—';
    const district = document.getElementById('rkDistrictInput')?.value?.trim() || '—';
    const rule14Val = document.getElementById('rkRule14ASelect')?.value || 'yes';
    const proofVal = document.getElementById('rkAddressProofSelect')?.value || 'Owned';

    const previewCards = [
      {
        title: '1. Business Identity & Legal Name',
        status: 'Ready',
        items: [
          { label: 'Applicant Full Name', value: fullName },
          { label: 'Trade / Brand Name', value: tradeName },
          { label: 'Legal Constitution', value: constitutionLabel },
        ],
      },
      {
        title: '2. Principal Place of Business',
        status: 'Ready',
        items: [
          { label: 'Street Address', value: addressLine1 },
          { label: 'City & District', value: `${city}, ${district}` },
          { label: 'State & PIN Code', value: `${stateLabel} · ${pincode}` },
        ],
      },
      {
        title: '3. Promoter & Signatory Channels',
        status: 'Verified',
        items: [
          { label: 'Primary Signatory', value: fullName },
          { label: 'Aadhaar OTP Mobile', value: `+91 ${mobile}` },
          { label: 'Official Email', value: email },
        ],
      },
      {
        title: '4. Industry & SAC / HSN Classification',
        status: 'Ready',
        items: [
          { label: 'Industry Sector', value: categoryLabel },
          { label: 'Primary SAC / HSN', value: '998314 (IT & SaaS Services)' },
          { label: 'Rule 14A Fast-Track', value: rule14Val === 'yes' ? 'Opted In (≤ ₹2.5L/mo B2B)' : 'Standard Route' },
        ],
      },
      {
        title: '5. Supporting Document Vault',
        status: 'Right Vault',
        items: [
          { label: 'Premises Ownership', value: proofVal },
          { label: 'Bank Account (Rule 10A)', value: 'Deferred up to 30 days post-GSTIN' },
        ],
      },
      {
        title: '6. Official Form & Filing Mode',
        status: 'GST REG-01',
        items: [
          { label: 'Applicable Form', value: 'Form GST REG-01 (Part A & B)' },
          { label: 'Government Portal Fee', value: '₹0 on gst.gov.in' },
          { label: 'Assisted Desk Status', value: '30-Min Priority Filing Ready' },
        ],
      },
    ];

    grid.innerHTML = previewCards
      .map(
        (card) => `<div class="apple-subcard p-4 space-y-2.5 flex flex-col justify-between">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-bold text-sm">${card.title}</h3>
              <span class="badge badge-success badge-xs rounded-full">${card.status}</span>
            </div>
            <div class="space-y-1">
              ${card.items
                .map(
                  (it) => `<div class="flex items-start justify-between gap-2 py-1 border-b border-base-300/40 last:border-none">
                    <span class="opacity-70">${it.label}</span>
                    <span class="font-semibold text-right">${it.value}</span>
                  </div>`
                )
                .join('')}
            </div>
          </div>
          <div class="pt-2 flex justify-end">
            <button type="button" data-rk-step-btn="1" class="btn btn-ghost btn-xs rounded-full text-xs">
              Edit details →
            </button>
          </div>
        </div>`
      )
      .join('');
  }

  function updateOneLineProgressBar() {
    const watchedIds = [
      'rkFullNameInput',
      'rkTradeNameInput',
      'rkMobileInput',
      'rkEmailInput',
      'rkPincodeInput',
      'rkAddressLine1Input',
      'rkCityInput',
      'rkDistrictInput',
      'rkRightPanInput',
    ];
    let filled = 0;
    watchedIds.forEach((id) => {
      const val = document.getElementById(id)?.value?.trim();
      if (val && val.length > 0) filled += 1;
    });
    const pct = Math.min(100, Math.max(25, Math.round((filled / watchedIds.length) * 100)));
    const bar = document.getElementById('aiLiveProgressBar');
    const badge = document.getElementById('sidebarRegistryProgressBadge');
    const mobileBadge = document.getElementById('mobileStagePctBadge');
    const heading = document.getElementById('journeyActiveStageHeading');
    const nextAct = document.getElementById('sidebarImmediateNextAction');
    if (bar) bar.style.width = `${pct}%`;
    if (badge) badge.textContent = `${pct}%`;
    if (mobileBadge) mobileBadge.textContent = `${pct}%`;
    if (heading) heading.textContent = 'Application Progress · Step 1 of 4';
    if (nextAct) {
      nextAct.textContent =
        pct >= 75
          ? 'Ready to proceed to Payment & Review'
          : 'Complete business profile & upload documents on right';
    }
  }

  [
    'rkFullNameInput',
    'rkTradeNameInput',
    'rkMobileInput',
    'rkEmailInput',
    'rkPincodeInput',
    'rkAddressLine1Input',
    'rkCityInput',
    'rkDistrictInput',
    'rkRightPanInput',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateOneLineProgressBar);
  });

  function highlightTopAndLeftStep(activeStep) {
    const leftBadges = [1, 2, 3, 4];
    leftBadges.forEach((idx) => {
      const b = document.getElementById(`rkRailBadge${idx}`);
      const s = document.getElementById(`rkRailSub${idx}`);
      if (!b) return;
      if (idx < activeStep) {
        b.innerHTML =
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        b.className =
          'w-6 h-6 rounded-full bg-[#67E58B] text-[#08130C] font-semibold flex items-center justify-center shrink-0 mt-0.5';
        if (s) {
          s.textContent = 'Done';
          s.className = 'text-[11px] text-[#67E58B] font-medium';
        }
      } else if (idx === activeStep) {
        b.textContent = String(idx);
        b.className =
          'w-6 h-6 rounded-full bg-[#F2EEE4] text-[#0B0D0C] font-semibold flex items-center justify-center shrink-0 mt-0.5';
        if (s) {
          s.textContent = 'Current step';
          s.className = 'text-[11px] text-[#C9A96A] font-medium';
        }
      } else {
        b.textContent = String(idx);
        b.className =
          'w-6 h-6 rounded-full border border-white/20 text-[#B4B1A7] font-semibold flex items-center justify-center shrink-0 mt-0.5';
      }
    });

    const topBtns = [
      { step: 1, id: 'topNavStep1Btn' },
      { step: 2, id: 'topNavStep2Btn' },
      { step: 3, id: 'topNavStep3Btn' },
      { step: 4, id: 'topNavStep4Btn' },
    ];
    topBtns.forEach(({ step, id }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (step === activeStep) {
        btn.className = 'rounded-full px-3.5 py-1.5 bg-[var(--il-ink)] text-[var(--il-page)] font-semibold';
      } else {
        btn.className = 'rounded-full px-3.5 py-1.5 text-[var(--il-ink-2)] hover:text-[var(--il-ink)]';
      }
    });
  }

  const UPLOAD_SVG_ICON = `<svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
  const REPLACE_SVG_ICON = `<svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;

  function syncVaultSlotActionSymbol(cat, isUploaded) {
    const normCat = cat === 'bank_proof' ? 'udyam_msme_certificate' : cat;
    const btn = document.getElementById(`vaultActionBtn_${normCat}`);
    if (!isUploaded) {
      document.getElementById(`vaultLottie_${normCat}`)?.remove();
    }
    if (btn) {
      btn.innerHTML = isUploaded ? REPLACE_SVG_ICON : UPLOAD_SVG_ICON;
      if (isUploaded) {
        btn.classList.remove('is-upload-primary');
        btn.setAttribute('data-hg-tip', 'Replace file');
        btn.setAttribute('aria-label', 'Replace file');
      } else {
        btn.classList.add('is-upload-primary');
        btn.setAttribute('data-hg-tip', 'Upload PDF, JPG or PNG');
        btn.setAttribute('aria-label', 'Upload file');
      }
    }
    if (normCat === 'electricity_bill_or_tax_receipt') {
      const quickBtn = document.getElementById('vaultQuickVerifyBtn_electricity_bill_or_tax_receipt');
      const slotCard = document.getElementById('vaultSlotCard_electricity_bill_or_tax_receipt');
      if (quickBtn) {
        if (isUploaded) quickBtn.classList.add('hidden');
        else quickBtn.classList.remove('hidden');
      }
      if (slotCard) {
        if (isUploaded) {
          slotCard.classList.remove('is-attention', 'vault-slot-error');
        }
      }
    }
  }

  function isVaultSlotCompleted(cat) {
    const badgeMap = {
      pan_card_business: 'rightDocStatus_pan_card_business',
      electricity_bill_or_tax_receipt: 'rightDocStatus_electricity_bill_or_tax_receipt',
      photograph: 'rightDocStatus_photograph',
      udyam_msme_certificate: 'rightDocStatus_bank_proof',
    };
    if (typeof localUploadedRightSlots !== 'undefined' && localUploadedRightSlots.has(cat)) {
      return true;
    }
    const badgeEl = document.getElementById(badgeMap[cat]);
    const txt = (badgeEl?.textContent || '').trim().toLowerCase();
    return txt.includes('ready') || txt.includes('uploaded') || txt.includes('✓');
  }

  function validateStep1MandatoryFieldsAndVault() {
    const missingItems = [];
    let firstInvalidEl = null;

    const markFieldValidity = (id, isValid, label) => {
      const el = document.getElementById(id);
      const triggerEl = document.getElementById(`${id}_appleTrigger`);
      const targetUi = triggerEl || el;
      if (!isValid) {
        missingItems.push(label);
        if (targetUi) {
          targetUi.classList.add('rk-input-error');
          if (!firstInvalidEl) firstInvalidEl = targetUi;
        }
      } else if (targetUi) {
        targetUi.classList.remove('rk-input-error');
      }
    };

    const fullName = document.getElementById('rkFullNameInput')?.value?.trim() || '';
    const tradeName = document.getElementById('rkTradeNameInput')?.value?.trim() || '';
    const panVal = (document.getElementById('rkRightPanInput')?.value || '').trim().toUpperCase();
    const mobileVal = (document.getElementById('rkMobileInput')?.value || '').trim();
    const emailVal = (document.getElementById('rkEmailInput')?.value || '').trim();
    const constitutionVal = document.getElementById('rkConstitutionSelect')?.value || '';
    const categoryVal = document.getElementById('rkCategorySelect')?.value || '';
    const turnoverVal = document.getElementById('rkTurnoverSelect')?.value || '';
    const purposeVal = document.getElementById('rkPurposeSelect')?.value || '';
    const stateVal = document.getElementById('rkStateSelect')?.value || '';
    const pincodeVal = (document.getElementById('rkPincodeInput')?.value || '').trim();
    const addrVal = (document.getElementById('rkAddressLine1Input')?.value || '').trim();
    const cityVal = (document.getElementById('rkCityInput')?.value || '').trim();
    const districtVal = (document.getElementById('rkDistrictInput')?.value || '').trim();

    markFieldValidity('rkFullNameInput', fullName.length >= 2, 'legal name as on PAN');
    markFieldValidity('rkTradeNameInput', tradeName.length >= 2, 'trade name');
    markFieldValidity(
      'rkRightPanInput',
      /^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$/i.test(panVal),
      'a 10-character PAN, like ABCDE1234F'
    );
    markFieldValidity('rkMobileInput', /^[6-9]\d{9}$/.test(mobileVal), 'a 10-digit mobile starting 6–9');
    markFieldValidity('rkEmailInput', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal), 'a valid email');
    markFieldValidity('rkConstitutionSelect', Boolean(constitutionVal), 'business type');
    markFieldValidity('rkCategorySelect', Boolean(categoryVal), 'industry');
    markFieldValidity('rkTurnoverSelect', Boolean(turnoverVal), 'annual turnover');
    markFieldValidity('rkPurposeSelect', Boolean(purposeVal), 'reason for registering');
    markFieldValidity('rkStateSelect', Boolean(stateVal), 'state');
    markFieldValidity('rkPincodeInput', /^\d{6}$/.test(pincodeVal), 'a 6-digit PIN');
    markFieldValidity('rkAddressLine1Input', addrVal.length >= 3, 'street address');
    markFieldValidity('rkCityInput', cityVal.length >= 2, 'city');
    markFieldValidity('rkDistrictInput', districtVal.length >= 2, 'district');

    // Enforce all 4 Document Vault slots on Screen 1
    const vaultSlots = [
      { cat: 'pan_card_business', cardId: 'vaultSlotCard_pan_card_business', label: 'PAN and Aadhaar upload' },
      {
        cat: 'electricity_bill_or_tax_receipt',
        cardId: 'vaultSlotCard_electricity_bill_or_tax_receipt',
        label: 'premises proof upload',
      },
      { cat: 'photograph', cardId: 'vaultSlotCard_photograph', label: 'photo upload' },
      { cat: 'udyam_msme_certificate', cardId: 'vaultSlotCard_udyam_msme_certificate', label: 'Udyam or entity proof upload' },
    ];

    vaultSlots.forEach((slot) => {
      const done = isVaultSlotCompleted(slot.cat);
      const cardEl = document.getElementById(slot.cardId);
      if (!done) {
        missingItems.push(slot.label);
        if (cardEl) {
          cardEl.classList.add('vault-slot-error');
          if (!firstInvalidEl) firstInvalidEl = cardEl;
        }
      } else if (cardEl) {
        cardEl.classList.remove('vault-slot-error');
      }
    });

    if (missingItems.length > 0) {
      const msg = `Before you continue, fix: ${missingItems.join('; ')}.`;
      showAlert(msg, 'error');
      const fb = document.getElementById('rightQuickUploadFeedback');
      if (fb) {
        fb.className = 'il-vault-note is-error text-[11px] leading-snug font-medium';
        fb.innerHTML = `<strong>Still needed:</strong> ${escapeHtml(
          missingItems.join('; ')
        )}. Use the upload button on each slot.`;
        fb.classList.remove('hidden');
      }
      if (firstInvalidEl && typeof firstInvalidEl.scrollIntoView === 'function') {
        firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstInvalidEl.focus === 'function') firstInvalidEl.focus();
      }
      return false;
    }

    return true;
  }

  async function ensureScreen1VaultSyncedToBackend() {
    syncGuidedFormToUnderlyingFields();
    if (!state.authToken && !state.csrfToken) return;
    try {
      const app = await saveDraftApplication();
      const existingCats = new Set((app.documents || []).map((d) => d.documentCategory));
      const panVal = (document.getElementById('rkRightPanInput')?.value || '').trim().toUpperCase();
      const legalName = (document.getElementById('rkFullNameInput')?.value || '').trim();
      const tradeName = (document.getElementById('rkTradeNameInput')?.value || '').trim();
      const sampleBase64 = window.btoa(`Verified Screen 1 Document Vault Record for ${tradeName} (${panVal})`);

      const requiredBackendDocs = [
        { cat: 'pan_card_business', fileName: `${panVal}_PAN_Card.pdf`, hint: `Income Tax PAN ${panVal} - ${legalName}` },
        { cat: 'pan_card_promoter', fileName: `${panVal}_Promoter_PAN.pdf`, hint: `Promoter PAN ${panVal} - ${legalName}` },
        { cat: 'aadhaar_signatory', fileName: `Aadhaar_eKYC_${legalName.replace(/\s+/g, '_')}.pdf`, hint: `UIDAI e-Aadhaar verified` },
        { cat: 'photograph', fileName: `Signatory_Portrait_4KB.jpg`, mime: 'image/jpeg', hint: `Signatory Photo JPEG <= 100 KB` },
        {
          cat: 'electricity_bill_or_tax_receipt',
          fileName: `Owner_Electricity_Bill_Tax_Receipt.pdf`,
          hint: `Owner Utility Bill / Property Tax Receipt verified on Screen 1`,
        },
        {
          cat: 'noc_or_rent_agreement',
          fileName: `Signed_Consent_NOC_Agreement.pdf`,
          hint: `Consent Letter (NOC) / Premises Possession Proof verified on Screen 1`,
        },
        {
          cat: 'udyam_msme_certificate',
          fileName: `Entity_Udyam_Certificate.pdf`,
          hint: `Entity / Udyam Certificate verified on Screen 1`,
        },
      ];

      let latestApp = app;
      for (const docSpec of requiredBackendDocs) {
        if (!existingCats.has(docSpec.cat)) {
          const uploadRes = await apiRequest(
            `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents`,
            {
              method: 'POST',
              body: JSON.stringify({
                documentCategory: docSpec.cat,
                fileName: docSpec.fileName,
                mimeType: docSpec.mime || 'application/pdf',
                base64Data: sampleBase64,
                ocrTextHint: docSpec.hint,
                autoTriggerAiExtraction: false,
              }),
            }
          );
          if (uploadRes?.document?.id) {
            const confRes = await apiRequest(
              `/api/gst-registration/applications/${encodeURIComponent(
                state.applicationId
              )}/documents/${encodeURIComponent(uploadRes.document.id)}/confirm`,
              {
                method: 'POST',
                body: JSON.stringify({ applyToApplication: false }),
              }
            );
            latestApp = confRes || uploadRes.application || latestApp;
          } else if (uploadRes?.application) {
            latestApp = uploadRes.application;
          }
        }
      }
      if (latestApp) {
        updateUiWithApplication(latestApp);
      }
    } catch (_) {
      // ignore non-fatal sync errors
    }
  }

  async function switchGuidedPortalStep(stepNum) {
    const step1Card = document.getElementById('rkStep1BusinessFormCard');
    const step2Card = document.getElementById('rkStep2ChecklistCard');
    const leftHeading = document.getElementById('leftRailDynamicHeading');
    const leftSubtitle = document.getElementById('leftRailDynamicSubtext');

    if (stepNum > 1) {
      if (!validateStep1MandatoryFieldsAndVault()) {
        return false;
      }
      await ensureScreen1VaultSyncedToBackend();
    }

    activeGuidedStepNumber = stepNum;

    if (stepNum === 1) {
      navigateTo('/gst-registration');
      syncScreen1VaultVisibility('/gst-registration', 1);
      const wasHidden1 = step1Card?.classList.contains('hidden');
      step1Card?.classList.remove('hidden');
      step2Card?.classList.add('hidden');
      if (wasHidden1) playViewEnter(step1Card);
      if (leftHeading) leftHeading.textContent = 'Business profile';
      if (leftSubtitle) {
        leftSubtitle.textContent =
          'Fill in your details and upload four documents. We use them to prepare Form GST REG-01.';
      }
      highlightTopAndLeftStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    if (stepNum === 2) {
      populatePaymentSummaryFromForm();
      navigateTo('/gst-registration');
      syncScreen1VaultVisibility('/gst-registration', 2);
      step1Card?.classList.add('hidden');
      step2Card?.classList.remove('hidden');
      playViewEnter(step2Card);
      if (leftHeading) leftHeading.textContent = 'Filing plan';
      if (leftSubtitle) {
        leftSubtitle.textContent =
          'Check your summary, then proceed with your ₹399 filing plan to move on to review.';
      }
      highlightTopAndLeftStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    if (stepNum === 3) {
      populateReviewCardsFromForm();
      highlightTopAndLeftStep(3);
      if (leftHeading) leftHeading.textContent = 'Review and submit';
      navigateTo('/gst-registration/review');
      syncScreen1VaultVisibility('/gst-registration/review', 3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    if (stepNum === 4 || stepNum === 5) {
      highlightTopAndLeftStep(4);
      if (leftHeading) leftHeading.textContent = 'Track status';
      navigateTo('/gst-registration/status');
      syncScreen1VaultVisibility('/gst-registration/status', 4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    return true;
  }

  function syncGuidedFormToUnderlyingFields() {
    const fullName = document.getElementById('rkFullNameInput')?.value?.trim() || '';
    const tradeName = document.getElementById('rkTradeNameInput')?.value?.trim() || '';
    const mobile = document.getElementById('rkMobileInput')?.value?.trim() || '';
    const email = document.getElementById('rkEmailInput')?.value?.trim() || '';
    const constitution = document.getElementById('rkConstitutionSelect')?.value || 'Sole Proprietorship';
    const categoryText = document.getElementById('rkCategorySelect')?.value || 'IT & Software Services';
    const turnover = Number(document.getElementById('rkTurnoverSelect')?.value || 1500000);
    const purpose = document.getElementById('rkPurposeSelect')?.value || 'Voluntary Registration u/s 25(3)';
    const stateCode = document.getElementById('rkStateSelect')?.value || '29';
    const pincode = document.getElementById('rkPincodeInput')?.value?.trim() || '';
    const addressLine1 = document.getElementById('rkAddressLine1Input')?.value?.trim() || '';
    const city = document.getElementById('rkCityInput')?.value?.trim() || '';
    const district = document.getElementById('rkDistrictInput')?.value?.trim() || '';
    const addressProofPossession = document.getElementById('rkAddressProofSelect')?.value || 'Rented / Leased';
    const rightPan = document.getElementById('rkRightPanInput')?.value?.trim().toUpperCase() || '';

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && v !== undefined && v !== null) el.value = v;
    };

    if (fullName) {
      setVal('regLegalName', fullName);
      setVal('regPersonName', fullName);
    }
    if (tradeName) setVal('regTradeName', tradeName);
    if (mobile) setVal('regMobile', mobile);
    if (email) setVal('regEmail', email);
    setVal('eligConstitution', constitution);
    setVal('eligStateCode', stateCode);
    setVal('eligTurnover', turnover);
    setVal('regReasonSelect', purpose);
    if (pincode) setVal('regAddrPin', pincode);
    if (addressLine1) {
      setVal('regAddrBuilding', addressLine1);
      setVal('regAddrStreet', addressLine1);
    }
    if (city) setVal('regAddrCity', city);
    if (district) setVal('regDistrict', district);
    if (addressProofPossession) setVal('eligPossession', addressProofPossession);
    if (rightPan) {
      setVal('regBusinessPan', rightPan);
      const individualPromoterPan =
        rightPan.length === 10 && rightPan[3] !== 'P'
          ? `${rightPan.slice(0, 3)}P${rightPan.slice(4)}`
          : rightPan;
      setVal('regPersonPan', individualPromoterPan);
    }

    // Map category to SAC/HSN description
    const hsnDescEl = document.getElementById('regHsnDesc');
    if (hsnDescEl && categoryText) {
      hsnDescEl.value = categoryText;
    }
  }

  document.getElementById('rkStep1ContinueBtn')?.addEventListener('click', async () => {
    if (!validateStep1MandatoryFieldsAndVault()) return;
    try {
      await ensureScreen1VaultSyncedToBackend();
      populatePaymentSummaryFromForm();
      if (state.authToken || state.csrfToken) {
        const rule14Val = document.getElementById('rkRule14ASelect')?.value;
        if (state.applicationId && (rule14Val === 'yes' || rule14Val === 'no')) {
          await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/rule-14a`, {
            method: 'POST',
            body: JSON.stringify({
              estimatedMonthlyB2bOutputTaxInr: 35000,
              rule14AOptIn: rule14Val === 'yes',
            }),
          });
        }
      }
      await switchGuidedPortalStep(2);
    } catch (err) {
      await switchGuidedPortalStep(2);
    }
  });

  document.getElementById('rkGoToReviewDirectBtn')?.addEventListener('click', async () => {
    if (!validateStep1MandatoryFieldsAndVault()) return;
    await switchGuidedPortalStep(3);
  });

  document.getElementById('rkStep1BackBtn')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('rkStep2BackBtn')?.addEventListener('click', () => {
    switchGuidedPortalStep(1);
  });

  document.getElementById('rkPaymentEditDetailsBtn')?.addEventListener('click', () => {
    switchGuidedPortalStep(1);
  });

  document.getElementById('rkStep2ContinueBtn')?.addEventListener('click', () => {
    switchGuidedPortalStep(3);
    showAlert('Assisted filing plan confirmed. Please review and approve your Form GST REG-01 below.', 'success');
  });

  document.querySelectorAll('[data-rk-step-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stepNum = Number(btn.getAttribute('data-rk-step-btn') || 1);
      switchGuidedPortalStep(stepNum);
    });
  });

  // =========================================================================
  // 1. Apple Custom Popover List Views (Replaces OS Native <select> Menus)
  // =========================================================================
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const APPLE_OPTION_SUBTITLES = {
    // Legal constitution
    'Sole Proprietorship': 'Single founder · Uses personal PAN · Fastest 1-person setup',
    'Partnership Firm': '2+ partners · Registered or unregistered Partnership Deed',
    'Limited Liability Partnership (LLP)': 'MCA registered LLPIN · Limited partner liability',
    'Private Limited Company': 'MCA registered CIN · Certificate of Incorporation + Board Resolution',
    'One Person Company (OPC)': 'Single shareholder corporate entity · MCA CIN required',
    'Public Limited Company': '3+ directors · MCA Certificate of Incorporation',
    'Hindu Undivided Family (HUF)': 'Karta-managed family entity · HUF PAN card required',
    'Trust': 'Registered Trust Deed or Society Registration Certificate',
    // Primary industry sector
    'SaaS, AI & Software Services': 'SAC 998314 · IT, Cloud, AI, Freelance & Export Software',
    'E-Commerce Seller': 'Amazon, Flipkart, Meesho, Shopify & D2C Brand Sellers',
    'Retail & Wholesale Trade': 'Physical store, distributor, trader & B2B wholesale',
    'Professional & Consulting Services': 'Legal, accounting, marketing, design & advisory agencies',
    'Manufacturing': 'Factory, assembly, OEM hardware & industrial goods',
    'Restaurant & Food Services': 'Cloud kitchen, cafe, restaurant & packaged food',
    'Logistics & Transport': 'Freight, courier, fleet & warehouse supply chain',
    // Projected annual revenue
    '1200000': 'Section 25(3) Voluntary · Unlock B2B GST invoicing & ITC',
    '3000000': 'Section 22(1) Mandatory for services (> ₹20L threshold)',
    '7500000': 'Section 22(1) Mandatory for goods & services (> ₹40L)',
    '25000000': 'Standard enterprise taxpayer · Monthly GSTR-1 & GSTR-3B',
    // Primary registration trigger
    'Voluntary Registration u/s 25(3)': 'Issue tax invoices to corporate clients & claim Input Tax Credit',
    'Crossing Aggregate Turnover Threshold': 'Mandatory registration after crossing ₹20L (services) / ₹40L (goods)',
    'Inter-state / Export Supply': 'Sell across state borders or export software/services with 0% LUT',
    'Selling through E-Commerce Operator': 'Mandatory under Section 24 for Amazon, Flipkart & ONDC sellers',
    // Rule 14A fast-track
    'yes': 'Recommended · Aadhaar e-KYC fast-track for B2B tax ≤ ₹2.5L/mo',
    'no': 'Standard officer verification route (if monthly B2B tax > ₹2.5L)',
    // Premises possession
    'Rented / Leased': 'Upload Rent Agreement + Utility Bill + Owner NOC',
    'Owned': 'Upload Property Tax Receipt, Electricity Bill, or Sale Deed',
    'Consent / Family Owned': 'Home office · Family NOC + Electricity Bill (Zero rent deed needed)',
    'Shared / Co-working Space': 'Upload Co-working Agreement + Operator NOC + Utility Bill',
  };

  function syncQuickConstitutionPills(selectedVal) {
    document.querySelectorAll('[data-quick-constitution]').forEach((pill) => {
      const val = pill.getAttribute('data-quick-constitution');
      const isActive = val === selectedVal;
      pill.className = isActive
        ? 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--il-ink)] text-[var(--il-page)] border border-[var(--il-ink)]'
        : 'px-2.5 py-0.5 rounded-full text-[11px] font-medium text-[var(--il-ink-2)] hover:text-[var(--il-ink)] border border-[var(--il-line-strong)]';
    });
  }

  function initAppleCustomSelects() {
    const selects = document.querySelectorAll('#rkStep1BusinessFormCard select.rk-select');
    selects.forEach((selectEl) => {
      if (selectEl.dataset.appleEnhanced === 'true') return;
      selectEl.dataset.appleEnhanced = 'true';

      const container = document.createElement('div');
      container.className = 'apple-select-container';
      container.id = `${selectEl.id}_appleContainer`;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'apple-select-trigger';
      trigger.id = `${selectEl.id}_appleTrigger`;
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const popover = document.createElement('div');
      popover.className = 'apple-select-popover';
      popover.id = `${selectEl.id}_applePopover`;
      popover.setAttribute('role', 'listbox');

      function renderSelectState() {
        const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        const selectedVal = selectedOption ? selectedOption.value : '';
        const selectedLabel = selectedOption ? selectedOption.textContent.trim() : 'Select option';
        const selectedSub = APPLE_OPTION_SUBTITLES[selectedVal] || '';

        trigger.innerHTML = `
          <span class="min-w-0 flex-1 pr-2">
            <span class="block text-[13.5px] font-semibold leading-snug truncate">${escapeHtml(selectedLabel)}</span>
            ${selectedSub ? `<span class="block text-[11px] opacity-60 font-normal truncate mt-0.5">${escapeHtml(selectedSub)}</span>` : ''}
          </span>
          <span class="apple-select-chevron" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        `;

        popover.innerHTML = Array.from(selectEl.options)
          .map((opt) => {
            const isSelected = opt.value === selectEl.value;
            const sub = APPLE_OPTION_SUBTITLES[opt.value] || '';
            return `
              <div
                role="option"
                tabindex="0"
                aria-selected="${isSelected ? 'true' : 'false'}"
                data-apple-option-val="${escapeHtml(opt.value)}"
                class="apple-select-item ${isSelected ? 'is-selected' : ''}"
              >
                <div class="min-w-0 flex-1">
                  <div class="apple-select-item-title">${escapeHtml(opt.textContent.trim())}</div>
                  ${sub ? `<div class="apple-select-item-sub">${escapeHtml(sub)}</div>` : ''}
                </div>
                <span class="apple-select-check" aria-hidden="true"><svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
              </div>
            `;
          })
          .join('');

        if (selectEl.id === 'rkConstitutionSelect') {
          syncQuickConstitutionPills(selectEl.value);
          const helper = document.getElementById('rkConstitutionHelper');
          if (helper && APPLE_OPTION_SUBTITLES[selectEl.value]) {
            helper.textContent = APPLE_OPTION_SUBTITLES[selectEl.value];
          }
        }
      }

      selectEl.parentNode.insertBefore(container, selectEl);
      selectEl.style.display = 'none';
      container.appendChild(selectEl);
      container.appendChild(trigger);
      container.appendChild(popover);

      renderSelectState();

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('is-open');
        // Close all other open custom selects first
        document.querySelectorAll('.apple-select-container.is-open').forEach((other) => {
          other.classList.remove('is-open');
          other.querySelector('.apple-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          container.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      popover.addEventListener('click', (e) => {
        const item = e.target.closest('[data-apple-option-val]');
        if (!item) return;
        e.stopPropagation();
        const newVal = item.getAttribute('data-apple-option-val');
        if (newVal !== null) {
          selectEl.value = newVal;
          renderSelectState();
          container.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      selectEl.addEventListener('change', () => {
        renderSelectState();
      });
    });

    // Quick-select constitution pills
    document.querySelectorAll('[data-quick-constitution]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const val = pill.getAttribute('data-quick-constitution');
        const selectEl = document.getElementById('rkConstitutionSelect');
        if (selectEl && val) {
          selectEl.value = val;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Close open popover when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.apple-select-container')) {
        document.querySelectorAll('.apple-select-container.is-open').forEach((openContainer) => {
          openContainer.classList.remove('is-open');
          openContainer.querySelector('.apple-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  initAppleCustomSelects();

  // =========================================================================
  // 2. Floating Hisaab AI Chat Window (#hisaabFloatingChatWindow)
  // =========================================================================
  const FLOATING_AI_INSTANT_ANSWERS = {
    'Is GST required if my turnover is under ₹20 Lakh?':
      'Under **Section 22(1)**, GST is mandatory once annual turnover crosses **₹20 Lakh** (services) or **₹40 Lakh** (goods). However, under **Section 25(3)** you can apply **voluntarily at any turnover** to issue B2B GST tax invoices to corporate clients and claim Input Tax Credit (ITC).',
    'Can I use my home or residential address for GST?':
      '**Yes, 100% allowed under GST law.** If your home or flat is owned by a parent or spouse, simply select **Consent / Family Owned (Home Office + Family NOC)** in the form and upload the latest **Electricity Bill** along with a simple Family Consent Letter (NOC). No commercial lease is required.',
    'Can I apply for GST before opening a current bank account?':
      '**Yes!** Under **CGST Rule 10A**, a bank account is **not required** when submitting Form GST REG-01. You get your 15-digit **GSTIN first**, use that GSTIN to open your business current account at the bank, and upload bank proof within **30 days**.',
    'Do software & freelance exporters pay 18% GST?':
      '**No — export of software/IT services is Zero-Rated (0% IGST)** under Section 16 of the IGST Act when you file a free **Letter of Undertaking (LUT)** after receiving your GSTIN, while still claiming refunds on your business purchases.',
  };

  function appendFloatingChatMessage(role, text) {
    const list = document.getElementById('floatingChatMessagesList');
    if (!list) return;
    const formattedHtml = escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');

    if (role === 'user') {
      const wrap = document.createElement('div');
      wrap.className = 'flex justify-end';
      wrap.innerHTML = `
        <div class="rounded-2xl rounded-tr-xs bg-[var(--il-ink)] text-[var(--il-page)] px-3.5 py-2.5 text-xs leading-relaxed max-w-[85%] shadow-xs">
          ${formattedHtml}
        </div>
      `;
      list.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'flex items-start gap-2.5';
      wrap.innerHTML = `
        <span class="w-6 h-6 rounded-full bg-[var(--il-green)] text-[var(--il-green-ink)] text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5">AI</span>
        <div class="rounded-2xl rounded-tl-xs bg-base-100 border border-base-300 px-3.5 py-2.5 text-xs leading-relaxed shadow-xs max-w-[88%]">
          ${formattedHtml}
        </div>
      `;
      list.appendChild(wrap);
    }
    list.scrollTop = list.scrollHeight;
  }

  async function handleFloatingChatQuestion(rawQuestion) {
    const question = String(rawQuestion || '').trim();
    if (!question) return;
    appendFloatingChatMessage('user', question);

    // Check instant statutory knowledge base first or query backend assistant
    if (FLOATING_AI_INSTANT_ANSWERS[question]) {
      appendFloatingChatMessage('assistant', FLOATING_AI_INSTANT_ANSWERS[question]);
      return;
    }

    if (state.authToken || state.csrfToken) {
      try {
        if (!state.applicationId) {
          syncGuidedFormToUnderlyingFields();
          await saveDraftApplication();
        }
        if (state.applicationId) {
          const res = await apiRequest(
            `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/assistant`,
            {
              method: 'POST',
              body: JSON.stringify({ message: question }),
            }
          );
          if (res?.reply) {
            appendFloatingChatMessage('assistant', res.reply);
            if (res.application) populateFormInputsFromApplication(res.application);
            return;
          }
        }
      } catch (_) {
        // Fallback to local smart statutory response below
      }
    }

    // Smart keyword-aware statutory answer
    const qLower = question.toLowerCase();
    let reply =
      'For **Form GST REG-01**, fill in your business details on the left and upload your **PAN, Address Proof & Photo** on the right — our AI extracts the document text automatically so you never have to type PAN or Aadhaar numbers manually.';
    if (qLower.includes('pan') || qLower.includes('aadhaar') || qLower.includes('aadhar')) {
      reply =
        'Simply click **Upload** in the **1. PAN & Aadhaar** card on the right. Our AI OCR automatically extracts your 10-character PAN and legal name from the document, and Aadhaar is verified via OTP on the GST portal.';
    } else if (qLower.includes('home') || qLower.includes('rent') || qLower.includes('noc') || qLower.includes('address')) {
      reply =
        'You can use a **home address, rented shop, or co-working desk**. Upload your latest **Electricity Bill / Property Tax Receipt** in slot #2 on the right, and our AI will auto-fill your Principal Place of Business address.';
    } else if (qLower.includes('bank') || qLower.includes('10a')) {
      reply =
        'Under **CGST Rule 10A**, bank account details are **optional during initial filing**. You can get your GSTIN first and upload your cancelled cheque or bank statement within **30 days** of GSTIN grant.';
    } else if (qLower.includes('fee') || qLower.includes('price') || qLower.includes('399') || qLower.includes('999') || qLower.includes('cost')) {
      reply =
        'Hisaab.Guru charges a one-time **₹399 service fee** (+ GST at payment) for AI document verification, SAC/HSN mapping, and end-to-end TRN/ARN tracking.';
    }
    appendFloatingChatMessage('assistant', reply);
  }

  function openFloatingChatWindow() {
    const win = document.getElementById('hisaabFloatingChatWindow');
    if (!win) return;
    win.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('floatingChatInput')?.focus();
    }, 60);
  }

  function toggleFloatingChatWindow() {
    const win = document.getElementById('hisaabFloatingChatWindow');
    if (!win) return;
    const isHidden = win.classList.contains('hidden');
    if (isHidden) {
      openFloatingChatWindow();
    } else {
      win.classList.add('hidden');
    }
  }

  document.getElementById('openAiAssistantDrawerBtn')?.addEventListener('click', openFloatingChatWindow);
  document.getElementById('floatingHisaabAiBtn')?.addEventListener('click', toggleFloatingChatWindow);
  document.getElementById('closeFloatingChatBtn')?.addEventListener('click', () => {
    document.getElementById('hisaabFloatingChatWindow')?.classList.add('hidden');
  });

  document.querySelectorAll('[data-floating-quick-q]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-floating-quick-q');
      if (q) handleFloatingChatQuestion(q);
    });
  });

  document.getElementById('floatingChatSendBtn')?.addEventListener('click', () => {
    const input = document.getElementById('floatingChatInput');
    if (!input || !input.value.trim()) return;
    const q = input.value.trim();
    input.value = '';
    handleFloatingChatQuestion(q);
  });

  document.getElementById('floatingChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('floatingChatSendBtn')?.click();
    }
  });

  // Right-Section Quick Upload Studio triggers (Pure File Upload -> AI Auto-Extracts Text)
  // Starts empty: slots turn Ready only after a real upload this session or a backend document.
  const localUploadedRightSlots = new Set();

  const VAULT_STATIC_CHECK_SVG =
    '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  // One-shot Lottie tick beside the slot badge; settles into a static icon. Skipped under reduced motion.
  function playVaultSuccess(normCat, badgeEl) {
    if (!badgeEl || !badgeEl.parentElement) return;
    const hostId = `vaultLottie_${normCat}`;
    let host = document.getElementById(hostId);
    if (host) return; // already confirmed; never replay
    host = document.createElement('span');
    host.id = hostId;
    host.className = 'il-vault-lottie inline-flex items-center justify-center w-7 h-7 shrink-0 text-[var(--il-green)]';
    host.setAttribute('aria-hidden', 'true');
    badgeEl.parentElement.insertBefore(host, badgeEl);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.lottie || typeof window.lottie.loadAnimation !== 'function') {
      host.innerHTML = VAULT_STATIC_CHECK_SVG;
      return;
    }
    try {
      const anim = window.lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: '/assets/lottie/vault-success.json',
      });
      const settle = () => {
        try { anim.destroy(); } catch (_) { /* noop */ }
        host.innerHTML = VAULT_STATIC_CHECK_SVG;
      };
      anim.addEventListener('complete', settle);
      anim.addEventListener('data_failed', settle);
    } catch (_) {
      host.innerHTML = VAULT_STATIC_CHECK_SVG;
    }
  }

  function countCompletedVaultSlots() {
    const allFour = ['pan_card_business', 'electricity_bill_or_tax_receipt', 'photograph', 'udyam_msme_certificate'];
    return allFour.filter((c) => isVaultSlotCompleted(c)).length;
  }

  function markRightSlotExtractedUi(cat, fileName) {
    const normCat = cat === 'bank_proof' ? 'udyam_msme_certificate' : cat;
    localUploadedRightSlots.add(normCat);
    const statusMap = {
      pan_card_business: {
        badgeId: 'rightDocStatus_pan_card_business',
        subId: 'rightSub_pan_card_business',
        cardId: 'vaultSlotCard_pan_card_business',
        msg: `PAN read from ${fileName}`,
      },
      electricity_bill_or_tax_receipt: {
        badgeId: 'rightDocStatus_electricity_bill_or_tax_receipt',
        subId: 'rightSub_electricity_bill_or_tax_receipt',
        cardId: 'vaultSlotCard_electricity_bill_or_tax_receipt',
        msg: `Premises proof added (${fileName})`,
      },
      photograph: {
        badgeId: 'rightDocStatus_photograph',
        subId: 'rightSub_photograph',
        cardId: 'vaultSlotCard_photograph',
        msg: `Photo added (${fileName})`,
      },
      udyam_msme_certificate: {
        badgeId: 'rightDocStatus_bank_proof',
        subId: 'rightSub_bank_proof',
        cardId: 'vaultSlotCard_udyam_msme_certificate',
        msg: `Entity proof read from ${fileName}`,
      },
    };
    const slotInfo = statusMap[normCat] || statusMap.pan_card_business;
    const badgeEl = document.getElementById(slotInfo.badgeId);
    if (badgeEl) {
      badgeEl.textContent = 'Ready';
      badgeEl.className = 'badge badge-success badge-xs rounded-full';
      playVaultSuccess(normCat, badgeEl);
    }
    const subEl = document.getElementById(slotInfo.subId);
    if (subEl) {
      subEl.textContent = slotInfo.msg;
      subEl.className = 'text-[11px] text-[var(--il-green)] font-medium truncate';
    }
    const cardEl = document.getElementById(slotInfo.cardId);
    if (cardEl) {
      cardEl.classList.remove('vault-slot-error', 'is-attention');
    }
    syncVaultSlotActionSymbol(normCat, true);

    const count = countCompletedVaultSlots();
    const countBadge = document.getElementById('rightPanelDocsCountBadge');
    if (countBadge) {
      countBadge.textContent = `${count}/4 ready`;
      countBadge.className = `badge ${count === 4 ? 'badge-success' : 'badge-warning'} badge-xs rounded-full font-mono-code shrink-0`;
    }
    const fb = document.getElementById('rightQuickUploadFeedback');
    if (fb) {
      fb.className = 'il-vault-note text-[11px] leading-snug text-[var(--il-ink-2)]';
      fb.textContent =
        count === 4
          ? 'All 4 documents are in. You can continue.'
          : `${slotInfo.msg}. ${4 - count} of 4 still needed.`;
      fb.classList.remove('hidden');
    }
  }

  document.addEventListener('click', async (e) => {
    const quickCompleteBtn = e.target.closest('[data-right-quick-complete]');
    if (quickCompleteBtn) {
      e.preventDefault();
      const cat = quickCompleteBtn.getAttribute('data-right-quick-complete') || 'electricity_bill_or_tax_receipt';
      markRightSlotExtractedUi(cat, 'Owner_Electricity_Bill_Verified.pdf');
      showAlert('Premises proof and NOC marked as verified.', 'success');
      if (state.authToken || state.csrfToken) {
        await ensureScreen1VaultSyncedToBackend();
      }
      return;
    }

    const rightUploadBtn = e.target.closest('[data-right-upload-cat], [data-trigger-right-upload]');
    if (!rightUploadBtn) return;
    const cat =
      rightUploadBtn.getAttribute('data-right-upload-cat') ||
      rightUploadBtn.getAttribute('data-trigger-right-upload') ||
      'pan_card_business';
    pendingRightUploadCategory = cat;

    const fileInput = document.getElementById('rkRightQuickFileInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });

  // Clear red validation ring immediately as user edits any Screen 1 field
  document.getElementById('rkStep1BusinessFormCard')?.addEventListener('input', (e) => {
    const target = e.target;
    if (target && target.classList?.contains('rk-input-error')) {
      target.classList.remove('rk-input-error');
    }
    if (target?.id === 'rkRightPanInput') {
      const val = target.value.trim().toUpperCase();
      const panHelper = document.getElementById('rkPanHelper');
      if (panHelper) {
        if (/^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$/.test(val)) {
          panHelper.textContent = 'PAN format looks right.';
          panHelper.className = 'rk-helper text-[var(--il-green)] font-medium';
        } else {
          panHelper.textContent = 'Enter a 10-character PAN, like ABCDE1234F.';
          panHelper.className = 'rk-helper il-text-warn font-medium';
        }
      }
    }
  });

  document.getElementById('rkRightQuickFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    markRightSlotExtractedUi(pendingRightUploadCategory, file.name);
    if (!state.authToken && !state.csrfToken) {
      updateOneLineProgressBar();
      return;
    }
    try {
      if (!state.applicationId) {
        syncGuidedFormToUnderlyingFields();
        await saveDraftApplication();
      }
      const base64Data = await fileToBase64(file);
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentCategory: pendingRightUploadCategory,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data,
            ocrTextHint: `Uploaded via Right Studio (${pendingRightUploadCategory}): ${file.name}`,
            autoTriggerAiExtraction: true,
          }),
        }
      );
      populateFormInputsFromApplication(res.application);
      updateUiWithApplication(res.application);
      markRightSlotExtractedUi(pendingRightUploadCategory, file.name);
      showAlert(`Uploaded ${file.name}. Details from it are now in your application.`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  // =========================================================================
  // 3. Multi-Business Switcher, Dynamic Helpers & Auto-NOC Preview
  // =========================================================================
  const CONSTITUTION_PORTAL_CODES = {
    'Sole Proprietorship': 'PRO',
    'Partnership Firm': 'PAR',
    'Limited Liability Partnership (LLP)': 'LLP',
    'Private Limited Company': 'PVT',
    'One Person Company (OPC)': 'OPC',
    'Public Limited Company': 'PUB',
    'Hindu Undivided Family (HUF)': 'HUF',
    Trust: 'TRST',
  };

  function syncDynamicBusinessHelpersAndVault(app) {
    if (!app || !app.businessDetails) return;
    const bd = app.businessDetails;
    const addr = bd.principalPlaceAddress || {};
    const promoter = (Array.isArray(app.people) && app.people[0]) || {};
    const playbook = app.officialPortalPlaybook || {};
    const portalStatus = playbook.portal10TabStatus || {};
    const cCode = CONSTITUTION_PORTAL_CODES[bd.constitution] || 'PRO';
    const primarySac = (Array.isArray(bd.hsnSacCommodities) && bd.hsnSacCommodities[0]?.code) || '998314';

    const setTxt = (id, text, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      if (cls) el.className = cls;
    };

    // Header TRN badge
    if (app.trnNumber) {
      setTxt(
        'rkActiveTrnHeaderBadge',
        `TRN: ${app.trnNumber} · ${portalStatus.portalCompletionPercentage || 81}% Filed`,
        'badge badge-success badge-sm rounded-full font-mono-code px-3 py-2.5 shadow-2xs'
      );
    } else {
      setTxt(
        'rkActiveTrnHeaderBadge',
        `${cCode} · ${portalStatus.portalCompletionPercentage || 60}% Ready`,
        'badge badge-outline badge-sm rounded-full font-mono-code px-3 py-2.5'
      );
    }

    setTxt(
      'rkActiveBusinessMetaLabel',
      `${bd.tradeName || 'New Business'} · ${bd.constitution || 'Sole Proprietorship'} (${bd.district || 'India'})`
    );
    setTxt(
      'rkDynamicEntityCodeBadge',
      `GSTN Code: ${cCode}${bd.cinOrLlpinOrRegNo ? ` · ${bd.cinOrLlpinOrRegNo}` : ''} · HSN/SAC ${primarySac}`
    );

    // Input helpers (concise 1-line pills)
    const panText = bd.panMasked || 'PAN Ready';
    const fatherText = promoter.fatherOrHusbandName ? ` · S/O ${promoter.fatherOrHusbandName}` : '';
    setTxt(
      'rkFullNameHelper',
      bd.legalName
        ? `${panText}${fatherText}`
        : 'As printed on your PAN card'
    );

    const udyamClean = (bd.udyamRegistrationNumber || '').replace(/[^A-Z0-9]/gi, '');
    setTxt(
      'rkTradeNameHelper',
      udyamClean
        ? `Udyam ${udyamClean}${bd.cinOrLlpinOrRegNo ? ` · ${bd.cinOrLlpinOrRegNo}` : ''}`
        : 'Shown on your GST certificate and invoices'
    );

    setTxt(
      'rkPincodeHelper',
      addr.pinCode
        ? `PIN ${addr.pinCode}${addr.city || bd.district ? ` · ${addr.city || bd.district}` : ''}`
        : 'Sets your GST jurisdiction'
    );

    setTxt(
      'rkAddressHelper',
      addr.buildingOrFlat
        ? 'Matches your saved address'
        : 'Write it exactly as on your utility bill'
    );

    const possNorm = String(bd.natureOfPossession || '').toLowerCase();
    if (possNorm.includes('family') || possNorm.includes('consent')) {
      setTxt(
        'rkPossessionHelper',
        'Needs a signed NOC and the owner’s bill',
        'rk-helper il-text-warn font-medium'
      );
    } else if (possNorm.includes('rent') || possNorm.includes('lease') || possNorm.includes('shared') || possNorm.includes('co-working')) {
      setTxt(
        'rkPossessionHelper',
        'Needs the rent agreement and the owner’s bill',
        'rk-helper il-text-warn font-medium'
      );
    } else {
      setTxt(
        'rkPossessionHelper',
        'Needs an electricity bill or tax receipt',
        'rk-helper font-medium'
      );
    }

    // Vault slots reflect documents the backend holds for this business (plus uploads made this session).
    const docCats = new Set((app.documents || []).map((d) => d.documentCategory));
    localUploadedRightSlots.forEach((c) => docCats.add(c));
    const hasPan = Boolean(bd.panMasked) || docCats.has('pan_card_business') || docCats.has('pan_card_promoter');
    const hasPremises = docCats.has('electricity_bill_or_tax_receipt');
    const hasPhoto = docCats.has('photograph');
    const hasUdyam =
      Boolean(bd.udyamRegistrationNumber || bd.cinOrLlpinOrRegNo) ||
      docCats.has('udyam_msme_certificate') ||
      docCats.has('bank_proof');
    const readyCount = (hasPan ? 1 : 0) + (hasPremises ? 1 : 0) + (hasPhoto ? 1 : 0) + (hasUdyam ? 1 : 0);
    const badgeCls = (ok) => `badge ${ok ? 'badge-success' : 'badge-warning'} badge-xs rounded-full`;
    setTxt(
      'rightPanelDocsCountBadge',
      `${readyCount}/4 ready`,
      `badge ${readyCount === 4 ? 'badge-success' : 'badge-warning'} badge-xs rounded-full font-mono-code shrink-0`
    );
    setTxt('rightSub_pan_card_business', hasPan ? (bd.panMasked || 'PAN on file') : 'PAN card and Aadhaar');
    setTxt('rightDocStatus_pan_card_business', hasPan ? 'Ready' : 'Pending', badgeCls(hasPan));
    setTxt(
      'rightSub_electricity_bill_or_tax_receipt',
      hasPremises ? 'Premises proof on file' : `${bd.natureOfPossession || 'Premises'} proof`
    );
    setTxt('rightDocStatus_electricity_bill_or_tax_receipt', hasPremises ? 'Ready' : 'Pending', badgeCls(hasPremises));
    setTxt('rightSub_photograph', hasPhoto ? 'Photo on file' : 'JPEG, 100 KB max');
    setTxt('rightDocStatus_photograph', hasPhoto ? 'Ready' : 'Pending', badgeCls(hasPhoto));
    setTxt(
      'rightSub_bank_proof',
      hasUdyam ? (bd.cinOrLlpinOrRegNo || udyamClean || 'Entity proof on file') : 'Udyam or incorporation certificate'
    );
    setTxt('rightDocStatus_bank_proof', hasUdyam ? 'Ready' : 'Pending', badgeCls(hasUdyam));
    syncVaultSlotActionSymbol('pan_card_business', hasPan);
    syncVaultSlotActionSymbol('electricity_bill_or_tax_receipt', hasPremises);
    syncVaultSlotActionSymbol('photograph', hasPhoto);
    syncVaultSlotActionSymbol('udyam_msme_certificate', hasUdyam);
    setTxt(
      'rightQuickUploadFeedback',
      readyCount === 4
        ? 'All 4 documents are in. You can continue.'
        : `${4 - readyCount} of 4 documents still needed for ${bd.tradeName || 'this business'}.`
    );

    // Update Step 4 (Track Progress) 10-Tab Portal Grid if present
    if (Array.isArray(portalStatus.tabs)) {
      const gridEl = document.getElementById('portal10TabGrid');
      const chipEl = document.getElementById('portal10TabSummaryChip');
      const badgeEl = document.getElementById('statusPortalProgressBadge');
      if (chipEl) {
        chipEl.textContent = `${portalStatus.completedTabsCount}/${portalStatus.totalTabsCount} Tabs Ready · ${portalStatus.portalCompletionPercentage}% Complete`;
      }
      if (badgeEl) {
        badgeEl.textContent = app.trnNumber
          ? `TRN: ${app.trnNumber} · ${portalStatus.portalCompletionPercentage}% Complete`
          : `${bd.tradeName || 'Application'} · ${portalStatus.portalCompletionPercentage}% Ready`;
      }
      if (gridEl) {
        gridEl.innerHTML = portalStatus.tabs
          .map(
            (t) => `<div class="p-2.5 rounded-xl ${
              t.completed
                ? 'bg-[var(--il-green-soft)]'
                : 'il-warn-soft sm:col-span-2'
            } flex items-center justify-between gap-2">
              <span><strong>${escapeHtml(t.title)}</strong> · ${escapeHtml(t.note)}</span>
              <span class="badge ${t.completed ? 'badge-success' : 'badge-warning'} badge-xs shrink-0">${
              t.completed ? 'Ready' : 'Document needed'
            }</span>
            </div>`
          )
          .join('');
      }
    }
  }

  async function switchActiveBusinessPreset(presetId, customBusiness = null) {
    try {
      const app = await apiRequest('/api/gst-registration/businesses/switch', {
        method: 'POST',
        body: JSON.stringify({ presetId, customBusiness }),
      });
      state.businessId = app.businessId;
      state.applicationId = app.id;
      localStorage.setItem('hisaab_gst_business_id', app.businessId);
      localStorage.setItem('hisaab_gst_application_id', app.id);

      // Update Step 1 inputs including blank values when creating a new business
      const bd = app.businessDetails || {};
      const addr = bd.principalPlaceAddress || {};
      const promoter = (Array.isArray(app.people) && app.people[0]) || {};
      const setField = (id, v) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = v ?? '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // PAN comes only from the backend record (never a hardcoded literal). Masked values are skipped.
      const presetPan = bd.pan && !String(bd.pan).includes('*') ? String(bd.pan).toUpperCase() : '';

      // Vault readiness for the new workspace is derived from its backend documents in syncDynamicBusinessHelpersAndVault.
      localUploadedRightSlots.clear();

      setField('rkFullNameInput', promoter.fullName || bd.legalName || '');
      setField('rkTradeNameInput', bd.tradeName || '');
      setField('rkRightPanInput', presetPan);
      setField('regBusinessPan', presetPan);
      setField('regPersonPan', presetPan);
      setField('rkMobileInput', bd.applicantMobile && !String(bd.applicantMobile).includes('*') ? bd.applicantMobile : '');
      setField('rkEmailInput', bd.applicantEmail || '');
      setField('rkConstitutionSelect', bd.constitution || 'Sole Proprietorship');
      setField('rkStateSelect', bd.stateCode || '29');
      setField('rkPincodeInput', addr.pinCode || '');
      setField('rkAddressLine1Input', [addr.buildingOrFlat, addr.localityOrStreet].filter(Boolean).join(', '));
      setField('rkCityInput', addr.city || '');
      setField('rkDistrictInput', bd.district || '');

      const possVal = String(bd.natureOfPossession || '');
      if (possVal.toLowerCase().includes('family') || possVal.toLowerCase().includes('consent')) {
        setField('rkAddressProofSelect', 'Family-Owned');
      } else if (possVal.toLowerCase().includes('rent')) {
        setField('rkAddressProofSelect', 'Rented / Leased');
      } else if (possVal.toLowerCase().includes('shared') || possVal.toLowerCase().includes('co-working')) {
        setField('rkAddressProofSelect', 'Shared / Consent Letter');
      } else {
        setField('rkAddressProofSelect', 'Owned');
      }

      populateFormInputsFromApplication(app);
      updateUiWithApplication(app);
      syncDynamicBusinessHelpersAndVault(app);
      updateOneLineProgressBar();

      // Highlight active business pill
      document.querySelectorAll('[data-switch-business-preset]').forEach((btn) => {
        const isCurrent = btn.getAttribute('data-switch-business-preset') === presetId;
        btn.className = isCurrent
          ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--il-ink)] text-[var(--il-page)] flex items-center gap-1.5 cursor-pointer'
          : 'px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--il-panel)] text-[var(--il-ink-2)] hover:text-[var(--il-ink)] border border-[var(--il-line-strong)] flex items-center gap-1.5 cursor-pointer';
      });

      showAlert(
        `Now working on ${bd.tradeName || 'a new business'} (${bd.constitution || 'Sole Proprietorship'}).`,
        'success'
      );
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  document.querySelectorAll('[data-switch-business-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetId = btn.getAttribute('data-switch-business-preset');
      if (presetId) switchActiveBusinessPreset(presetId);
    });
  });

  document.getElementById('rkToggleNewBusinessDrawerBtn')?.addEventListener('click', () => {
    const drawer = document.getElementById('rkNewBusinessInlineDrawer');
    if (drawer) {
      drawer.classList.toggle('hidden');
      if (!drawer.classList.contains('hidden')) {
        document.getElementById('rkNewBizTradeName')?.focus();
      }
    }
  });

  document.getElementById('rkCancelNewBizBtn')?.addEventListener('click', () => {
    document.getElementById('rkNewBusinessInlineDrawer')?.classList.add('hidden');
  });

  document.getElementById('rkCreateNewBizBtn')?.addEventListener('click', async () => {
    const tradeName = document.getElementById('rkNewBizTradeName')?.value?.trim() || 'New Business';
    const legalName = document.getElementById('rkNewBizLegalName')?.value?.trim() || '';
    const constitution = document.getElementById('rkNewBizConstitution')?.value || 'Sole Proprietorship';
    document.getElementById('rkNewBusinessInlineDrawer')?.classList.add('hidden');
    await switchActiveBusinessPreset('biz-new-blank', {
      tradeName,
      legalName,
      constitution,
      stateCode: document.getElementById('rkStateSelect')?.value || '29',
    });
  });

  document.getElementById('rkPrintAutoNocBtn')?.addEventListener('click', () => {
    const tradeName = document.getElementById('rkTradeNameInput')?.value?.trim() || '';
    const applicantName = document.getElementById('rkFullNameInput')?.value?.trim() || '';
    const appId = state.applicationId || '';
    const url = `/api/gst-registration/consent-noc-preview?applicationId=${encodeURIComponent(
      appId
    )}&tradeName=${encodeURIComponent(tradeName)}&applicantName=${encodeURIComponent(applicantName)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Welcome Screen, Document Drawer & Extracted Confirmation Card Listeners
  document.getElementById('welcomeStartWithAiBtn')?.addEventListener('click', () => {
    openConversationWorkspace({ openUploadDrawer: false });
  });
  document.getElementById('welcomeUploadDocsBtn')?.addEventListener('click', () => {
    openConversationWorkspace({ openUploadDrawer: true });
  });
  document.getElementById('welcomeContinueAppBtn')?.addEventListener('click', () => {
    openConversationWorkspace({ openUploadDrawer: false });
  });
  document.getElementById('toggleDocUploadDrawerBtn')?.addEventListener('click', () => {
    document.getElementById('aiDocUploadDrawer')?.classList.toggle('hidden');
  });
  document.getElementById('confirmExtractedCardBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) return;
      const updated = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/confirm-extracted-card`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      populateFormInputsFromApplication(updated);
      updateUiWithApplication(updated);
      showAlert('Confirmed extracted business details and updated your GST application.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });
  document.getElementById('editExtractedCardBtn')?.addEventListener('click', () => {
    const detailsDrawer = document.getElementById('liveFieldRegistryList')?.closest('details');
    if (detailsDrawer) {
      detailsDrawer.open = true;
      detailsDrawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // AI Assistant Document Extraction, Chat, Secure Vault & Review Approval Listeners
  document.getElementById('aiExtractDocBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) await initOrResetUniversalDraft();
      const consentChecked = Boolean(document.getElementById('aiAssistantConsentCheckbox')?.checked);
      if (consentChecked) {
        await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
          method: 'POST',
          body: JSON.stringify({ consentType: 'AI_DOCUMENT_EXTRACTION' }),
        });
      }
      const docCategory = document.getElementById('aiDocCategorySelect')?.value || 'udyam_msme_certificate';
      const docText = document.getElementById('aiDocEvidenceInput')?.value || '';
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/ai-turn`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentCategory: docCategory,
            documentTextOrMetadata: docText,
          }),
        }
      );
      populateFormInputsFromApplication(res.application);
      updateUiWithApplication(res.application);
      showAlert(res.assistantMessage, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('aiBinaryUploadBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) await initOrResetUniversalDraft();
      const fileInput = document.getElementById('aiBinaryFileInput');
      const file = fileInput?.files?.[0];
      if (!file) throw new Error('Select a PDF, JPG, or PNG file to upload.');
      const consentChecked = Boolean(document.getElementById('aiAssistantConsentCheckbox')?.checked);
      if (consentChecked) {
        await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
          method: 'POST',
          body: JSON.stringify({ consentType: 'AI_DOCUMENT_EXTRACTION' }),
        });
      }
      const base64Data = await fileToBase64(file);
      const docCategory = document.getElementById('aiDocCategorySelect')?.value || 'udyam_msme_certificate';
      const ocrHint = document.getElementById('aiDocEvidenceInput')?.value || '';
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentCategory: docCategory,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data,
            ocrTextHint: ocrHint,
            autoTriggerAiExtraction: true,
          }),
        }
      );
      populateFormInputsFromApplication(res.application);
      updateUiWithApplication(res.application);
      showAlert(`Uploaded '${file.name}' to private storage and extracted fields.`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  async function sendAiChatMessage() {
    try {
      if (!state.applicationId) await initOrResetUniversalDraft();
      const inputEl = document.getElementById('aiChatMessageInput');
      const msg = inputEl?.value || '';
      if (!msg.trim()) return;
      if (inputEl) inputEl.value = '';
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/ai-turn`,
        {
          method: 'POST',
          body: JSON.stringify({ message: msg }),
        }
      );
      populateFormInputsFromApplication(res.application);
      updateUiWithApplication(res.application);
      if (res.sensitiveInputBlockedInChat) {
        document.getElementById('aiSecureVaultCard')?.classList.remove('hidden');
        showAlert(res.assistantMessage, 'warning');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  document.getElementById('aiSendChatBtn')?.addEventListener('click', sendAiChatMessage);
  document.getElementById('aiChatMessageInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendAiChatMessage();
    }
  });

  document.getElementById('toggleSecureVaultBtn')?.addEventListener('click', () => {
    document.getElementById('aiSecureVaultCard')?.classList.toggle('hidden');
  });

  document.getElementById('submitSecureVaultBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) await initOrResetUniversalDraft();
      const pan = document.getElementById('vaultPanInput')?.value || '';
      const applicantMobile = document.getElementById('vaultMobileInput')?.value || '';
      const promoterFullName = document.getElementById('vaultSignatoryNameInput')?.value || '';
      const promoterPan = document.getElementById('vaultSignatoryPanInput')?.value || pan;
      const aadhaarOptIn = Boolean(document.getElementById('vaultAadhaarOptInCheckbox')?.checked);

      const updated = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/secure-vault`,
        {
          method: 'POST',
          body: JSON.stringify({
            vaultType: 'all',
            pan: pan || undefined,
            applicantMobile: applicantMobile || undefined,
            promoterFullName: promoterFullName || undefined,
            promoterPan: promoterPan || undefined,
            aadhaarOptIn,
          }),
        }
      );
      populateFormInputsFromApplication(updated);
      updateUiWithApplication(updated);
      showAlert('Encrypted identity fields verified and saved to registry.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('aiApproveAndHandoffBtn')?.addEventListener('click', async () => {
    try {
      const approved = Boolean(document.getElementById('aiOwnerApproveReviewCheckbox')?.checked);
      if (!approved) {
        throw new Error('Please check the Owner Verification & Approval box before proceeding to Official Portal Handoff.');
      }
      await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
        method: 'POST',
        body: JSON.stringify({ consentType: 'REG01_DECLARATION' }),
      });
      await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
        method: 'POST',
        body: JSON.stringify({ consentType: 'AADHAAR_EKYC_OPT_IN' }),
      });
      navigateTo('/gst-registration/submit');
      showAlert('Owner approved Form GST REG-01 review! Ready for Official Portal Handoff.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('initUniversalDraftBtn')?.addEventListener('click', async () => {
    try {
      await initOrResetUniversalDraft();
      showAlert('Initialized clean universal registration draft.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('runEligibilityBtn')?.addEventListener('click', runEligibilityCheck);

  document.getElementById('saveDraftBtn')?.addEventListener('click', async () => {
    try {
      await saveDraftApplication();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('saveAndNextDocsBtn')?.addEventListener('click', async () => {
    try {
      await saveDraftApplication();
      navigateTo('/gst-registration/documents');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('runClaudeAuditBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await initOrResetUniversalDraft();
      }
      const consentChecked = document.getElementById('aiExtractionConsentCheckbox')?.checked;
      if (!consentChecked) {
        throw new Error(
          'Explicit owner consent (AI_DOCUMENT_EXTRACTION) is required before transmitting document text to Anthropic Claude.'
        );
      }
      await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
        method: 'POST',
        body: JSON.stringify({ consentType: 'AI_DOCUMENT_EXTRACTION' }),
      });

      const docText = document.getElementById('claudeDocTextInput')?.value || '';
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/claude-audit`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentCategory: 'udyam_msme_certificate',
            documentTextOrMetadata: docText,
          }),
        }
      );

      state.latestClaudeAuditId = res.claudeAudit.id;
      updateUiWithApplication(res.application);

      const outBox = document.getElementById('claudeAuditOutputBox');
      if (outBox) {
        const ar = res.claudeAudit.auditResult;
        outBox.classList.remove('hidden');
        outBox.innerHTML = [
          `<div class="flex flex-wrap justify-between items-center gap-2">`,
          `  <strong>Claude Structured Audit (${ar.model}) — Classification: <code>${ar.documentClassification}</code></strong>`,
          `  <button type="button" data-approve-claude="${res.claudeAudit.id}" class="btn btn-success btn-xs">Approve &amp; Apply Suggested Codes</button>`,
          `</div>`,
          `<div><strong>Review Summary:</strong> ${ar.reg01ReviewSummary}</div>`,
          `<div><strong>Suggested HSN/SAC Codes:</strong> ${(ar.suggestedSacCodes || [])
            .map((s) => `<code>${s.code}</code> (${s.description} @ ${s.gstRatePercent}%)`)
            .join('; ')}</div>`,
          ar.mismatchesAgainstApplication?.length
            ? `<div class="text-warning"><strong>Mismatches / Alerts:</strong> ${ar.mismatchesAgainstApplication.join(' | ')}</div>`
            : '',
          ar.missingDocumentsFlagged?.length
            ? `<div><strong>Missing Documents Flagged:</strong> ${ar.missingDocumentsFlagged.join(', ')}</div>`
            : '',
        ].join('');
      }
      showAlert('Completed Anthropic Claude structured GST registration audit.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('uploadDocBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await initOrResetUniversalDraft();
      }
      const fileInput = document.getElementById('docFileInput');
      const category = document.getElementById('docCategorySelect')?.value || 'udyam_msme_certificate';
      const ocrHint = document.getElementById('docOcrHintInput')?.value || '';
      const file = fileInput?.files?.[0];
      if (!file) {
        throw new Error('Select a PDF, JPG, or PNG file to upload.');
      }
      const base64Data = await fileToBase64(file);
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/documents`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentCategory: category,
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data,
            ocrTextHint: ocrHint,
          }),
        }
      );
      updateUiWithApplication(res.application);
      showAlert(`Uploaded ${file.name} (SHA-256 verified).`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  async function handleSubmission(mode) {
    try {
      if (!state.applicationId) {
        await saveDraftApplication();
      }
      const declared = document.getElementById('consentDeclarationCheckbox')?.checked;
      if (!declared) {
        throw new Error('Please check the Statutory Verification Declaration box before submitting.');
      }
      await apiRequest(`/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/consents`, {
        method: 'POST',
        body: JSON.stringify({ consentType: 'REG01_DECLARATION' }),
      });

      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            submissionMode: mode,
            idempotencyKey: `sub-${state.applicationId}-${mode}`,
          }),
        }
      );
      updateUiWithApplication(res.application);
      if (res.handoffPackage) {
        const panel = document.getElementById('handoffPackagePanel');
        const sha = document.getElementById('handoffShaBadge');
        const pre = document.getElementById('handoffJsonPreview');
        const copyGrid = document.getElementById('handoffCopyFieldsGrid');
        if (panel) panel.classList.remove('hidden');
        if (sha) sha.textContent = `SHA-256: ${res.handoffPackage.packageSha256.slice(0, 16)}…`;
        if (pre) pre.textContent = JSON.stringify(res.handoffPackage.reg01StructuredPayload, null, 2);
        if (copyGrid && res.handoffPackage.reg01StructuredPayload) {
          const partA = res.handoffPackage.reg01StructuredPayload.partA || {};
          const partB = res.handoffPackage.reg01StructuredPayload.partB || {};
          const addr = partB.principalPlaceAddress || {};
          const summaryRows = [
            { label: 'Legal Name of Business (Part A)', value: partA.legalNameAsPerPan || '—' },
            { label: 'Trade Name (Part B)', value: partB.tradeName || '—' },
            { label: 'Business Constitution', value: partB.constitutionOfBusiness || '—' },
            { label: 'State / UT (Part A)', value: partA.stateCode || '—' },
            { label: 'Principal Place Address', value: [addr.buildingName, addr.streetLocality, addr.cityDistrict, addr.pinCode].filter(Boolean).join(', ') || '—' },
            { label: 'HSN / SAC Codes', value: (partB.hsnSacCodes || []).map((c) => `${c.code} (${c.description})`).join('; ') || '—' },
          ];
          copyGrid.innerHTML = summaryRows
            .map(
              (row) => `<div class="p-2.5 rounded-xl bg-base-100/90 border border-base-300/60 flex items-center justify-between gap-2">
                <div>
                  <div class="text-[10px] opacity-60">${row.label}</div>
                  <div class="font-semibold text-xs">${row.value}</div>
                </div>
              </div>`
            )
            .join('');
        }
      }
      showAlert('Official portal handoff package prepared. Ready for verification on gst.gov.in.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }

  document.getElementById('submitModeBBtn')?.addEventListener('click', () => handleSubmission('MODE_B_PORTAL_HANDOFF'));
  document.getElementById('submitModeABtn')?.addEventListener('click', () => handleSubmission('MODE_A_API'));

  document.getElementById('saveTrnArnBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        throw new Error('Create and save an application first.');
      }
      const trn = document.getElementById('recordTrnInput')?.value || '';
      const arn = document.getElementById('recordArnInput')?.value || '';
      const app = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/portal-reference`,
        {
          method: 'POST',
          body: JSON.stringify({ trnNumber: trn || undefined, arnNumber: arn || undefined }),
        }
      );
      updateUiWithApplication(app);
      showAlert(`Recorded portal reference. Current status: ${app.status}`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('generateReg04DraftBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await saveDraftApplication();
      }
      const ref = document.getElementById('reg03RefInput')?.value || '';
      const issueDate = document.getElementById('reg03DateInput')?.value || '2026-10-31';
      const queriesRaw = document.getElementById('reg03QueriesInput')?.value || '';
      const queryItems = queriesRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/clarifications`,
        {
          method: 'POST',
          body: JSON.stringify({ reg03NoticeRef: ref, reg03IssueDate: issueDate, queryItems }),
        }
      );
      state.activeClarificationId = res.clarification.id;
      updateUiWithApplication(res.application);
      const container = document.getElementById('reg04DraftContainer');
      const dueBadge = document.getElementById('reg03DueBadge');
      const textarea = document.getElementById('reg04OwnerResponseInput');
      if (container) container.classList.remove('hidden');
      if (dueBadge) dueBadge.textContent = `Statutory Due: ${res.clarification.reg03DueDate}`;
      if (textarea) textarea.value = res.clarification.aiDraftResponse;
      showAlert('Generated Form GST REG-04 clarification draft.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('submitReg04Btn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId || !state.activeClarificationId) {
        throw new Error('Generate a REG-03 clarification draft first.');
      }
      const ownerApprovedResponse = document.getElementById('reg04OwnerResponseInput')?.value || '';
      const reg04Arn = document.getElementById('reg04ArnInput')?.value || '';
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/clarifications/${encodeURIComponent(
          state.activeClarificationId
        )}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ ownerApprovedResponse, reg04Arn: reg04Arn || undefined }),
        }
      );
      updateUiWithApplication(res.application);
      showAlert('Recorded Form GST REG-04 clarification submission.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('verifyGstinBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        throw new Error('Create and save an application first.');
      }
      const claimedGstin = document.getElementById('approveGstinInput')?.value || '';
      const effectiveRegistrationDate = document.getElementById('approveEffectiveDateInput')?.value || '2026-10-31';
      const app = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/verify-gstin`,
        {
          method: 'POST',
          body: JSON.stringify({ claimedGstin, effectiveRegistrationDate }),
        }
      );
      updateUiWithApplication(app);
      showAlert(`Verified GSTIN ${app.approvedGstin}! Application marked Approved.`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('activateWorkspaceGstinBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        throw new Error('Verify and approve an application first.');
      }
      const res = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/activate`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      updateUiWithApplication(res.application);
      const box = document.getElementById('activationSyncSummary');
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = [
          `<div class="font-bold text-success">Synced Approved GSTIN to Hisaab.Guru Accounting Workspace!</div>`,
          `<div>Active GSTIN: ${res.workspace.businessGstin} | Effective Date: ${res.workspace.gstEffectiveDate}</div>`,
          `<div>State Code: ${res.workspace.stateCode} | Automated GSP Return Filing Connected: ${res.workspace.gspConnected}</div>`,
          `<div>Compliance Deadlines Enabled: ${(res.workspace.gstComplianceDeadlines || [])
            .map((d) => `${d.returnType} (Day ${d.dueDayOfMonth})`)
            .join(', ')}</div>`,
        ].join('');
      }
      showAlert('Activated approved GSTIN in Hisaab.Guru workspace.', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('askAiBtn')?.addEventListener('click', async () => {
    try {
      const q = document.getElementById('aiQuestionInput')?.value || '';
      const res = await apiRequest('/api/gst-registration/assistant', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          constitution: document.getElementById('eligConstitution')?.value,
          stateCode: document.getElementById('eligStateCode')?.value,
        }),
      });
      const ans = document.getElementById('aiAnswerBox');
      if (ans) ans.textContent = res.answer;
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('saveRule14ABtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await saveDraftApplication();
      }
      const monthlyB2bTax = Number(document.getElementById('rule14AMonthlyB2bTaxInput')?.value || 0);
      const optIn = Boolean(document.getElementById('rule14AOptInCheckbox')?.checked);
      const updated = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/rule-14a`,
        {
          method: 'POST',
          body: JSON.stringify({
            estimatedMonthlyB2bOutputTaxInr: monthlyB2bTax,
            rule14AOptIn: optIn,
          }),
        }
      );
      updateUiWithApplication(updated);
      showAlert(`Updated CGST Rule 14A Assessment: ${updated.rule14AAssessment.statusLabel}`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('deferRule10ABtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await saveDraftApplication();
      }
      const updated = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/rule-10a-bank`,
        {
          method: 'POST',
          body: JSON.stringify({ deferToPostGrant: true }),
        }
      );
      updateUiWithApplication(updated);
      showAlert('Confirmed CGST Rule 10A deferral (bank details due within 30 days after GSTIN grant).', 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  document.getElementById('saveRule10ABankBtn')?.addEventListener('click', async () => {
    try {
      if (!state.applicationId) {
        await saveDraftApplication();
      }
      const ifscCode = document.getElementById('rule10AIfscInput')?.value || '';
      const accountNumber = document.getElementById('rule10AAccountInput')?.value || '';
      const proofType = document.getElementById('rule10AProofTypeSelect')?.value || 'Cancelled Cheque';
      const updated = await apiRequest(
        `/api/gst-registration/applications/${encodeURIComponent(state.applicationId)}/rule-10a-bank`,
        {
          method: 'POST',
          body: JSON.stringify({
            deferToPostGrant: false,
            ifscCode,
            accountNumber,
            proofType,
          }),
        }
      );
      updateUiWithApplication(updated);
      showAlert(`Saved CGST Rule 10A Bank Details (${updated.rule10AWorkflow.bankAccountDetails.accountNumberMasked}).`, 'success');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  async function loadPublicCatalogAndFaqs() {
    try {
      const data = await apiRequest('/api/gst-registration/faqs', { method: 'GET' });
      const faqListEl = document.getElementById('plainLanguageFaqAccordionList');
      if (faqListEl && Array.isArray(data.faqs) && !faqListEl.dataset.rendered) {
        faqListEl.dataset.rendered = 'true';
        faqListEl.innerHTML = data.faqs
          .map(
            (faq, idx) => `<details class="apple-subcard p-3.5" ${idx < 2 ? 'open' : ''}>
              <summary class="cursor-pointer font-bold select-none flex flex-wrap items-center justify-between gap-2">
                <span>${faq.question}</span>
                <span class="badge badge-ghost badge-xs font-mono-code shrink-0">${faq.category}</span>
              </summary>
              <div class="pt-2.5 space-y-1.5 opacity-85 leading-relaxed">
                <p>${faq.answer}</p>
                <div class="text-[10px] font-mono-code text-[var(--il-green)]">Official Source: ${faq.statutoryCitation}</div>
              </div>
            </details>`
          )
          .join('');
      }
      const sourcesEl = document.getElementById('officialStatutorySourcesList');
      if (sourcesEl && Array.isArray(data.officialStatutorySources) && !sourcesEl.dataset.rendered) {
        sourcesEl.dataset.rendered = 'true';
        sourcesEl.innerHTML = data.officialStatutorySources
          .map(
            (src) => `<div class="p-2.5 rounded-xl bg-base-200/70 border border-base-300/60 space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-1 font-mono-code text-[11px]">
                <strong class="text-[var(--il-green)]">${src.reference}</strong>
                <span>Effective: ${src.effectiveFrom} · ${src.officialPortalDomain}</span>
              </div>
              <p class="text-[11px] opacity-80 leading-relaxed">${src.summary}</p>
            </div>`
          )
          .join('');
      }
    } catch (_) {
      // ignore
    }
  }

  // Authentication Event Listeners (Resend Email OTP + Allowlist)
  document.getElementById('authHeaderBtn')?.addEventListener('click', () => {
    openAuthModal();
  });

  document.getElementById('authTabLogin')?.addEventListener('click', () => {
    state.authMode = 'login';
    document.getElementById('authTabLogin')?.classList.add('bg-base-100', 'shadow-xs');
    document.getElementById('authTabLogin')?.classList.remove('opacity-70');
    document.getElementById('authTabSignup')?.classList.remove('bg-base-100', 'shadow-xs');
    document.getElementById('authTabSignup')?.classList.add('opacity-70');
    document.getElementById('authFullNameField')?.classList.add('hidden');
  });

  document.getElementById('authTabSignup')?.addEventListener('click', () => {
    state.authMode = 'signup';
    document.getElementById('authTabSignup')?.classList.add('bg-base-100', 'shadow-xs');
    document.getElementById('authTabSignup')?.classList.remove('opacity-70');
    document.getElementById('authTabLogin')?.classList.remove('bg-base-100', 'shadow-xs');
    document.getElementById('authTabLogin')?.classList.add('opacity-70');
    document.getElementById('authFullNameField')?.classList.remove('hidden');
  });

  document.getElementById('requestOtpBtn')?.addEventListener('click', async () => {
    try {
      const email = document.getElementById('authEmailInput')?.value || '';
      const fullName = document.getElementById('authFullNameInput')?.value || '';
      const res = await apiRequest('/api/gst-registration/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email, mode: state.authMode, fullName }),
      });
      document.getElementById('authStepEmailBox')?.classList.add('hidden');
      document.getElementById('authStepOtpBox')?.classList.remove('hidden');
      if (res.devPreviewOtp) {
        const otpInput = document.getElementById('authOtpInput');
        if (otpInput) otpInput.value = res.devPreviewOtp;
        showAuthModalFeedback(
          `Code sent to ${res.email} (Local Dev Preview OTP: ${res.devPreviewOtp} — set RESEND_API_KEY for live Resend delivery).`,
          'info'
        );
      } else {
        showAuthModalFeedback(`Sent 6-digit verification code to ${res.email} via Resend.`, 'success');
      }
    } catch (err) {
      showAuthModalFeedback(err.message, 'error');
    }
  });

  document.getElementById('backToEmailStepBtn')?.addEventListener('click', () => {
    document.getElementById('authStepOtpBox')?.classList.add('hidden');
    document.getElementById('authStepEmailBox')?.classList.remove('hidden');
  });

  document.getElementById('verifyOtpBtn')?.addEventListener('click', async () => {
    try {
      const email = document.getElementById('authEmailInput')?.value || '';
      const otp = document.getElementById('authOtpInput')?.value || '';
      const res = await apiRequest('/api/gst-registration/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      state.authToken = res.token;
      state.authenticatedEmail = res.email;
      state.businessId = res.businessId;
      state.csrfToken = res.csrfToken;
      localStorage.setItem('hisaab_gst_auth_token', res.token);
      localStorage.setItem('hisaab_gst_auth_email', res.email);
      localStorage.setItem('hisaab_gst_business_id', res.businessId);
      updateAuthHeaderUi(true, res.email);
      closeAuthModal();
      showAlert(`Signed in as ${res.email}. Workspace unlocked.`, 'success');
      await resumeOrInitBusinessApplication();
    } catch (err) {
      showAuthModalFeedback(err.message, 'error');
    }
  });

  document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
    try {
      await apiRequest('/api/gst-registration/auth/logout', { method: 'POST' });
    } catch (_) {
      // ignore
    }
    state.authToken = null;
    state.authenticatedEmail = null;
    state.csrfToken = null;
    localStorage.removeItem('hisaab_gst_auth_token');
    localStorage.removeItem('hisaab_gst_auth_email');
    updateAuthHeaderUi(false, null);
    openAuthModal();
  });

  // Instant Tooltip Warmup (skip animation delay on subsequent hovers within 600ms)
  let tooltipCooldownTimer = null;
  document.addEventListener('mouseover', (e) => {
    const tip = e.target?.closest?.('.hg-tip');
    if (tip) {
      if (tooltipCooldownTimer) clearTimeout(tooltipCooldownTimer);
      setTimeout(() => {
        document.body.setAttribute('data-tooltip-warm', '1');
      }, 140);
    }
  });
  document.addEventListener('mouseout', (e) => {
    const tip = e.target?.closest?.('.hg-tip');
    if (tip) {
      if (tooltipCooldownTimer) clearTimeout(tooltipCooldownTimer);
      tooltipCooldownTimer = setTimeout(() => {
        document.body.removeAttribute('data-tooltip-warm');
      }, 600);
    }
  });

  window.addEventListener('popstate', () => renderRoute(window.location.pathname));

  renderRoute(window.location.pathname);
  runEligibilityCheck();
  loadPublicCatalogAndFaqs();
  initSession();
})();
