'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGstRegistrationService } = require('../server/gst-registration.cjs');
const { createGstAuthService } = require('../server/gst-auth.cjs');

const root = __dirname;

function loadLocalEnvFile() {
  const envPath = path.resolve(root, '../server/.env.local');
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch (_) {
    // ignore
  }
}
loadLocalEnvFile();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

const GST_REGISTRATION_WEB_ROUTES = new Set([
  '/gst-registration',
  '/gst-registration/apply',
  '/gst-registration/documents',
  '/gst-registration/review',
  '/gst-registration/submit',
  '/gst-registration/status',
  '/gst-registration/clarifications',
  '/gst-registration/success',
]);

function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Request payload exceeds maximum limit.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(Object.assign(new Error('Malformed JSON request body.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function extractActorFromHeaders(req, authService) {
  const cookies = parseCookies(req);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = bearer || cookies.hisaab_gst_auth || '';
  if (token && authService) {
    const authSession = authService.getSession(token);
    if (authSession) {
      return {
        userId: authSession.userId,
        role: authSession.role,
        businessId: authSession.businessId,
        email: authSession.email,
        fullName: authSession.fullName,
        authenticatedViaOtp: true,
      };
    }
  }
  const userId = String(req.headers['x-hisaab-user-id'] || '').trim();
  const role = String(req.headers['x-hisaab-role'] || 'owner').trim();
  const businessId = String(req.headers['x-hisaab-business-id'] || 'biz-default-owner').trim();
  if (!userId) return null;
  return { userId, role, businessId };
}

function answerRegistrationQuestion({ question = '', constitution = 'Sole Proprietorship', stateCode = '27', service }) {
  const q = String(question || '').toLowerCase();
  const elig = service.evaluateGstEligibility({ constitution, stateCode });
  if (q.includes('rent') || q.includes('noc') || q.includes('address') || q.includes('electricity')) {
    return {
      answer:
        'For rented or leased premises in Form GST REG-01 Part B, you must upload BOTH: (1) Latest Electricity Bill, Property Tax Receipt, or Municipal Khata in the landlord/owner name, AND (2) Valid Rent/Lease Agreement together with a signed No Objection Certificate (NOC) from the premises owner. Ensure the PIN code and floor/shop number match across all documents.',
    };
  }
  if (q.includes('composition') || q.includes('1%') || q.includes('5%')) {
    return {
      answer: `Under CGST Act Sec 10 & Sec 10(2A), Composition Scheme is available up to ₹${elig.compositionCapInr.toLocaleString(
        'en-IN'
      )} in ${
        elig.stateName
      } for Traders/Manufacturers (1%) and Restaurants not serving alcohol (5%), and up to ₹50,00,000 for Service Providers (6%). Businesses making inter-state outward supplies or supplying services via E-Commerce Operators cannot opt for Composition.`,
    };
  }
  if (q.includes('aadhaar') || q.includes('otp') || q.includes('biometric')) {
    return {
      answer:
        'Under CGST Rule 8(4A), GSTN sends an Aadhaar e-KYC authentication hyper-link to the Primary Authorized Signatory and Promoter mobile/email after Part B submission. Hisaab.Guru never stores your raw 12-digit Aadhaar number or automates OTP/CAPTCHA.',
    };
  }
  return {
    answer: `For ${constitution} in ${elig.stateName} (State Code ${stateCode}), the CGST Sec 22 aggregate turnover threshold is ₹${elig.applicableThresholdInr.toLocaleString(
      'en-IN'
    )} (₹0 if making compulsory inter-state goods supply or selling through an E-Commerce Operator u/s 24). Always consult a Chartered Accountant for complex multi-state structuring or disputed litigation.`,
  };
}

function createWebsiteServer(options = {}) {
  const defaultDataDir = path.resolve(root, '../server/.data');
  const persistenceFilePath =
    options.persistenceFilePath ||
    (options.enableDurablePersistence ? path.join(defaultDataDir, 'gst-registration-state.json') : null);
  const authPersistFilePath =
    options.authPersistFilePath ||
    (options.enableDurablePersistence ? path.join(defaultDataDir, 'gst-auth-sessions.json') : null);

  const gstService =
    options.gstService ||
    createGstRegistrationService({
      ...options,
      supabaseDbReady: options.supabaseDbReady !== undefined ? options.supabaseDbReady : true,
      persistenceFilePath,
    });
  const authService =
    options.authService ||
    createGstAuthService({
      ...options,
      persistFilePath: authPersistFilePath || options.persistFilePath,
    });

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const cleanUrl = parsedUrl.pathname;

      // =======================================================================
      // 1. Backend REST API Routes (/api/gst-registration/*)
      // =======================================================================
      if (cleanUrl === '/api/gst-registration/auth/request-otp' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await authService.requestEmailOtp({
          email: body.email,
          mode: body.mode,
          fullName: body.fullName,
        });
        sendJson(res, 200, result);
        return;
      }

      if (cleanUrl === '/api/gst-registration/auth/verify-otp' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const authSession = authService.verifyEmailOtp({
          email: body.email,
          otp: body.otp,
        });
        const sessionKey = `${authSession.businessId}:${authSession.userId}`;
        const csrfToken = gstService.issueCsrfToken(sessionKey);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': `hisaab_gst_auth=${encodeURIComponent(
            authSession.token
          )}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        });
        res.end(
          JSON.stringify({
            ok: true,
            authenticated: true,
            token: authSession.token,
            email: authSession.email,
            fullName: authSession.fullName,
            userId: authSession.userId,
            businessId: authSession.businessId,
            csrfToken,
          })
        );
        return;
      }

      if (cleanUrl === '/api/gst-registration/auth/logout' && req.method === 'POST') {
        const cookies = parseCookies(req);
        const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        authService.revokeSession(bearer || cookies.hisaab_gst_auth);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': 'hisaab_gst_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
        });
        res.end(JSON.stringify({ ok: true, authenticated: false }));
        return;
      }

      if (cleanUrl === '/api/gst-registration/session' && req.method === 'GET') {
        const actor = extractActorFromHeaders(req, authService);
        if (!actor) {
          sendJson(res, 200, {
            authenticated: false,
            allowedEmails: authService.getAllowedEmails(),
            resendConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
            environmentSecurity: gstService.getEnvironmentSecurityStatus(),
          });
          return;
        }
        const sessionKey = `${actor.businessId}:${actor.userId}`;
        const csrfToken = gstService.issueCsrfToken(sessionKey);
        sendJson(res, 200, {
          authenticated: Boolean(actor.authenticatedViaOtp || actor.userId),
          email: actor.email || '',
          fullName: actor.fullName || '',
          csrfToken,
          businessId: actor.businessId,
          userId: actor.userId,
          allowedEmails: authService.getAllowedEmails(),
          resendConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
          environmentSecurity: gstService.getEnvironmentSecurityStatus(),
        });
        return;
      }

      if (cleanUrl === '/api/gst-registration/catalog' && req.method === 'GET') {
        const envSec = gstService.getEnvironmentSecurityStatus();
        sendJson(res, 200, {
          constitutions: gstService.LEGAL_CONSTITUTIONS,
          industries: gstService.BUSINESS_INDUSTRIES,
          categories: gstService.GST_REGISTRATION_CATEGORIES,
          documentStatuses: gstService.UNIVERSAL_DOCUMENT_STATUSES,
          effectiveDatedRules: gstService.EFFECTIVE_DATED_GST_RULES,
          categoryWorkflows: gstService.CATEGORY_WORKFLOW_REGISTRY,
          providerCapabilities: envSec.providerCapabilities,
          officialStatutorySources: gstService.OFFICIAL_STATUTORY_SOURCES_REGISTRY,
          plainLanguageFaqs: gstService.PLAIN_LANGUAGE_GST_FAQS,
        });
        return;
      }

      if (cleanUrl === '/api/gst-registration/faqs' && req.method === 'GET') {
        sendJson(res, 200, {
          faqs: gstService.PLAIN_LANGUAGE_GST_FAQS,
          officialStatutorySources: gstService.OFFICIAL_STATUTORY_SOURCES_REGISTRY,
        });
        return;
      }

      if (cleanUrl === '/api/gst-registration/environment-status' && req.method === 'GET') {
        sendJson(res, 200, gstService.getEnvironmentSecurityStatus());
        return;
      }

      if (cleanUrl === '/api/gst-registration/eligibility' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = gstService.evaluateGstEligibility(body);
        sendJson(res, 200, result);
        return;
      }

      if (cleanUrl === '/api/gst-registration/assistant' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = answerRegistrationQuestion({ ...body, service: gstService });
        sendJson(res, 200, result);
        return;
      }

      if (cleanUrl === '/api/gst-registration/businesses' && req.method === 'GET') {
        const actor = extractActorFromHeaders(req, authService) || {
          userId: 'user-owner-default',
          businessId: 'biz-default-owner',
          role: 'owner',
        };
        sendJson(res, 200, gstService.listAllBusinessesForOverview(actor));
        return;
      }

      if (cleanUrl === '/api/gst-registration/consent-noc-preview' && req.method === 'GET') {
        const appId = parsedUrl.searchParams.get('applicationId') || '';
        const tradeName = parsedUrl.searchParams.get('tradeName') || '';
        const applicantName = parsedUrl.searchParams.get('applicantName') || '';
        const ownerName = parsedUrl.searchParams.get('ownerName') || '';
        const relationship = parsedUrl.searchParams.get('relationship') || 'Son / Family Member';
        let appObj = null;
        if (appId) {
          try {
            const actor = extractActorFromHeaders(req, authService) || {
              userId: 'user-owner-default',
              businessId: 'biz-default-owner',
              role: 'owner',
            };
            appObj = gstService.getApplication(actor, appId);
          } catch (_) {
            // fallback to query params
          }
        }
        const nocHtml = gstService.generateFamilyOrOwnerConsentNocHtml(appObj, {
          tradeName: tradeName || undefined,
          applicantName: applicantName || undefined,
          ownerName: ownerName || undefined,
          relationship,
        });
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(nocHtml);
        return;
      }

      if (cleanUrl === '/api/gst-registration/businesses/switch' && req.method === 'POST') {
        const actor = extractActorFromHeaders(req, authService) || {
          userId: 'user-owner-default',
          businessId: 'biz-default-owner',
          role: 'owner',
        };
        const body = await readJsonBody(req);
        const app = gstService.createOrSwitchBusinessFromPreset(actor, {
          presetId: body.presetId,
          customBusiness: body.customBusiness || null,
        });
        sendJson(res, 200, app);
        return;
      }

      // Signed Document Download Route (verifies HMAC signature & TTL)
      const downloadMatch = cleanUrl.match(/^\/api\/gst-registration\/documents\/([^/]+)\/download$/);
      if (downloadMatch && req.method === 'GET') {
        const documentId = decodeURIComponent(downloadMatch[1]);
        const businessId = parsedUrl.searchParams.get('businessId') || '';
        const expires = parsedUrl.searchParams.get('expires') || '';
        const sig = parsedUrl.searchParams.get('sig') || '';
        const { doc, buffer } = gstService.verifyAndReadSignedDocument({
          documentId,
          businessId,
          expires,
          sig,
        });
        res.writeHead(200, {
          'Content-Type': doc.mimeType,
          'Content-Length': buffer.length,
          'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
        return;
      }

      if (cleanUrl.startsWith('/api/gst-registration/')) {
        const actor = extractActorFromHeaders(req, authService);
        if (!actor) {
          sendJson(res, 401, { error: 'Authentication required. Sign in with your authorized email.' });
          return;
        }

        // Enforce CSRF on state-mutating requests when a session token has been issued
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
          const csrfHeader = req.headers['x-csrf-token'];
          if (req.headers['x-enforce-csrf'] === 'true' || csrfHeader) {
            gstService.verifyCsrfToken(`${actor.businessId}:${actor.userId}`, csrfHeader);
          }
        }

        if (cleanUrl === '/api/gst-registration/pilot/heytomo' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const app = gstService.createHeyTomoPilotDraft(actor, body.businessId || actor.businessId);
          sendJson(res, 200, app);
          return;
        }

        const playbookMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/portal-playbook$/);
        if (playbookMatch && req.method === 'GET') {
          const applicationId = decodeURIComponent(playbookMatch[1]);
          const app = gstService.getApplication(actor, applicationId);
          sendJson(res, 200, {
            applicationId: app.id,
            businessId: app.businessId,
            trnNumber: app.trnNumber,
            officialPortalStatus: app.officialPortalStatus,
            officialPortalPlaybook: app.officialPortalPlaybook,
          });
          return;
        }

        const claudeAuditMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/claude-audit$/);
        if (claudeAuditMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(claudeAuditMatch[1]);
          const body = await readJsonBody(req);
          const result = await gstService.runClaudeApplicationAudit(actor, {
            applicationId,
            documentCategory: body.documentCategory,
            documentTextOrMetadata: body.documentTextOrMetadata,
          });
          sendJson(res, 200, result);
          return;
        }

        const claudeApproveMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/claude-audit\/([^/]+)\/approve$/
        );
        if (claudeApproveMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(claudeApproveMatch[1]);
          const auditId = decodeURIComponent(claudeApproveMatch[2]);
          const body = await readJsonBody(req);
          const app = gstService.approveClaudeAuditSuggestions(actor, {
            applicationId,
            auditId,
            applySuggestedSac: body.applySuggestedSac !== false,
          });
          sendJson(res, 200, app);
          return;
        }

        const aiTurnMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/ai-turn$/);
        if (aiTurnMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(aiTurnMatch[1]);
          const body = await readJsonBody(req);
          const result = await gstService.processAiAssistantTurn(actor, {
            applicationId,
            message: body.message,
            quickSelectFieldKey: body.quickSelectFieldKey,
            quickSelectValue: body.quickSelectValue,
            documentTextOrMetadata: body.documentTextOrMetadata,
            documentCategory: body.documentCategory,
          });
          sendJson(res, 200, result);
          return;
        }

        const secureVaultMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/secure-vault$/);
        if (secureVaultMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(secureVaultMatch[1]);
          const body = await readJsonBody(req);
          const app = gstService.submitSecureVaultFields(actor, {
            applicationId,
            ...body,
          });
          sendJson(res, 200, app);
          return;
        }

        const confirmFieldMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/confirm-field$/);
        if (confirmFieldMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(confirmFieldMatch[1]);
          const body = await readJsonBody(req);
          const app = gstService.confirmRegistryField(actor, {
            applicationId,
            fieldKey: body.fieldKey,
            value: body.value,
          });
          sendJson(res, 200, app);
          return;
        }

        const confirmCardMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/confirm-extracted-card$/);
        if (confirmCardMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(confirmCardMatch[1]);
          const app = gstService.confirmExtractedDocumentCard(actor, {
            applicationId,
          });
          sendJson(res, 200, app);
          return;
        }

        const rule14aMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/rule-14a$/);
        if (rule14aMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(rule14aMatch[1]);
          const body = await readJsonBody(req);
          const app = gstService.updateRule14AOption(actor, {
            applicationId,
            ...body,
          });
          sendJson(res, 200, app);
          return;
        }

        const rule10aMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/rule-10a-bank$/);
        if (rule10aMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(rule10aMatch[1]);
          const body = await readJsonBody(req);
          const app = gstService.updateRule10ABankDetails(actor, {
            applicationId,
            ...body,
          });
          sendJson(res, 200, app);
          return;
        }

        if (cleanUrl === '/api/gst-registration/applications' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const app = gstService.createOrUpdateDraftApplication(actor, body);
          sendJson(res, 200, app);
          return;
        }

        if (cleanUrl === '/api/gst-registration/applications' && req.method === 'GET') {
          const businessId = parsedUrl.searchParams.get('businessId') || actor.businessId;
          const list = gstService.listBusinessApplications(actor, businessId);
          sendJson(res, 200, { applications: list });
          return;
        }

        const appMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)$/);
        if (appMatch && req.method === 'GET') {
          const app = gstService.getApplication(actor, decodeURIComponent(appMatch[1]));
          sendJson(res, 200, app);
          return;
        }

        const uploadMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/documents$/);
        if (uploadMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(uploadMatch[1]);
          const body = await readJsonBody(req);
          const buffer = Buffer.from(String(body.base64Data || ''), 'base64');
          const uploaded = gstService.uploadDocument(actor, {
            applicationId,
            documentCategory: body.documentCategory,
            fileName: body.fileName,
            mimeType: body.mimeType,
            buffer,
            ocrTextHint: body.ocrTextHint || '',
          });
          if (body.autoTriggerAiExtraction && body.ocrTextHint) {
            await gstService.processAiAssistantTurn(actor, {
              applicationId,
              documentCategory: body.documentCategory,
              documentTextOrMetadata: body.ocrTextHint,
            });
          }
          const application = gstService.getApplication(actor, applicationId);
          sendJson(res, 200, { ...uploaded, application });
          return;
        }

        const confirmDocMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/documents\/([^/]+)\/confirm$/
        );
        if (confirmDocMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(confirmDocMatch[1]);
          const documentId = decodeURIComponent(confirmDocMatch[2]);
          const body = await readJsonBody(req);
          const app = gstService.confirmExtractedFields(actor, {
            applicationId,
            documentId,
            applyToApplication: Boolean(body.applyToApplication),
          });
          sendJson(res, 200, app);
          return;
        }

        const signedUrlMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/documents\/([^/]+)\/signed-url$/
        );
        if (signedUrlMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(signedUrlMatch[1]);
          const documentId = decodeURIComponent(signedUrlMatch[2]);
          const body = await readJsonBody(req);
          const signed = gstService.createSignedDocumentUrl(actor, {
            applicationId,
            documentId,
            expiresInSeconds: body.expiresInSeconds,
          });
          sendJson(res, 200, signed);
          return;
        }

        const deleteDocMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/documents\/([^/]+)$/
        );
        if (deleteDocMatch && req.method === 'DELETE') {
          const applicationId = decodeURIComponent(deleteDocMatch[1]);
          const documentId = decodeURIComponent(deleteDocMatch[2]);
          const app = gstService.deleteDocument(actor, { applicationId, documentId });
          sendJson(res, 200, app);
          return;
        }

        const replaceDocMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/documents\/([^/]+)\/replace$/
        );
        if (replaceDocMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(replaceDocMatch[1]);
          const documentIdToReplace = decodeURIComponent(replaceDocMatch[2]);
          const body = await readJsonBody(req);
          const buffer = Buffer.from(String(body.base64Data || ''), 'base64');
          const replaced = gstService.replaceDocument(actor, {
            applicationId,
            documentIdToReplace,
            fileName: body.fileName,
            mimeType: body.mimeType,
            buffer,
            ocrTextHint: body.ocrTextHint || '',
          });
          sendJson(res, 200, replaced);
          return;
        }

        const reqReplaceDocMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/documents\/([^/]+)\/request-replacement$/
        );
        if (reqReplaceDocMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(reqReplaceDocMatch[1]);
          const documentId = decodeURIComponent(reqReplaceDocMatch[2]);
          const body = await readJsonBody(req);
          const app = gstService.requestDocumentReplacement(actor, {
            applicationId,
            documentId,
            reason: body.reason,
          });
          sendJson(res, 200, app);
          return;
        }

        const consentMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/consents$/);
        if (consentMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(consentMatch[1]);
          const body = await readJsonBody(req);
          const consent = gstService.recordConsent(actor, {
            applicationId,
            consentType: body.consentType,
            ipAddress: req.socket?.remoteAddress || '127.0.0.1',
          });
          sendJson(res, 200, { consent });
          return;
        }

        const submitMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/submit$/);
        if (submitMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(submitMatch[1]);
          const body = await readJsonBody(req);
          const result = await gstService.submitApplication(actor, {
            applicationId,
            submissionMode: body.submissionMode,
            idempotencyKey: body.idempotencyKey,
          });
          sendJson(res, 200, result);
          return;
        }

        const portalRefMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/portal-reference$/);
        if (portalRefMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(portalRefMatch[1]);
          const body = await readJsonBody(req);
          const app = gstService.recordPortalReference(actor, {
            applicationId,
            trnNumber: body.trnNumber,
            arnNumber: body.arnNumber,
          });
          sendJson(res, 200, app);
          return;
        }

        const clarMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/clarifications$/);
        if (clarMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(clarMatch[1]);
          const body = await readJsonBody(req);
          const result = gstService.createReg03Clarification(actor, {
            applicationId,
            reg03NoticeRef: body.reg03NoticeRef,
            reg03IssueDate: body.reg03IssueDate,
            queryItems: body.queryItems,
          });
          sendJson(res, 200, result);
          return;
        }

        const clarSubmitMatch = cleanUrl.match(
          /^\/api\/gst-registration\/applications\/([^/]+)\/clarifications\/([^/]+)\/submit$/
        );
        if (clarSubmitMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(clarSubmitMatch[1]);
          const clarificationId = decodeURIComponent(clarSubmitMatch[2]);
          const body = await readJsonBody(req);
          const result = gstService.submitReg04ClarificationResponse(actor, {
            applicationId,
            clarificationId,
            ownerApprovedResponse: body.ownerApprovedResponse,
            reg04Arn: body.reg04Arn,
          });
          sendJson(res, 200, result);
          return;
        }

        const verifyGstinMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/verify-gstin$/);
        if (verifyGstinMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(verifyGstinMatch[1]);
          const body = await readJsonBody(req);
          const app = await gstService.verifyAndApproveGstin(actor, {
            applicationId,
            claimedGstin: body.claimedGstin,
            effectiveRegistrationDate: body.effectiveRegistrationDate,
            verificationMethod: body.verificationMethod,
          });
          sendJson(res, 200, app);
          return;
        }

        const activateMatch = cleanUrl.match(/^\/api\/gst-registration\/applications\/([^/]+)\/activate$/);
        if (activateMatch && req.method === 'POST') {
          const applicationId = decodeURIComponent(activateMatch[1]);
          const body = await readJsonBody(req);
          const result = gstService.activateApprovedGstinInWorkspace(actor, {
            applicationId,
            expectedRevision: body.expectedRevision,
            filingFrequency: body.filingFrequency,
          });
          sendJson(res, 200, result);
          return;
        }

        sendJson(res, 404, { error: 'GST Registration API endpoint not found.' });
        return;
      }

      // =======================================================================
      // 2. 8 Required Web Routes (/gst-registration/*)
      // =======================================================================
      if (GST_REGISTRATION_WEB_ROUTES.has(cleanUrl)) {
        const htmlPath = path.join(root, 'gst-registration.html');
        fs.readFile(htmlPath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Failed to load GST Registration Assistant');
            return;
          }
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          });
          res.end(data);
        });
        return;
      }

      // =======================================================================
      // 2.5 Pricing Page Route (/pricing or /pricing.html)
      // =======================================================================
      if (cleanUrl === '/pricing' || cleanUrl === '/pricing.html') {
        const pricingPath = path.join(root, 'pricing.html');
        fs.readFile(pricingPath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Failed to load Pricing page');
            return;
          }
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          });
          res.end(data);
        });
        return;
      }

      // =======================================================================
      // 3. Static Asset & Landing Page Serving (007 Hardened Path & Dotfile Guard)
      // =======================================================================
      const relativeTarget = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      const segments = relativeTarget.split(/[\\/]+/);
      const isForbiddenStatic =
        segments.some((seg) => seg.startsWith('.')) ||
        ['server.cjs', 'package.json', 'package-lock.json'].includes(segments[0]);
      const filePath = path.resolve(root, relativeTarget);
      if (isForbiddenStatic || !filePath.startsWith(root + path.sep) && filePath !== path.join(root, 'index.html')) {
        res.writeHead(403, SECURITY_HEADERS);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, SECURITY_HEADERS);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    } catch (err) {
      const status = Number(err.statusCode) || 500;
      sendJson(res, status, {
        error: err.message || 'Internal server error',
        details: err.details || undefined,
      });
    }
  });

  return { server, gstService };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8767);
  const { server } = createWebsiteServer({ enableDurablePersistence: true });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Hisaab.Guru website & GST Registration Assistant running at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createWebsiteServer,
  GST_REGISTRATION_WEB_ROUTES,
};
