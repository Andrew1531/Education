import { useState, useEffect, useRef, createContext, useContext, lazy, Suspense } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { PageMetadata } from './PageMetadata';
import seoPages from '../seo-pages.json';
import { hashPassword, verifyAndMigratePassword } from './auth';
import {
  type StoredUser,
  UserStoreCorruptError,
  getUsers,
  saveUsers,
} from './userStore';
import { StorageCorruptBanner } from './StorageCorruptBanner';
import { jobSearchUrl, getAlignedRoles } from './jobRoles';
import { CountryPicker, isValidCountry } from './CountryPicker';
import {
  type ServerUser,
  ApiUnavailableError,
  AdminKeyRequiredError,
  getAdminKey,
  setAdminKey,
  apiSignup,
  apiSignin,
  apiListUsers,
  apiVerifyAdminKey,
  apiImportUsers,
  apiDeleteUser,
  apiResetPassword,
  apiSyncSelf,
  apiSaveProfile,
  type EvalProfile,
} from './api';
// Only shown after an admission-goal result; load its UI kit on demand.
const ComparablePrograms = lazy(() => import('./programs/ComparablePrograms').then((m) => ({ default: m.ComparablePrograms })));
import { QualificationWorkflow } from './QualificationWorkflow';
import type { Qualification } from './qualificationGuidance';
import { educationProfileKey, loadEducationProfile, restoreEducationProfile, storeEducationProfile } from './educationProfileStore';
import { apiSaveEducationProfile } from './api';

// Guides are public long-form content: keep them in their own chunk so the
// article text is not shipped to every visitor of the evaluator.
const GuidesRoute = lazy(() => import('./guides/GuidesPages'));
const GUIDE_UI = {
  en: { nav: 'Guides', skip: 'Skip to main content', menu: 'Menu', closeMenu: 'Close menu', homeEntry: 'New here? Read our free guides first', homeEntryBody: 'No account needed: when you may need a credential evaluation, and how to list a foreign degree on a U.S. resume.', loading: 'Loading guide…' },
  es: { nav: 'Guías', skip: 'Saltar al contenido principal', menu: 'Menú', closeMenu: 'Cerrar menú', homeEntry: '¿Es nuevo? Lea primero nuestras guías gratuitas', homeEntryBody: 'Sin cuenta: cuándo puede necesitar una evaluación de credenciales y cómo incluir un título extranjero en un currículum de EE. UU.', loading: 'Cargando guía…' },
} as const;

/**
 * Best-effort push of this visitor's own account + evaluation profile to the
 * central database. Runs once per page load; makes accounts created before
 * the backend existed (or while offline) appear on the admin board.
 */
function syncOwnAccount(): void {
  const username = localStorage.getItem(STORAGE_KEY);
  if (!username) return;
  let profile: EvalProfile | undefined;
  try { profile = loadEducationProfile(username); } catch { /* ignore */ }
  const pendingKey = `${educationProfileKey(username)}_pending`;
  const syncPending = async () => {
    if (profile?.qualifications && localStorage.getItem(pendingKey) === 'true') {
      try {
        await apiSaveEducationProfile(username, profile);
        localStorage.removeItem(pendingKey);
      } catch { /* Keep the explicit pending marker; never discard local edits. */ }
    }
  };
  try {
    const me = getUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (me) { void apiSyncSelf(me, profile).then(syncPending); return; }
  } catch { /* local store unreadable */ }
  // Account exists only server-side — still push the profile if we have one
  if (profile) {
    const { qualifications: _awards, ...legacy } = profile;
    void apiSaveProfile(username, legacy).then(syncPending);
  }
}

const STORAGE_KEY = 'ge_username';
type Lang = 'en' | 'es';

const TX = {
  en: {
    about: 'About', howItWorks: 'How It Works', signOut: 'Sign Out',
    footerCopy: '© 2026 VerifED Global. All rights reserved.',
    footerTag: 'Engineered for international academic and professional transparency.',
    privacy: 'Privacy Policy', terms: 'Terms of Service', admin: 'Admin',
    poweredBy: 'Powered and engineered by',
    heroBadge: 'U.S. Career Guidance for Internationally Educated Job Seekers',
    heroLine1: 'Your Education Abroad.',
    heroLine2: 'Your Next Career Step in the U.S.',
    heroSub: 'Understand how to present your foreign degree to U.S. employers, when you may need an official credential evaluation, and which licensing requirements apply to your field—before you spend money on evaluations.',
    stat1: '180+', stat1L: 'Countries Covered',
    stat2: 'NACES', stat2L: 'Evaluation Resources',
    stat3: '< 2 min', stat3L: 'To Your Roadmap',
    f1t: 'Education Guidance', f1d: 'Keep each original qualification and understand U.S. terminology without an automatic degree equivalency.',
    f2t: 'Evaluation Resources', f2d: 'Learn when to request official evaluation and confirm which service your recipient accepts before paying.',
    f3t: 'Licensing Next Steps', f3d: 'Find authoritative licensing resources. Your profession and state determine the requirements, not this app.',
    f4t: 'Job Board Access', f4d: 'Direct links to U.S. job boards actively seeking internationally educated professionals in your field.',
    createAcc: 'Create Your Account', signInAcc: 'Sign In to Your Account',
    alreadyReg: 'Already registered? Sign In', needAcc: 'Need an account? Sign Up',
    formNote: 'Your information is kept strictly private and never shared with government agencies or third parties.',
    lUser: 'Username', lPass: 'Password', lEmail: 'Correspondence Email',
    pUser: 'e.g., alex_global26', pEmail: 'name@example.com',
    btnCreate: 'Create Account & Access Evaluator', btnSignIn: 'Sign In & Access Evaluator',
    backHome: 'Back to Home', goEval: 'Go to the Evaluator',
    howTitle: 'How VerifED Global Works',
    howSub: 'From your first question to your first U.S. job application — here is the complete process.',
    privTitle: 'Privacy Policy', termsTitle: 'Terms of Service',
    // About page
    aboutBadge: '🌍 Our Mission',
    aboutH1: 'Starting Over in a New Country',
    aboutH2: 'Is One of the Hardest Things a Person Can Do.',
    aboutIntro: 'We know this — because the people who built VerifED Global have lived it, or watched someone they love go through it.',
    about01T: 'The Journey Is Real — and It Is Hard',
    about01P1: 'You spent years earning your education. You worked hard, you sacrificed, and you built something real. Then you arrived in the United States and were told it might not count here — or worse, you were given a dozen different answers from a dozen different people, none of them quite right.',
    about01P2: 'Moving to a new country means rebuilding everything. Your professional identity, your credentials, your career — sometimes even your confidence. The system is not designed to make that easy. And too many talented, qualified people lose years of their lives trying to navigate it alone.',
    about02T: 'The Advice Is Not Always Correct',
    about02P1: 'One of the most painful parts of this process is that people will give you advice — friends, neighbors, even professionals — with complete confidence, and still be wrong. They will tell you your degree does not transfer when it does. They will point you to the wrong evaluation agency. They will underestimate what your credentials are worth, or send you down a path that costs you time and money you cannot afford to lose.',
    about02P2: 'This is not because people are malicious. It is because this system is genuinely complex, and the correct answer depends on your specific country, degree, field, and goal. Generic advice fails people every day.',
    about03T: 'We Are Here to Help Guide You in the Right Direction',
    about03P1: 'VerifED Global was built for one purpose: to give international individuals access to the kind of clear, specific, honest information that can actually move their situation forward. We do not claim to do everything. But we will do our absolute best to point you in the right direction.',
    about03P2: 'We preserve your qualifications, explain U.S. education terms with cited sources, and help you ask employers, admissions offices and licensing boards about their requirements. We do not determine degree equivalency.',
    about03P3: 'We cannot promise the road ahead will be short. But we can promise you will not be walking it without a map.',
    val1T: 'Honest Guidance', val1D: 'We tell you what we know — and what we do not know. No false promises, no shortcuts.',
    val2T: 'Specific Answers', val2D: 'Your country. Your degree. Your field. The right answer depends on all three.',
    val3T: 'Built for the Journey', val3D: 'We are with you from your first question to your first U.S. job application.',
    aboutCtaText: 'Ready to find out how your credentials translate? Start with the evaluator — it takes less than two minutes and gives you a real picture of where you stand.',
    // How It Works page
    howBadge: '⚡ Simple, Step-by-Step',
    stepLabel: 'Step',
    whatNeedTitle: '📦 What You Will Need to Get Started',
    howCtaText: 'Enter each qualification to receive preliminary guidance with sources, limits and next steps. An official comparison requires review of your documents.',
    step01T: 'Create Your Account',
    step01D: 'Sign up with a username and email. Your information stays private and secure — it is used only to save your progress and correspond with you about your evaluation.',
    step01Det: 'We keep your data strictly confidential. It is never shared with government agencies, employers, or third parties.',
    step02T: 'Enter Your Credential Details',
    step02D: 'Add each original award separately, with institution, country, field, duration and completion status where known. The same workflow applies to all countries.',
    step02Det: 'You can also note your primary goal — university admission, employment, professional licensing, or immigration — so we can tailor the roadmap to your path.',
    step03T: 'We Analyze Your Credentials',
    step03D: 'Review preliminary U.S.-context guidance and public institution evidence. Neither confirms authenticity, accreditation, U.S. equivalency nor professional licensure.',
    step03Det: 'Results are generated instantly based on your inputs, giving you a clear starting point before you spend time or money on official evaluations.',
    step04T: 'Follow Your Personalized Roadmap',
    step04D: 'Review missing details, contact your intended recipient about accepted evaluations, and download a dossier containing all qualifications and their uncertainty.',
    step04Det: 'Use the sources to plan your next steps. Institution evidence remains separate from evaluation and professional licensing.',
    step05T: 'Reach Out If You Need Help',
    step05D: 'Stuck? Not sure which evaluation agency fits your situation? Our team is available to answer questions, review your specific case, and help you take the next step.',
    step05Det: 'Use the contact form on the main platform to send us a message. We respond within 24 hours.',
    step06T: 'Start Applying for U.S. Jobs',
    step06D: 'Once your credentials are evaluated, use our integrated job board links to search for positions in your field across Indeed, LinkedIn, Glassdoor, USAJobs, and more.',
    step06Det: 'Many U.S. employers actively recruit internationally educated professionals — your credential evaluation is the documentation that opens those doors.',
    need01L: 'Official transcripts or diploma', need01N: 'Originals or certified copies from your institution',
    need02L: 'Institution name & country', need02N: 'Exactly as it appears on your documents',
    need03L: 'Degree title & field of study', need03N: 'Your specific major or specialization',
    need04L: 'Your U.S. goal', need04N: 'Employment, licensing, grad school, or immigration',
    need05L: 'Correspondence email', need05N: 'So we can follow up with additional guidance',
    need06L: 'Patience — and confidence', need06N: 'The process takes time, but it works',
    // Contact section
    contactTitle: 'Need Help Getting Started?',
    contactDesc: 'Not sure where to begin with your credential transfer? Our team can walk you through the NACES evaluation process, help you choose the right agency, and answer questions about your specific field and country.',
    contactC1: 'Guidance on choosing WES, ECE, or other evaluators',
    contactC2: 'Help gathering documents from your home country',
    contactC3: 'Advice on field-specific U.S. licensing requirements',
    contactC4: 'Support navigating USCIS credential recognition',
    contactSending: 'Sending...',
    contactSent: 'Message Sent Successfully',
    contactSentSub: "Thanks for reaching out. We'll get back to you within 24 hours.",
    contactError: "We couldn't send your message. Please try again.",
    contactLName: 'Your Name', contactLEmail: 'Email Address', contactLMsg: 'How Can We Help?',
    contactPName: 'Full name', contactPMsg: "Describe your credential, country, field, and what you're trying to achieve in the U.S. ...",
    contactBtn: 'Send Message',
    // Job boards
    jobTitle: 'Start Applying Now',
    jobDesc: 'Once you have your credential evaluation, use these job boards to find U.S. positions in your field. Many employers accept international credentials — your roadmap gives you the documentation they need.',
    jobIndeed: 'Search millions of U.S. jobs by title, location, and salary.',
    jobLinkedIn: 'Apply directly and connect with hiring managers.',
    jobGlassdoor: 'Jobs with salary insights and company reviews.',
    jobZip: 'AI-matched job recommendations sent to your inbox.',
    jobUSA: 'Official portal for U.S. federal government positions.',
    jobMonster: 'Job postings across industries nationwide.',
    // Job boards — field-aligned panel
    jobAlignedWith: 'Jobs Aligned with',
    jobAlignedDesc1: 'These U.S. job titles commonly align with a',
    jobAlignedDesc2: 'background. Every link below opens a live, pre-filtered search for your field — not a generic job board homepage.',
    jobRolesTitle: 'Roles That Match Your Field',
    jobRolesTip: 'Each role opens a live U.S. job search you can refine by city and salary.',
    jobPrefiltered: 'jobs — pre-filtered search',
    // Auth errors
    errCorrupt: 'Account data is corrupted and cannot be read. Please contact the administrator.',
    errLoad: 'Unable to load accounts. Please refresh and try again.',
    errTaken: 'An account with that username already exists. Enter your password to sign in.',
    errCredentials: 'Incorrect username or password.',
    errEmail: 'Please enter a valid email address (e.g., name@example.com).',
    errCountry: 'Please select a country from the list (e.g., India, Nigeria, Brazil).',
    errUnexpected: 'An unexpected error occurred. Please refresh and try again.',
    // Service unavailable banner
    svcUnavailableTitle: '🔧 Account service temporarily unavailable',
    svcUnavailableSub: 'Sign-in and registration are temporarily unavailable. Please try again later or contact support.',
    // Evaluator
    evalBadge: 'Educational Pathways Guidance: Aligning with U.S. standard frameworks',
    evalH1: 'Your Education Abroad.',
    evalH2: 'Your Next Career Step in the U.S.',
    evalSubtitle: 'Check your institution’s background, understand how to present your foreign degree to U.S. employers, and explore credential evaluation and licensing requirements for your next career step.',
    evalFormTitle: 'Credential Parameters',
    evalFormStep: 'STEP 1 OF 2',
    evalLCountry: 'Country of Education',
    evalPCountry: 'e.g., India, Nigeria, Brazil, UK',
    evalLInstitution: 'Institution Name',
    evalPInstitution: 'e.g., University of Lagos',
    evalLDegree: 'Degree Level',
    evalPDegree: 'e.g., B.Sc, M.Eng, MBBS',
    evalLField: 'Field of Study',
    evalPField: 'e.g., Accounting, Computer Science',
    evalLCredits: 'Credits / Years',
    evalLCreditsOpt: '(Opt)',
    evalPCredits: 'e.g., 4 Years / 180 ECTS',
    evalLGoal: 'Primary Goal',
    evalOptGoal: 'Select goal...',
    evalGoal1: 'University Admission',
    evalGoal2: 'Employment / HR',
    evalGoal3: 'Professional Licensing',
    evalGoal4: 'Immigration (USCIS)',
    evalBtn: 'Crawl & Generate Equivalency Report',
    evalCrawlComplete: 'Evaluation Guidance Ready',
    evalSummaryPre: 'Self-reported education level:',
    evalSummaryMid: 'from',
    evalSummaryPost: 'This repeats the level entered and is not an official U.S. equivalency determination.',
    evalInsightTitle: 'Industry Regulatory Pathway',
    evalRoadmapTitle: 'Verification Action Roadmap',
    evalRoadmapSynced: 'Synced',
    evalRoadmapDesc: 'Check each step to expand its action details and track your progress through the evaluation process:',
    evalEmptyTitle: 'Educational Pathways Awaiting Input',
    evalEmptyDesc: 'Fill out your academic parameters on the left to review alignment with U.S. standards and build your roadmap.',
    // Roadmap steps — titles & descriptions (static parts)
    rm1Title: 'Verify Institutional Credentials for',
    rm1DescPre: 'Review',
    rm1DescSuf: 'public non-government evidence for country, higher-education type, official website listing, and reported closure history. This does not determine accreditation.',
    rm2Title: 'Map Coursework to NACES-Accredited Standards',
    rm2DescPre: 'Convert regional credit hours to U.S. semester credit units (SCU) matching standard undergraduate/graduate benchmarks for',
    rm3TitlePre: 'Align with',
    rm3TitleFallback: 'General U.S. Employment/Admission',
    rm3TitleSuf: 'Prerequisites',
    rm3Desc: 'Extract specific state board guidelines, GPA conversion rules, and prerequisite course minimums.',
    rm4Title: 'Prepare Official NACES Application Dossier',
    rm4Desc: 'Compile your provided information into a structured document to reference while preparing your official application for WES, ECE, or Josef Silny & Associates.',
    // Verify step content
    verifyStatus: 'Public Evidence Check',
    verifyInstitution: 'Institution',
    verifyCountry: 'Country',
    verifyDegree: 'Degree Recorded',
    verifyRegistry: 'Registry Source',
    verifyRegistrySuf: 'Wikidata, Wikipedia, and Internet Archive when applicable',
    verifyRecognition: 'Recognition Status',
    verifyRecognitionVal: 'Not checked — no accreditation claim is made',
    verifyWES: 'WES Eligibility',
    verifyWESVal: 'Not checked by this public evidence search',
    verifyECE: 'ECE Eligibility',
    verifyECEVal: 'Not checked by this public evidence search',
    verifyActionLabel: 'Open primary evidence record',
    // Coursework step content
    cwColSubject: 'Subject / Course Block',
    cwColSCU: 'U.S. SCU',
    cwColNotes: 'Notes',
    cwNACESLink: 'View all NACES member agencies →',
    cwTotalEstimated: 'Estimated from',
    cwTotalDefault: 'Estimated 120–130 SCU total',
    // Prereq step content (labels)
    preqCPACredit: 'CPA Credit Requirement',
    preqCPACreditVal: '150 semester credit hours (most states)',
    preqGPA: 'GPA Conversion',
    preqGPAVal: 'Foreign GPA converted via WES GPA calculator; typically 2.5+ U.S. equivalent required',
    preqAcctHrs: 'Accounting Hours Minimum',
    preqAcctHrsVal: '24–30 SCU in accounting subjects',
    preqBizHrs: 'Business Hours Minimum',
    preqBizHrsVal: '24 SCU in general business',
    preqNASBA: 'State Board Link',
    preqNASBAVal: 'NASBA – National Association of State Boards of Accountancy',
    preqFE: 'FE Exam Eligibility',
    preqFEVal: 'Credential evaluation required before sitting for NCEES FE exam',
    preqGPAMin: 'GPA Minimum',
    preqGPAMinVal: '2.0 U.S. equivalent on 4.0 scale (varies by state board)',
    preqABET: 'ABET Review',
    preqABETVal: 'Non-ABET programs evaluated course-by-course; deficiencies may require additional coursework',
    preqNCEES: 'PE Licensing Board',
    preqNCEESVal: 'NCEES – National Council of Examiners for Engineering',
    preqCGFNS: 'CGFNS Certification',
    preqCGFNSVal: 'Required for international nurses before NCLEX',
    preqEnglish: 'English Proficiency',
    preqEnglishVal: 'TOEFL iBT 83+ or IELTS 6.5+ typically required',
    preqClinical: 'Clinical Hours Verification',
    preqClinicalVal: 'State board reviews clinical logs from home country program',
    preqNCLEX: 'NCLEX Board',
    preqNCLEXVal: 'NCSBN – National Council of State Boards of Nursing',
    preqGPAGen: 'GPA Conversion',
    preqGPAGenVal: 'Convert via WES iGPA Calculator; 3.0+ U.S. recommended for graduate programs',
    preqEnglishGen: 'English Proficiency',
    preqEnglishGenVal: 'TOEFL or IELTS may be required for admission or licensing',
    preqCredEval: 'Credential Evaluation',
    preqCredEvalVal: 'NACES-member agency evaluation letter required for most employers and schools',
    preqUSCIS: 'USCIS Recognition',
    preqUSCISVal: 'Form I-140 or EB-2/EB-3 petition may require credential evaluation letter',
    preqGradAdm: 'Graduate Admissions',
    preqGradAdmVal: 'Most U.S. graduate programs require official NACES evaluation + certified translations',
    // Dossier step
    dossierDesc: 'Your dossier is compiled from the information you provided and the data pulled across all steps above. It includes your credential summary, institutional verification, NACES agency recommendations, U.S. regulatory requirements, and your equivalency tags — formatted and ready to accompany your official evaluation application.',
    dossierItem1: 'Credential Summary',
    dossierItem2: 'Institutional Verification',
    dossierItem3: 'NACES Agency List',
    dossierItem4: 'Regulatory Pathway',
    dossierItem5: 'U.S. Equivalency Tags',
    dossierItem6: 'Compliance Disclaimer',
    dossierDownload: 'Download NACES Application Dossier',
    dossierDownloaded: '✓ Dossier Downloaded',
    dossierOpenNote: 'Open the downloaded file in your browser to print or save as PDF.',
    // Agency outreach
    agencyTitle: 'Contact NACES Agencies',
    agencyDescPre: 'A personalized inquiry email has been drafted for you using your evaluation details',
    agencyDescEmail: 'and your account email',
    agencyDescSuf: '. Open it in your email app, or copy it and paste it into the contact form on the agency\'s website — it sends from your own address, so replies come straight back to you.',
    agencyDraft: '✉️ Draft',
    agencyCopy: 'Copy',
    agencyCopied: '✓ Copied',
    agencySite: 'Site ↗',
    agencyMemberSince: 'Member since',
    agencyMark: 'Mark contacted',
    agencyContacted: '✓ Contacted',
    agencyTip: 'Tip: you do not need to contact every agency — pick 2–3 whose fees and turnaround fit your goal. Each agency\'s exact contact email or inquiry form is on its website.',
    // U.S. degree level labels
    usLevelMaster: "Master's Degree",
    usLevelDoctor: 'Doctoral Degree',
    usLevelAssociate: 'Associate Degree / Postsecondary Diploma',
    usLevelBachelor: "Bachelor's Degree",
    usLevelSecondary: 'High School Diploma / Secondary Education',
    usLevelUnknown: 'Undetermined — more credential detail is required',
    // Insight text
    insightAccount: "• CPA Licensure Pathway: Most U.S. state boards require 150 semester credit hours. Foreign accounting coursework is mapped course-by-course to satisfy specific accounting and business subject minimums.\n• Professional Competitiveness: Supplemental designations like CFA, CIA, or FMVA can strengthen your profile in corporate finance and investment banking.",
    insightEngineering: "• Technical Equivalency: ABET-equivalent coursework mapping is standard for engineering degrees. Professional Engineer (PE) licensure requires passing the FE exam.\n• Industry Alignment: High recognition for international tech degrees; portfolios, GitHub activity, and cloud/security certifications carry substantial weight.",
    insightHealth: "• Healthcare Regulatory Requirements: Healthcare fields require state licensing board credential review, English language testing, and board examinations (such as the NCLEX).",
    insightGeneral: "• General Professional Recognition: Your credential aligns well with standard U.S. employment and admissions frameworks. Review specific institutional prerequisite checklists.",
    // Admin
    adminTitle: 'Admin Dashboard',
    adminAccountSingular: 'registered account',
    adminAccountPlural: 'registered accounts',
    adminRefresh: '↻ Refresh',
    adminRefreshList: '↻ Refresh list',
    adminSearchPlaceholder: 'Search by username or email…',
    adminNoUsers: 'No users have registered yet.',
    adminNoResults: 'No results match your search.',
    adminConnecting: 'Connecting to the central database…',
    adminConnectionFailed: 'The central database could not be reached. Your saved accounts have not been deleted. Refresh to reconnect.',
    adminCountUnavailable: 'Account count temporarily unavailable',
    adminFieldEmail: 'Email',
    adminFieldPassword: 'Password',
    adminFieldJoined: 'Joined',
    adminEmailMissing: '⚠ Still needed',
    adminPassSet: '✓ Set ·',
    adminFieldsNeededSingular: 'field still needed:',
    adminFieldsNeededPlural: 'fields still needed:',
    adminResetTitle: 'Reset Password',
    adminResetFor: 'Setting new password for',
    adminResetLNew: 'New Password',
    adminResetPNew: 'Min. 6 characters',
    adminResetLConfirm: 'Confirm New Password',
    adminResetPConfirm: 'Repeat password',
    adminResetBtn: 'Update Password',
    adminCancelBtn: 'Cancel',
    adminResetErrEmpty: 'Password cannot be empty.',
    adminResetErrMatch: 'Passwords do not match.',
    adminResetSuccess: '✓ Password updated successfully.',
    adminDeleteTitle: 'Delete Account?',
    adminDeleteMsg1: 'This will permanently delete',
    adminDeleteMsg2: 'and all their data. This cannot be undone.',
    adminDeleteBtn: 'Yes, Delete',
    // Server-mode / admin-key strings (ours from main)
    adminModeServer: '● Central database — all devices',
    adminModeLocal: '⚠ This device only — backend offline',
    adminKeyTitle: '🔑 Admin key required',
    adminKeyDesc: 'The central database is protected. Enter the admin key to view and manage accounts on this device.',
    adminKeyPlaceholder: 'Admin key…',
    adminKeyBtn: 'Unlock',
    adminKeyRejected: 'The saved key was rejected — please enter it again.',
    adminKeyNotConfigured: "The server doesn't have an admin key loaded yet — it needs to be republished on Replit after the key is saved. Until then, no key will be accepted.",
    adminGateTitle: '🔐 Admin access',
    adminGateDesc: 'This area is for administrators only. Enter the admin password to continue.',
    adminGatePlaceholder: 'Admin password…',
    adminGateBtn: 'Enter',
    adminGateWrong: 'Incorrect password.',
    adminGateOffline: 'The server cannot be reached to verify the password. Admin access stays locked — try again when you are back online.',
    adminFieldSchool: 'School',
    adminFieldCountry: 'Country',
    adminFieldIntention: 'Intention',
    adminFieldNotProvided: 'Not provided yet',
    adminResetErrServer: 'Could not reach the server. Try again.',
    // Privacy & Terms modal bodies
    privP1: '<strong>Strict Privacy &amp; Independence Notice:</strong> VerifED Global is a private, separate, and independent commercial company designed strictly to help international individuals navigate their educational and professional experience in the United States.',
    privP2: '<strong>Basic Information &amp; Purpose:</strong> We collect basic account credentials (username, password, and correspondence email) solely to keep records and properly correspond with you regarding your credential evaluation roadmap.',
    privP3: '<strong>Zero Data Selling &amp; Absolute Government Protection:</strong> <strong>We will never sell your information, nor will we ever hand over, share, or disclose any user data, personal records, or search inputs to any government agencies, immigration authorities, or external third parties.</strong> Your data remains strictly confidential, private, and secure within our platform.',
    termsP1: 'Welcome to VerifED Global. By creating an account and logging in, you agree to these terms of service.',
    termsP2: '<strong>Marketing and Communication Agreement:</strong> By signing up with your username, password, and email, <strong>you expressly agree to receive marketing, platform updates, and service communication emails from us.</strong> You may opt out of communications at any time by contacting support.',
    termsP3: '<strong>Non-Official Preview:</strong> All credential mappings generated by this application are for preliminary guidance and informational purposes only and do not constitute official NACES-accredited evaluations.',
    termsP4: 'All intellectual property and code assets are engineered by LAD MEDIA.',
    // Dossier HTML (export)
    dossierSubtitle: '2026 Credential Engine — NACES Application Dossier',
    dossierGenerated: 'Generated:',
    dossierSecCredential: 'Credential Summary',
    dossierSecVerification: 'Institutional Verification',
    dossierSecNACES: 'Recommended NACES Agencies',
    dossierSecRegulatory: 'U.S. Regulatory Pathway Notes',
    dossierSecInsight: 'Regulatory Insight',
    dossierSecTags: 'Credential Tags',
    dossierRowInstitution: 'Applicant Institution',
    dossierRowCountry: 'Country of Education',
    dossierRowDegree: 'Degree Level',
    dossierRowField: 'Field of Study',
    dossierRowUSEq: 'Self-Reported Education Level',
    dossierRowGoal: 'Primary Goal',
    dossierDisclaimer: '<strong>Disclaimer:</strong> This dossier is generated by VerifED Global for preliminary guidance only. It does not constitute an official NACES-accredited credential evaluation. For official recognition, submit your documents to a NACES-member agency listed above. VerifED Global is a private, independent platform not affiliated with any government body.',
    dossierFooter: '© 2026 VerifED Global. Engineered by LAD MEDIA. All rights reserved.',
    // Coursework course names (EN)
    cwAcct1: 'Financial Accounting I & II',
    cwAcct2: 'Cost & Managerial Accounting',
    cwAcct3: 'Auditing & Assurance',
    cwAcct4: 'Taxation (Domestic/International)',
    cwAcct5: 'Business Law',
    cwAcct6: 'Economics (Micro + Macro)',
    cwEng1: 'Calculus I–III',
    cwEng2: 'Physics I & II',
    cwEng3: 'Core Engineering / CS Courses',
    cwEng4: 'Capstone / Thesis',
    cwHealth1: 'Anatomy & Physiology',
    cwHealth2: 'Pharmacology',
    cwHealth3: 'Nursing Theory & Practice',
    cwHealth4: 'Clinical Hours',
    cwGen1: 'Core Major Courses',
    cwGen2: 'General Education',
    cwGen3: 'Electives',
    cwGen4: 'Thesis / Capstone',
    // Coursework notes (EN)
    cwNoteAASCB: 'Matches AACSB benchmark',
    cwNoteCPAPath: 'Required for CPA pathway',
    cwNoteStateMin: 'State board minimum',
    cwNoteTaxElec: 'Maps to U.S. tax law elective',
    cwNote150: 'Required for 150-hour CPA rule',
    cwNoteCoreBiz: 'Core business requirement',
    cwNoteABETMath: 'ABET math foundation',
    cwNoteLabCred: 'Lab credits included',
    cwNoteMajorMap: 'Major-specific mapping',
    cwNoteSenDes: 'Counts toward senior design',
    cwNoteWithLab: 'With lab',
    cwNoteClinReq: 'Clinical requirement',
    cwNoteNCLEXPre: 'NCLEX prerequisite',
    cwNoteStateBdMin: 'State board minimum varies',
    cwNoteCourseRev: 'Subject to course-by-course review',
    cwNoteGenEd: 'English, Math, Sciences, Humanities',
    cwNoteInstElec: 'Institutional electives',
    cwNoteIfApp: 'If applicable',
    sfTitle: 'University Search (Public Data)',
    sfDesc: 'Search public U.S. colleges/universities using current U.S. Department of Education College Scorecard data.',
    sfErrSetup: 'The Department of Education integration is not fully configured yet. Please contact the administrator.',
    sfErrSource: 'The Department of Education source is temporarily unavailable. Please try again later.',
    sfContactUnavailable: 'Contact information could not be verified.',
    sfOutreachDisclaimer: 'VerifED is forwarding self-reported information and is not an official equivalency or admission determination.',
    sfOutreachNote: '"Sent" indicates the inquiry was accepted by the email provider, not necessarily delivered to or read by admissions staff.',
    sfErrNoValidEmails: 'No verified email recipients found for the selected schools.',
    sfConfirmCip: 'Confirm Program Category',
    sfConfirmCipDesc: 'Select the exact program category to match official reporting codes (CIP).',
    sfCip1107: 'Computer Science (1107)',
    sfCip5202: 'Business Administration (5202)',
    sfCip5203: 'Accounting (5203)',
    sfCip5138: 'Nursing (5138)',
    sfCip1312: 'Teacher Education (1312)',
    sfCip1401: 'Engineering (1401)',
    sfCip2201: 'Law (2201)',
    sfCip4201: 'Psychology (4201)',
    sfCip2601: 'Biology (2601)',
    sfCip5007: 'Visual Arts (5007)',
    sfFilterNationwide: 'Nationwide',
    sfFilterState: 'Filter by State',
    sfFilterOnline: 'Online or Campus?',
    sfFilterOnlineAny: 'Any',
    sfFilterOnlineOnly: 'Online Only',
    sfFilterCampusOnly: 'Campus Only',
    sfFilterDegree: 'Credential Sought',
    sfFilterDegAny: 'Any Credential',
    sfFilterDegCert: 'Certificate',
    sfFilterDegAssoc: 'Associate',
    sfFilterDegBach: 'Bachelor',
    sfFilterDegGrad: 'Graduate',
    sfBtnSearch: 'Search Schools',
    sfSearching: 'Searching College Scorecard...',
    sfNoResults: 'No public institutions matched this program in the selected area.',
    sfSourceNote: 'Data retrieved from official U.S. Department of Education records.',
    sfSourceLabel: 'Source:',
    sfRetrievedLabel: 'retrieved',
    sfSize: 'Students:',
    sfCalc: 'Price Calculator',
    sfSave: 'Save',
    sfSaved: 'Saved',
    sfOutreachTitle: 'Admissions Outreach',
    sfOutreachDesc: 'Select up to 10 saved schools to send a preliminary inquiry.',
    sfOutreachConsent: 'I understand this is an informational inquiry only, and not an official equivalency or admission application.',
    sfBtnContact: 'Send Inquiry',
    sfSending: 'Sending...',
    sfOutreachSent: 'Sent',
    sfOutreachFailed: 'Failed',
    sfOutreachUnattempted: 'Not attempted',
    sfPlaceholderCip: 'Select a program category...',
    sfFilterStateOpt: 'Optional: Filter by U.S. State',
    sfPublic: 'Public',
    sfOnline: 'Online',
    sfMatchedProgram: 'Program:',
    sfNA: 'N/A',
    sfSite: 'Site',
    sfSavedSchools: 'Saved Schools',
    sfPreviewOutreach: 'Preview Outreach',
    sfPreviewData: 'Preview of self-reported data to send:',
    sfPackageCountry: 'Country:',
    sfPackageInst: 'Institution:',
    sfPackageDegree: 'Degree:',
    sfPackageField: 'Field:',
    sfPackagePurpose: 'Purpose:',
    sfUnknownSchool: 'Unknown school',
    sfVerifiedRecipients: 'Verified Recipients:',
    sfFormFallback: 'Form Fallback:',
    sfRecentInquiries: 'Recent Inquiries',
    sfErrSearch: 'Failed to search schools. Please try again.',
    sfErrSync: 'Failed to sync saved schools. Please try again.',
    sfErrContacts: 'Failed to load contact info.',
        sfErrSend: 'Failed to send outreach.',
  },
  es: {
    about: 'Acerca de', howItWorks: 'Cómo Funciona', signOut: 'Cerrar Sesión',
    footerCopy: '© 2026 VerifED Global. Todos los derechos reservados.',
    footerTag: 'Diseñado para la transparencia académica y profesional internacional.',
    privacy: 'Política de Privacidad', terms: 'Términos de Servicio', admin: 'Administrador',
    poweredBy: 'Desarrollado e impulsado por',
    heroBadge: 'Orientación profesional en EE.UU. para quienes buscan empleo con estudios en el extranjero',
    heroLine1: 'Tu educación en el extranjero.',
    heroLine2: 'Tu próximo paso profesional en EE.UU.',
    heroSub: 'Descubre cómo presentar tu título extranjero a empleadores en EE.UU., cuándo podrías necesitar una evaluación oficial de credenciales y qué requisitos de licencia se aplican a tu campo, antes de gastar dinero en evaluaciones.',
    stat1: '180+', stat1L: 'Países Cubiertos',
    stat2: 'NACES', stat2L: 'Recursos de evaluación',
    stat3: '< 2 min', stat3L: 'Para Tu Hoja de Ruta',
    f1t: 'Orientación educativa', f1d: 'Conserve cada titulación original y conozca la terminología estadounidense sin equivalencias automáticas.',
    f2t: 'Recursos de evaluación', f2d: 'Sepa cuándo solicitar una evaluación oficial y confirme qué servicio acepta el destinatario antes de pagar.',
    f3t: 'Próximos pasos de licencia', f3d: 'Consulte fuentes autorizadas. Su profesión y estado determinan los requisitos, no esta aplicación.',
    f4t: 'Bolsas de Trabajo', f4d: 'Links directos a bolsas de trabajo de EE.UU. que buscan activamente profesionales educados internacionalmente en tu campo.',
    createAcc: 'Crear Tu Cuenta', signInAcc: 'Iniciar Sesión',
    alreadyReg: '¿Ya tienes cuenta? Inicia Sesión', needAcc: '¿Necesitas una cuenta? Regístrate',
    formNote: 'Tu información se mantiene estrictamente privada y nunca se comparte con agencias gubernamentales ni terceros.',
    lUser: 'Usuario', lPass: 'Contraseña', lEmail: 'Correo de Correspondencia',
    pUser: 'ej., alex_global26', pEmail: 'nombre@ejemplo.com',
    btnCreate: 'Crear Cuenta y Acceder al Evaluador', btnSignIn: 'Iniciar Sesión y Acceder al Evaluador',
    backHome: 'Volver al Inicio', goEval: 'Ir al Evaluador',
    howTitle: 'Cómo Funciona VerifED Global',
    howSub: 'Desde tu primera pregunta hasta tu primera solicitud de empleo en EE.UU. — aquí está el proceso completo.',
    privTitle: 'Política de Privacidad', termsTitle: 'Términos de Servicio',
    // About page
    aboutBadge: '🌍 Nuestra Misión',
    aboutH1: 'Empezar de Nuevo en un País Extranjero',
    aboutH2: 'Es Una de las Cosas Más Difíciles que una Persona Puede Hacer.',
    aboutIntro: 'Lo sabemos — porque las personas que construyeron VerifED Global lo han vivido, o han visto a alguien que aman pasar por ello.',
    about01T: 'El Camino Es Real — y Es Difícil',
    about01P1: 'Pasaste años ganando tu educación. Trabajaste duro, te sacrificaste y construiste algo real. Luego llegaste a los Estados Unidos y te dijeron que quizás no cuenta aquí — o peor, te dieron docenas de respuestas diferentes de docenas de personas diferentes, ninguna del todo correcta.',
    about01P2: 'Mudarse a un nuevo país significa reconstruir todo. Tu identidad profesional, tus credenciales, tu carrera — a veces hasta tu confianza. El sistema no está diseñado para hacer eso fácil. Y demasiadas personas talentosas y calificadas pierden años de su vida intentando navegarlo solos.',
    about02T: 'El Consejo No Siempre Es Correcto',
    about02P1: 'Una de las partes más dolorosas de este proceso es que la gente te dará consejos — amigos, vecinos, incluso profesionales — con total confianza, y aun así estar equivocados. Te dirán que tu título no aplica cuando sí aplica. Te dirigirán a la agencia evaluadora incorrecta. Subestimarán el valor de tus credenciales, o te enviarán por un camino que te cuesta tiempo y dinero que no puedes permitirte perder.',
    about02P2: 'Esto no es porque la gente sea maliciosa. Es porque este sistema es genuinamente complejo, y la respuesta correcta depende de tu país, título, campo y objetivo específicos. El consejo genérico falla a las personas todos los días.',
    about03T: 'Estamos Aquí Para Guiarte en la Dirección Correcta',
    about03P1: 'VerifED Global fue construido con un propósito: darle a las personas internacionales acceso al tipo de información clara, específica y honesta que realmente puede mover su situación hacia adelante. No pretendemos hacerlo todo. Pero haremos nuestro mejor esfuerzo para señalarte en la dirección correcta.',
    about03P2: 'Conservamos sus titulaciones, explicamos términos educativos estadounidenses con fuentes y le ayudamos a consultar requisitos con empleadores, admisiones y juntas de licencias. No determinamos equivalencias.',
    about03P3: 'No podemos prometer que el camino por delante será corto. Pero sí podemos prometerte que no lo caminarás sin un mapa.',
    val1T: 'Orientación Honesta', val1D: 'Te decimos lo que sabemos — y lo que no sabemos. Sin promesas falsas, sin atajos.',
    val2T: 'Respuestas Específicas', val2D: 'Tu país. Tu título. Tu campo. La respuesta correcta depende de los tres.',
    val3T: 'Construido Para el Camino', val3D: 'Estamos contigo desde tu primera pregunta hasta tu primera solicitud de empleo en EE.UU.',
    aboutCtaText: '¿Listo para descubrir cómo se traducen tus credenciales? Comienza con el evaluador — tarda menos de dos minutos y te da una imagen real de dónde estás.',
    // How It Works page
    howBadge: '⚡ Simple, Paso a Paso',
    stepLabel: 'Paso',
    whatNeedTitle: '📦 Lo Que Necesitarás Para Comenzar',
    howCtaText: 'Ingrese cada titulación para recibir orientación preliminar con fuentes, límites y próximos pasos. Una comparación oficial requiere revisar sus documentos.',
    step01T: 'Crear Tu Cuenta',
    step01D: 'Regístrate con un nombre de usuario y correo electrónico. Tu información permanece privada y segura — solo se usa para guardar tu progreso y corresponderte sobre tu evaluación.',
    step01Det: 'Mantenemos tus datos estrictamente confidenciales. Nunca se comparten con agencias gubernamentales, empleadores ni terceros.',
    step02T: 'Ingresa los Detalles de Tu Credencial',
    step02D: 'Agregue cada título original por separado con institución, país, área, duración y estado de finalización cuando los conozca. El flujo es igual para todos los países.',
    step02Det: 'También puedes indicar tu objetivo principal — admisión universitaria, empleo, licencia profesional o inmigración — para adaptar la hoja de ruta a tu camino.',
    step03T: 'Analizamos Tus Credenciales',
    step03D: 'Revise orientación preliminar sobre EE. UU. y evidencia pública institucional. No confirma autenticidad, acreditación, equivalencia ni licencia profesional.',
    step03Det: 'Los resultados se generan al instante en base a tus datos, dándote un punto de partida claro antes de que gastes tiempo o dinero en evaluaciones oficiales.',
    step04T: 'Sigue Tu Hoja de Ruta Personalizada',
    step04D: 'Revise los datos faltantes, consulte al destinatario sobre evaluaciones aceptadas y descargue un expediente de todas sus titulaciones con sus incertidumbres.',
    step04Det: 'Use las fuentes para planificar sus próximos pasos. La evidencia institucional es distinta de la evaluación y la licencia profesional.',
    step05T: '¿Necesitas Ayuda? Contáctanos',
    step05D: '¿Bloqueado? ¿No sabes qué agencia evaluadora aplica a tu situación? Nuestro equipo está disponible para responder preguntas, revisar tu caso y ayudarte a dar el siguiente paso.',
    step05Det: 'Usa el formulario de contacto en la plataforma principal para enviarnos un mensaje. Respondemos en 24 horas.',
    step06T: 'Comienza a Solicitar Empleos en EE.UU.',
    step06D: 'Una vez evaluadas tus credenciales, usa nuestros links integrados de bolsas de trabajo para buscar posiciones en tu campo en Indeed, LinkedIn, Glassdoor, USAJobs y más.',
    step06Det: 'Muchos empleadores de EE.UU. reclutan activamente a profesionales educados internacionalmente — la evaluación de tu credencial es la documentación que abre esas puertas.',
    need01L: 'Transcripciones o diploma oficial', need01N: 'Originales o copias certificadas de tu institución',
    need02L: 'Nombre de la institución y país', need02N: 'Exactamente como aparece en tus documentos',
    need03L: 'Título y campo de estudio', need03N: 'Tu especialidad o área de concentración específica',
    need04L: 'Tu objetivo en EE.UU.', need04N: 'Empleo, licencia, posgrado o inmigración',
    need05L: 'Correo de correspondencia', need05N: 'Para que podamos orientarte con guía adicional',
    need06L: 'Paciencia — y confianza', need06N: 'El proceso lleva tiempo, pero funciona',
    // Contact section
    contactTitle: '¿Necesitas Ayuda Para Comenzar?',
    contactDesc: '¿No sabes por dónde empezar con tu transferencia de credenciales? Nuestro equipo puede guiarte a través del proceso de evaluación NACES, ayudarte a elegir la agencia correcta y responder preguntas sobre tu campo y país específicos.',
    contactC1: 'Orientación para elegir WES, ECE u otros evaluadores',
    contactC2: 'Ayuda para recopilar documentos de tu país de origen',
    contactC3: 'Asesoría sobre requisitos de licencia en EE.UU. por campo',
    contactC4: 'Apoyo para navegar el reconocimiento de credenciales del USCIS',
    contactSending: 'Enviando...',
    contactSent: 'Mensaje Enviado Correctamente',
    contactSentSub: 'Gracias por escribirnos. Te responderemos en 24 horas.',
    contactError: 'No pudimos enviar tu mensaje. Inténtalo de nuevo.',
    contactLName: 'Tu Nombre', contactLEmail: 'Dirección de Correo', contactLMsg: '¿Cómo Podemos Ayudarte?',
    contactPName: 'Nombre completo', contactPMsg: 'Describe tu credencial, país, campo y lo que intentas lograr en EE.UU. ...',
    contactBtn: 'Enviar Mensaje',
    // Job boards
    jobTitle: 'Comienza a Aplicar Ahora',
    jobDesc: 'Una vez que tengas tu evaluación de credenciales, usa estas bolsas de trabajo para encontrar posiciones en EE.UU. en tu campo. Muchos empleadores aceptan credenciales internacionales — tu hoja de ruta te da la documentación que necesitan.',
    jobIndeed: 'Busca millones de empleos en EE.UU. por título, ubicación y salario.',
    jobLinkedIn: 'Postúlate directamente y conecta con gerentes de contratación.',
    jobGlassdoor: 'Empleos con información de salarios y reseñas de empresas.',
    jobZip: 'Recomendaciones de empleo con IA enviadas a tu bandeja de entrada.',
    jobUSA: 'Portal oficial para puestos del gobierno federal de EE.UU.',
    jobMonster: 'Publicaciones de empleo en industrias de todo el país.',
    // Job boards — field-aligned panel
    jobAlignedWith: 'Empleos Alineados con',
    jobAlignedDesc1: 'Estos títulos de empleo en EE.UU. comúnmente se alinean con un perfil de',
    jobAlignedDesc2: '. Cada enlace abre una búsqueda en vivo y prefiltrada para tu campo — no la página principal genérica de la bolsa de trabajo.',
    jobRolesTitle: 'Puestos que Coinciden con Tu Campo',
    jobRolesTip: 'Cada puesto abre una búsqueda de empleo en vivo en EE.UU. que puedes refinar por ciudad y salario.',
    jobPrefiltered: 'empleos — búsqueda prefiltrada',
    // Auth errors
    errCorrupt: 'Los datos de la cuenta están corruptos y no se pueden leer. Por favor contacte al administrador.',
    errLoad: 'No se pudieron cargar las cuentas. Por favor recargue e intente de nuevo.',
    errTaken: 'Ya existe una cuenta con ese nombre de usuario. Ingresa tu contraseña para iniciar sesión.',
    errCredentials: 'Usuario o contraseña incorrectos.',
    errEmail: 'Por favor ingresa un correo electrónico válido (ej., nombre@ejemplo.com).',
    errCountry: 'Por favor selecciona un país de la lista (ej., India, Nigeria, Brasil).',
    errUnexpected: 'Ocurrió un error inesperado. Por favor recargue e intente de nuevo.',
    // Service unavailable banner
    svcUnavailableTitle: '🔧 Servicio de cuentas temporalmente no disponible',
    svcUnavailableSub: 'El inicio de sesión y el registro están temporalmente no disponibles. Por favor intente más tarde o contacte al soporte.',
    // Evaluator
    evalBadge: '⚡ Plataforma Unificada: Procesando marcos NACES, USCIS y Juntas Estatales en tiempo real.',
    evalH1: 'Tu educación en el extranjero.',
    evalH2: 'Tu próximo paso profesional en EE.UU.',
    evalSubtitle: 'Consulta los antecedentes de tu institución, descubre cómo presentar tu título extranjero a empleadores en EE.UU. y explora los requisitos de evaluación de credenciales y licencia para tu próximo paso profesional.',
    evalFormTitle: 'Parámetros de Credencial',
    evalFormStep: 'PASO 1 DE 2',
    evalLCountry: 'País de Estudios',
    evalPCountry: 'ej., India, Nigeria, Brasil, Reino Unido',
    evalLInstitution: 'Nombre de la Institución',
    evalPInstitution: 'ej., Universidad de Lagos',
    evalLDegree: 'Nivel del Título',
    evalPDegree: 'ej., B.Sc, M.Eng, MBBS',
    evalLField: 'Campo de Estudio',
    evalPField: 'ej., Contabilidad, Ciencias de la Computación',
    evalLCredits: 'Créditos / Años',
    evalLCreditsOpt: '(Opc)',
    evalPCredits: 'ej., 4 Años / 180 ECTS',
    evalLGoal: 'Objetivo Principal',
    evalOptGoal: 'Selecciona objetivo...',
    evalGoal1: 'Admisión Universitaria',
    evalGoal2: 'Empleo / RRHH',
    evalGoal3: 'Licencia Profesional',
    evalGoal4: 'Inmigración (USCIS)',
    evalBtn: 'Consultar y Generar Informe de Equivalencia',
    evalCrawlComplete: 'Consulta de Plataforma Completa',
    evalSummaryPre: 'Nivel educativo autodeclarado:',
    evalSummaryMid: 'de',
    evalSummaryPost: 'Esto repite el nivel ingresado y no es una determinación oficial de equivalencia en EE.UU.',
    evalInsightTitle: 'Ruta Regulatoria por Industria',
    evalRoadmapTitle: 'Hoja de Ruta de Acción de la Plataforma',
    evalRoadmapSynced: 'Sincronizado',
    evalRoadmapDesc: 'Marca cada paso para expandir los detalles de acción y hacer seguimiento de tu progreso en el proceso de evaluación:',
    evalEmptyTitle: 'Plataforma en Espera de Datos',
    evalEmptyDesc: 'Completa tus parámetros académicos a la izquierda para iniciar la consulta de bases de datos y construir tu hoja de ruta.',
    // Roadmap steps — titles & descriptions (static parts)
    rm1Title: 'Verificar Credenciales Institucionales de',
    rm1DescPre: 'Consulta automatizada de registros del',
    rm1DescSuf: 'evidencia pública no gubernamental sobre país, tipo de educación superior, sitio oficial listado e historial de cierre informado. Esto no determina acreditación.',
    rm2Title: 'Mapear Plan de Estudios a Estándares NACES',
    rm2DescPre: 'Convertir créditos regionales a unidades de crédito semestral de EE.UU. (SCU) según los referentes de pregrado/posgrado estándar para',
    rm3TitlePre: 'Alinear con',
    rm3TitleFallback: 'Empleo/Admisión General en EE.UU.',
    rm3TitleSuf: 'Requisitos Previos',
    rm3Desc: 'Extraer lineamientos específicos de juntas estatales, reglas de conversión de GPA y mínimos de cursos previos.',
    rm4Title: 'Exportar Expediente Oficial de Solicitud NACES',
    rm4Desc: 'Compilar tu paquete de datos en un formato estandarizado listo para envío directo a WES, ECE o Josef Silny & Associates.',
    // Verify step content
    verifyStatus: 'Comprobación de evidencia pública',
    verifyInstitution: 'Institución',
    verifyCountry: 'País',
    verifyDegree: 'Título Registrado',
    verifyRegistry: 'Fuente del Registro',
    verifyRegistrySuf: 'Wikidata, Wikipedia e Internet Archive cuando corresponda',
    verifyRecognition: 'Estado de Reconocimiento',
    verifyRecognitionVal: 'No comprobada — no se afirma acreditación',
    verifyWES: 'Elegibilidad WES',
    verifyWESVal: 'No comprobada por esta búsqueda de evidencia pública',
    verifyECE: 'Elegibilidad ECE',
    verifyECEVal: 'No comprobada por esta búsqueda de evidencia pública',
    verifyActionLabel: 'Abrir el registro de evidencia principal',
    // Coursework step content
    cwColSubject: 'Materia / Bloque de Cursos',
    cwColSCU: 'SCU EE.UU.',
    cwColNotes: 'Notas',
    cwNACESLink: 'Ver todas las agencias miembros de NACES →',
    cwTotalEstimated: 'Estimado de',
    cwTotalDefault: 'Estimado 120–130 SCU total',
    // Prereq step content (labels)
    preqCPACredit: 'Requisito de Créditos CPA',
    preqCPACreditVal: '150 horas de crédito semestral (mayoría de estados)',
    preqGPA: 'Conversión de GPA',
    preqGPAVal: 'GPA extranjero convertido con la calculadora WES; típicamente se requiere equivalente EE.UU. de 2.5+',
    preqAcctHrs: 'Mínimo de Horas de Contabilidad',
    preqAcctHrsVal: '24–30 SCU en materias de contabilidad',
    preqBizHrs: 'Mínimo de Horas de Negocios',
    preqBizHrsVal: '24 SCU en negocios generales',
    preqNASBA: 'Enlace de Junta Estatal',
    preqNASBAVal: 'NASBA – Asociación Nacional de Juntas Estatales de Contabilidad',
    preqFE: 'Elegibilidad para Examen FE',
    preqFEVal: 'Se requiere evaluación de credenciales antes de presentar el examen FE de NCEES',
    preqGPAMin: 'GPA Mínimo',
    preqGPAMinVal: 'Equivalente 2.0 en escala de 4.0 en EE.UU. (varía por junta estatal)',
    preqABET: 'Revisión ABET',
    preqABETVal: 'Programas no-ABET evaluados curso por curso; las deficiencias pueden requerir cursos adicionales',
    preqNCEES: 'Junta de Licencia PE',
    preqNCEESVal: 'NCEES – Consejo Nacional de Examinadores de Ingeniería',
    preqCGFNS: 'Certificación CGFNS',
    preqCGFNSVal: 'Requerida para enfermeras internacionales antes del NCLEX',
    preqEnglish: 'Dominio del Inglés',
    preqEnglishVal: 'Típicamente se requiere TOEFL iBT 83+ o IELTS 6.5+',
    preqClinical: 'Verificación de Horas Clínicas',
    preqClinicalVal: 'La junta estatal revisa los registros clínicos del programa del país de origen',
    preqNCLEX: 'Junta NCLEX',
    preqNCLEXVal: 'NCSBN – Consejo Nacional de Juntas Estatales de Enfermería',
    preqGPAGen: 'Conversión de GPA',
    preqGPAGenVal: 'Convierte con la calculadora iGPA de WES; se recomienda 3.0+ en EE.UU. para programas de posgrado',
    preqEnglishGen: 'Dominio del Inglés',
    preqEnglishGenVal: 'Es posible que se requiera TOEFL o IELTS para admisión o licencias',
    preqCredEval: 'Evaluación de Credenciales',
    preqCredEvalVal: 'La mayoría de empleadores y escuelas requieren carta de evaluación de agencia miembro de NACES',
    preqUSCIS: 'Reconocimiento USCIS',
    preqUSCISVal: 'La petición Formulario I-140 o EB-2/EB-3 puede requerir carta de evaluación de credenciales',
    preqGradAdm: 'Admisión de Posgrado',
    preqGradAdmVal: 'La mayoría de programas de posgrado en EE.UU. requieren evaluación NACES oficial + traducciones certificadas',
    // Dossier step
    dossierDesc: 'Tu expediente se compila a partir de la información que proporcionaste y los datos obtenidos en todos los pasos anteriores. Incluye tu resumen de credenciales, verificación institucional, recomendaciones de agencias NACES, requisitos regulatorios de EE.UU. y tus etiquetas de equivalencia — formateados y listos para acompañar tu solicitud de evaluación oficial.',
    dossierItem1: 'Resumen de Credenciales',
    dossierItem2: 'Verificación Institucional',
    dossierItem3: 'Lista de Agencias NACES',
    dossierItem4: 'Ruta Regulatoria',
    dossierItem5: 'Etiquetas de Equivalencia EE.UU.',
    dossierItem6: 'Aviso de Cumplimiento',
    dossierDownload: 'Descargar Expediente de Solicitud NACES',
    dossierDownloaded: '✓ Expediente Descargado',
    dossierOpenNote: 'Abre el archivo descargado en tu navegador para imprimir o guardar como PDF.',
    // Agency outreach
    agencyTitle: 'Contactar Agencias NACES',
    agencyDescPre: 'Se ha redactado un correo de consulta personalizado usando los detalles de tu evaluación',
    agencyDescEmail: 'y el correo de tu cuenta',
    agencyDescSuf: '. Ábrelo en tu aplicación de correo, o cópialo y pégalo en el formulario de contacto del sitio de la agencia — se envía desde tu propia dirección, así que las respuestas llegarán directamente a ti.',
    agencyDraft: '✉️ Borrador',
    agencyCopy: 'Copiar',
    agencyCopied: '✓ Copiado',
    agencySite: 'Sitio ↗',
    agencyMemberSince: 'Miembro desde',
    agencyMark: 'Marcar contactada',
    agencyContacted: '✓ Contactada',
    agencyTip: 'Consejo: no necesitas contactar a todas las agencias — elige 2–3 cuyas tarifas y tiempos de entrega se adapten a tu objetivo. El correo o formulario de contacto de cada agencia está en su sitio web.',
    // U.S. degree level labels
    usLevelMaster: 'Maestría',
    usLevelDoctor: 'Doctorado',
    usLevelAssociate: 'Título de Asociado / Diploma postsecundario',
    usLevelBachelor: 'Licenciatura',
    usLevelSecondary: 'Diploma de secundaria / preparatoria',
    usLevelUnknown: 'Indeterminado — se requieren más detalles de la credencial',
    // Insight text
    insightAccount: "• Vía de Licencia CPA: La mayoría de las juntas estatales de EE.UU. requieren 150 horas de crédito semestral. Los cursos de contabilidad extranjeros se mapean uno a uno para cumplir con los mínimos específicos de materias de contabilidad y negocios.\n• Competitividad Profesional: Las designaciones adicionales como CFA, CIA o FMVA pueden fortalecer tu perfil en finanzas corporativas y banca de inversión.",
    insightEngineering: "• Equivalencia Técnica: El mapeo de cursos equivalentes a ABET es estándar para títulos de ingeniería. La licencia de Ingeniero Profesional (PE) requiere aprobar el examen FE.\n• Alineación con la Industria: Alta reconocibilidad para títulos internacionales en tecnología; portafolios, actividad en GitHub y certificaciones en nube/seguridad tienen gran peso.",
    insightHealth: "• Requisitos Regulatorios de Salud: Los campos de salud requieren revisión de credenciales por la junta estatal de licencias, prueba de idioma inglés y exámenes de junta (como el NCLEX).",
    insightGeneral: "• Reconocimiento Profesional General: Tu credencial se alinea bien con los marcos estándar de empleo y admisión en EE.UU. Revisa las listas de requisitos previos específicas de cada institución.",
    // Admin
    adminTitle: 'Panel de Administración',
    adminAccountSingular: 'cuenta registrada',
    adminAccountPlural: 'cuentas registradas',
    adminRefresh: '↻ Actualizar',
    adminRefreshList: '↻ Actualizar lista',
    adminSearchPlaceholder: 'Buscar por usuario o correo…',
    adminNoUsers: 'Aún no hay usuarios registrados.',
    adminNoResults: 'Ningún resultado coincide con tu búsqueda.',
    adminConnecting: 'Conectando con la base de datos central…',
    adminConnectionFailed: 'No se pudo conectar con la base de datos central. Tus cuentas guardadas no se eliminaron. Actualiza para volver a conectar.',
    adminCountUnavailable: 'Recuento de cuentas temporalmente no disponible',
    adminFieldEmail: 'Correo',
    adminFieldPassword: 'Contraseña',
    adminFieldJoined: 'Registro',
    adminEmailMissing: '⚠ Pendiente',
    adminPassSet: '✓ Configurada ·',
    adminFieldsNeededSingular: 'campo pendiente:',
    adminFieldsNeededPlural: 'campos pendientes:',
    adminResetTitle: 'Restablecer Contraseña',
    adminResetFor: 'Estableciendo nueva contraseña para',
    adminResetLNew: 'Nueva Contraseña',
    adminResetPNew: 'Mín. 6 caracteres',
    adminResetLConfirm: 'Confirmar Nueva Contraseña',
    adminResetPConfirm: 'Repetir contraseña',
    adminResetBtn: 'Actualizar Contraseña',
    adminCancelBtn: 'Cancelar',
    adminResetErrEmpty: 'La contraseña no puede estar vacía.',
    adminResetErrMatch: 'Las contraseñas no coinciden.',
    adminResetSuccess: '✓ Contraseña actualizada con éxito.',
    adminDeleteTitle: '¿Eliminar Cuenta?',
    adminDeleteMsg1: 'Esto eliminará permanentemente',
    adminDeleteMsg2: 'y todos sus datos. Esta acción no se puede deshacer.',
    adminDeleteBtn: 'Sí, Eliminar',
    // Server-mode / admin-key strings (ours from main)
    adminModeServer: '● Base de datos central — todos los dispositivos',
    adminModeLocal: '⚠ Solo este dispositivo — servidor sin conexión',
    adminKeyTitle: '🔑 Clave de administrador requerida',
    adminKeyDesc: 'La base de datos central está protegida. Ingresa la clave de administrador para ver y gestionar las cuentas en este dispositivo.',
    adminKeyPlaceholder: 'Clave de administrador…',
    adminKeyBtn: 'Desbloquear',
    adminKeyRejected: 'La clave guardada fue rechazada — ingrésala de nuevo.',
    adminKeyNotConfigured: 'El servidor aún no tiene una clave de administrador cargada — debe republicarse en Replit después de guardar la clave. Hasta entonces, ninguna clave será aceptada.',
    adminGateTitle: '🔐 Acceso de administrador',
    adminGateDesc: 'Esta área es solo para administradores. Ingresa la contraseña de administrador para continuar.',
    adminGatePlaceholder: 'Contraseña de administrador…',
    adminGateBtn: 'Entrar',
    adminGateWrong: 'Contraseña incorrecta.',
    adminGateOffline: 'No se puede contactar el servidor para verificar la contraseña. El acceso de administrador permanece bloqueado — inténtalo de nuevo cuando tengas conexión.',
    adminFieldSchool: 'Institución',
    adminFieldCountry: 'País',
    adminFieldIntention: 'Intención',
    adminFieldNotProvided: 'No proporcionado',
    adminResetErrServer: 'No se pudo conectar al servidor. Inténtalo de nuevo.',
    // Privacy & Terms modal bodies
    privP1: '<strong>Aviso de Privacidad Estricta e Independencia:</strong> VerifED Global es una empresa comercial privada, separada e independiente, diseñada estrictamente para ayudar a personas internacionales a navegar su experiencia educativa y profesional en los Estados Unidos.',
    privP2: '<strong>Información Básica y Propósito:</strong> Recopilamos credenciales básicas de cuenta (nombre de usuario, contraseña y correo de correspondencia) únicamente para mantener registros y correspondernos adecuadamente contigo sobre tu hoja de ruta de evaluación de credenciales.',
    privP3: '<strong>Sin Venta de Datos y Protección Absoluta ante el Gobierno:</strong> <strong>Nunca venderemos tu información, ni entregaremos, compartiremos ni divulgaremos ningún dato de usuario, registro personal o entrada de búsqueda a ninguna agencia gubernamental, autoridad de inmigración o terceros externos.</strong> Tus datos permanecen estrictamente confidenciales, privados y seguros dentro de nuestra plataforma.',
    termsP1: 'Bienvenido a VerifED Global. Al crear una cuenta e iniciar sesión, aceptas estos términos de servicio.',
    termsP2: '<strong>Acuerdo de Marketing y Comunicación:</strong> Al registrarte con tu nombre de usuario, contraseña y correo electrónico, <strong>aceptas expresamente recibir correos de marketing, actualizaciones de la plataforma y comunicaciones de servicio de nuestra parte.</strong> Puedes optar por no recibir comunicaciones en cualquier momento contactando al soporte.',
    termsP3: '<strong>Vista Previa No Oficial:</strong> Todos los mapeos de credenciales generados por esta aplicación son solo para orientación preliminar e informativa y no constituyen evaluaciones oficiales acreditadas por NACES.',
    termsP4: 'Todos los activos de propiedad intelectual y código son desarrollados por LAD MEDIA.',
    // Dossier HTML (export)
    dossierSubtitle: 'Motor de Credenciales 2026 — Expediente de Solicitud NACES',
    dossierGenerated: 'Generado:',
    dossierSecCredential: 'Resumen de Credenciales',
    dossierSecVerification: 'Verificación Institucional',
    dossierSecNACES: 'Agencias NACES Recomendadas',
    dossierSecRegulatory: 'Notas de Ruta Regulatoria en EE.UU.',
    dossierSecInsight: 'Análisis Regulatorio',
    dossierSecTags: 'Etiquetas de Credencial',
    dossierRowInstitution: 'Institución del Solicitante',
    dossierRowCountry: 'País de Estudios',
    dossierRowDegree: 'Nivel del Título',
    dossierRowField: 'Campo de Estudio',
    dossierRowUSEq: 'Nivel Educativo Autodeclarado',
    dossierRowGoal: 'Objetivo Principal',
    dossierDisclaimer: '<strong>Aviso Legal:</strong> Este expediente es generado por VerifED Global únicamente para orientación preliminar. No constituye una evaluación de credenciales oficial acreditada por NACES. Para reconocimiento oficial, envía tus documentos a una agencia miembro de NACES listada arriba. VerifED Global es una plataforma privada e independiente, no afiliada a ningún organismo gubernamental.',
    dossierFooter: '© 2026 VerifED Global. Desarrollado por LAD MEDIA. Todos los derechos reservados.',
    // Coursework course names (ES)
    cwAcct1: 'Contabilidad Financiera I y II',
    cwAcct2: 'Contabilidad de Costos y Gerencial',
    cwAcct3: 'Auditoría y Aseguramiento',
    cwAcct4: 'Impuestos (Nacional/Internacional)',
    cwAcct5: 'Derecho Mercantil',
    cwAcct6: 'Economía (Micro + Macro)',
    cwEng1: 'Cálculo I–III',
    cwEng2: 'Física I y II',
    cwEng3: 'Cursos Centrales de Ingeniería / Computación',
    cwEng4: 'Proyecto Final / Tesis',
    cwHealth1: 'Anatomía y Fisiología',
    cwHealth2: 'Farmacología',
    cwHealth3: 'Teoría y Práctica de Enfermería',
    cwHealth4: 'Horas Clínicas',
    cwGen1: 'Cursos Principales de la Carrera',
    cwGen2: 'Educación General',
    cwGen3: 'Electivas',
    cwGen4: 'Tesis / Proyecto Final',
    // Coursework notes (ES)
    cwNoteAASCB: 'Cumple con referente AACSB',
    cwNoteCPAPath: 'Requerido para vía CPA',
    cwNoteStateMin: 'Mínimo de junta estatal',
    cwNoteTaxElec: 'Equivale a electiva de derecho fiscal en EE.UU.',
    cwNote150: 'Requerido para regla CPA de 150 horas',
    cwNoteCoreBiz: 'Requisito central de negocios',
    cwNoteABETMath: 'Base matemática ABET',
    cwNoteLabCred: 'Incluye créditos de laboratorio',
    cwNoteMajorMap: 'Mapeo específico de carrera',
    cwNoteSenDes: 'Cuenta para diseño de proyecto senior',
    cwNoteWithLab: 'Con laboratorio',
    cwNoteClinReq: 'Requisito clínico',
    cwNoteNCLEXPre: 'Prerrequisito NCLEX',
    cwNoteStateBdMin: 'Mínimo de junta estatal varía',
    cwNoteCourseRev: 'Sujeto a revisión curso por curso',
    cwNoteGenEd: 'Inglés, Matemáticas, Ciencias, Humanidades',
    cwNoteInstElec: 'Electivas institucionales',
    cwNoteIfApp: 'Si aplica',
    sfTitle: 'Búsqueda de Universidades (Datos Públicos)',
    sfDesc: 'Busca universidades públicas en EE.UU. utilizando datos actuales del College Scorecard del Departamento de Educación.',
    sfErrSetup: 'La integración con el Departamento de Educación aún no está completamente configurada. Por favor, contacte al administrador.',
    sfErrSource: 'La fuente del Departamento de Educación no está disponible temporalmente. Por favor, intente más tarde.',
    sfContactUnavailable: 'No se pudo verificar la información de contacto.',
    sfOutreachDisclaimer: 'VerifED transmite información autodeclarada y no es una determinación oficial de equivalencia o admisión.',
    sfOutreachNote: '"Enviado" indica que la consulta fue aceptada por el proveedor de correo, no necesariamente entregada o leída por el personal de admisiones.',
    sfErrNoValidEmails: 'No se encontraron destinatarios de correo verificados para las escuelas seleccionadas.',
    sfConfirmCip: 'Confirmar Categoría del Programa',
    sfConfirmCipDesc: 'Selecciona la categoría exacta del programa para coincidir con los códigos oficiales (CIP).',
    sfCip1107: 'Ciencias de la Computación (1107)',
    sfCip5202: 'Administración de Empresas (5202)',
    sfCip5203: 'Contabilidad (5203)',
    sfCip5138: 'Enfermería (5138)',
    sfCip1312: 'Educación Docente (1312)',
    sfCip1401: 'Ingeniería (1401)',
    sfCip2201: 'Derecho (2201)',
    sfCip4201: 'Psicología (4201)',
    sfCip2601: 'Biología (2601)',
    sfCip5007: 'Artes Visuales (5007)',
    sfFilterNationwide: 'A nivel nacional',
    sfFilterState: 'Filtrar por estado',
    sfFilterOnline: '¿En línea o presencial?',
    sfFilterOnlineAny: 'Cualquiera',
    sfFilterOnlineOnly: 'Solo en línea',
    sfFilterCampusOnly: 'Solo presencial',
    sfFilterDegree: 'Credencial Buscada',
    sfFilterDegAny: 'Cualquier credencial',
    sfFilterDegCert: 'Certificado',
    sfFilterDegAssoc: 'Asociado',
    sfFilterDegBach: 'Licenciatura (Bachelor)',
    sfFilterDegGrad: 'Posgrado (Graduate)',
    sfBtnSearch: 'Buscar Universidades',
    sfSearching: 'Buscando en el College Scorecard...',
    sfNoResults: 'Ninguna institución pública coincidió con este programa en el área seleccionada.',
    sfSourceNote: 'Datos obtenidos de registros oficiales del Departamento de Educación de EE.UU.',
    sfSourceLabel: 'Fuente:',
    sfRetrievedLabel: 'consultado el',
    sfSize: 'Estudiantes:',
    sfCalc: 'Calculadora de Precios',
    sfSave: 'Guardar',
    sfSaved: 'Guardado',
    sfOutreachTitle: 'Contacto de Admisiones',
    sfOutreachDesc: 'Selecciona hasta 10 universidades guardadas para enviar una consulta preliminar.',
    sfOutreachConsent: 'Entiendo que esto es solo una consulta informativa, y no una solicitud oficial de equivalencia o admisión.',
    sfBtnContact: 'Enviar Consulta',
    sfSending: 'Enviando...',
    sfOutreachSent: 'Enviado',
    sfOutreachFailed: 'Fallido',
    sfOutreachUnattempted: 'No intentado',
    sfPlaceholderCip: 'Selecciona una categoría de programa...',
    sfFilterStateOpt: 'Opcional: Filtrar por estado de EE. UU.',
    sfPublic: 'Pública',
    sfOnline: 'En línea',
    sfMatchedProgram: 'Programa:',
    sfNA: 'N/D',
    sfSite: 'Sitio web',
    sfSavedSchools: 'Universidades Guardadas',
    sfPreviewOutreach: 'Vista Previa del Contacto',
    sfPreviewData: 'Vista previa de los datos auto-reportados a enviar:',
    sfPackageCountry: 'País:',
    sfPackageInst: 'Institución:',
    sfPackageDegree: 'Título:',
    sfPackageField: 'Campo:',
    sfPackagePurpose: 'Propósito:',
    sfUnknownSchool: 'Institución desconocida',
    sfVerifiedRecipients: 'Destinatarios Verificados:',
    sfFormFallback: 'Formulario Alternativo:',
    sfRecentInquiries: 'Consultas Recientes',
    sfErrSearch: 'Error al buscar universidades. Por favor, inténtalo de nuevo.',
    sfErrSync: 'Error al sincronizar las universidades guardadas. Por favor, inténtalo de nuevo.',
    sfErrContacts: 'Error al cargar la información de contacto.',
        sfErrSend: 'Error al enviar la consulta.',
  },
} as const;

type TKey = keyof typeof TX.en;
const LangCtx = createContext<{ lang: Lang; toggleLang: () => void; t: (k: TKey) => string }>({
  lang: 'en', toggleLang: () => {}, t: (k) => TX.en[k],
});

function useLang() { return useContext(LangCtx); }
type AppView = 'auth' | 'app';
function LangToggle() {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer select-none"
      data-testid="button-lang-toggle"
      aria-label={lang === 'en' ? 'Switch to Spanish' : 'Cambiar a inglés'}
    >
      <span>{lang === 'en' ? '🇺🇸' : '🇲🇽'}</span>
      <span>{lang === 'en' ? 'EN' : 'ES'}</span>
      <span className="text-slate-600 font-normal">/</span>
      <span className="text-slate-500 font-normal">{lang === 'en' ? 'ES' : 'EN'}</span>
    </button>
  );
}

function Navbar({ appView, username, onLogout }: { appView: AppView; username: string; onLogout: () => void }) {
  const { t, lang } = useLang();
  const g = GUIDE_UI[lang];
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const mLink = 'block rounded-lg px-4 py-3 text-base text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-400';
  return (
    <nav className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400"
          data-testid="link-home"
          aria-label="VerifED Global home"
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`.replace(/\/+/g, '/')}
            alt="VerifED Global"
            className="h-10 w-auto object-contain"
          />
        </Link>

        <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-400">
          <Link href="/about" className="hover:text-white transition-colors" data-testid="link-about">{t('about')}</Link>
          <Link href="/how-it-works" className="hover:text-white transition-colors" data-testid="link-how-it-works">{t('howItWorks')}</Link>
          <Link href="/guides" className="hover:text-white transition-colors" data-testid="link-guides" aria-current={location.startsWith('/guides') ? 'page' : undefined}>{g.nav}</Link>
          <LangToggle />
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile lang toggle */}
          <div className="md:hidden"><LangToggle /></div>
          <button
            ref={menuBtn}
            type="button"
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-400"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            data-testid="button-mobile-menu"
          >
            {menuOpen ? g.closeMenu : g.menu}
          </button>

          {appView === 'app' && (
            <div className="flex items-center space-x-3" data-testid="nav-user-badge">
              <span className="hidden sm:inline text-xs text-indigo-300 font-mono bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/30" data-testid="text-nav-username">
                👤 @{username}
              </span>
              <button
                onClick={onLogout}
                data-testid="button-signout"
                className="text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full cursor-pointer"
              >
                {t('signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
      {menuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3">
          <ul className="space-y-1">
            <li><Link href="/guides" className={mLink} data-testid="link-guides-mobile">{g.nav}</Link></li>
            <li><Link href="/about" className={mLink}>{t('about')}</Link></li>
            <li><Link href="/how-it-works" className={mLink}>{t('howItWorks')}</Link></li>
          </ul>
        </div>
      )}
    </nav>
  );
}

function Footer({ onPrivacy, onTerms }: { onPrivacy: () => void; onTerms: () => void }) {
  const { t, lang } = useLang();
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-6 relative z-10 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <p className="text-xs text-slate-400 font-medium">{t('footerCopy')}</p>
          <p className="text-[11px] text-slate-500 mt-1">{t('footerTag')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400 font-medium">
          <Link href="/guides" className="hover:text-white transition-colors text-slate-300 text-xs font-medium" data-testid="link-footer-guides">{GUIDE_UI[lang].nav}</Link>
          <button onClick={onPrivacy} data-testid="button-privacy-policy" className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium">{t('privacy')}</button>
          <button onClick={onTerms} data-testid="button-terms" className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-slate-400 text-xs font-medium">{t('terms')}</button>
          <Link href="/admin" className="hover:text-white transition-colors text-slate-600 text-xs font-medium" data-testid="link-admin">{t('admin')}</Link>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-inner">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{t('poweredBy')}</span>
          <a href="https://ladmedia.co" target="_blank" rel="noopener noreferrer" data-testid="link-lad-media" className="text-xs font-bold bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent hover:underline">LAD MEDIA</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose} data-testid={`modal-${id}`}>
      <div className="glass-panel p-8 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">{title}</h2>
          <button onClick={onClose} data-testid={`button-close-modal-${id}`} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none cursor-pointer bg-transparent border-none">×</button>
        </div>
        <div className="text-slate-300 text-sm leading-relaxed space-y-4">{children}</div>
      </div>
    </div>
  );
}

const VALUE_CARDS = [
  { tKey: 'val1', icon: '🎯', color: 'from-indigo-600 to-blue-600', border: 'border-indigo-500/20' },
  { tKey: 'val2', icon: '🔎', color: 'from-violet-600 to-indigo-600', border: 'border-violet-500/20' },
  { tKey: 'val3', icon: '🧭', color: 'from-fuchsia-600 to-violet-600', border: 'border-fuchsia-500/20' },
] as const;
function AboutPage() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <main id="main-content" tabIndex={-1} className="outline-none relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full space-y-16">
      {/* Hero */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 font-semibold mb-8">
          {t('aboutBadge')}
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 leading-[1.1]">
          {t('aboutH1')}<br />
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            {t('aboutH2')}
          </span>
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed max-w-2xl mx-auto mt-6">{t('aboutIntro')}</p>
      </div>

      {/* Story */}
      <div className="space-y-10">
        {(['01', '02', '03'] as const).map((n) => (
          <div key={n} className="glass-panel p-8 rounded-3xl">
            <h2 className="text-white font-bold text-xl mb-4">{t(`about${n}T` as TKey)}</h2>
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
              <p>{t(`about${n}P1` as TKey)}</p>
              <p>{t(`about${n}P2` as TKey)}</p>
              {n === '03' && <p>{t('about03P3')}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Values */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {VALUE_CARDS.map((card) => (
          <div key={card.tKey} className={`glass-panel p-6 rounded-3xl border ${card.border}`}>
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center text-lg mb-4 shadow-lg`}>{card.icon}</div>
            <h3 className="text-white font-bold text-sm mb-2">{t(`${card.tKey}T` as TKey)}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{t(`${card.tKey}D` as TKey)}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="glass-panel p-8 rounded-3xl text-center">
        <p className="text-slate-300 text-sm leading-relaxed mb-6 max-w-xl mx-auto">{t('aboutCtaText')}</p>
        <button
          onClick={() => setLocation('/')}
          data-testid="button-go-to-evaluator-about"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer"
        >
          {t('goEval')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </main>
  );
}

// ─── How It Works Page ────────────────────────────────────────────────────────

const HOW_STEPS = [
  { num: '01', tKey: 'step01', icon: '🔐', color: 'from-indigo-500 to-blue-500', border: 'border-indigo-500/40' },
  { num: '02', tKey: 'step02', icon: '📋', color: 'from-violet-500 to-indigo-500', border: 'border-violet-500/40' },
  { num: '03', tKey: 'step03', icon: '🛰️', color: 'from-fuchsia-500 to-violet-500', border: 'border-fuchsia-500/40' },
  { num: '04', tKey: 'step04', icon: '🗺️', color: 'from-cyan-500 to-blue-500', border: 'border-cyan-500/40' },
  { num: '05', tKey: 'step05', icon: '🤝', color: 'from-emerald-500 to-cyan-500', border: 'border-emerald-500/40' },
  { num: '06', tKey: 'step06', icon: '💼', color: 'from-amber-500 to-orange-500', border: 'border-amber-500/40' },
] as const;

const NEED_ITEMS = [
  { lKey: 'need01L', nKey: 'need01N' },
  { lKey: 'need02L', nKey: 'need02N' },
  { lKey: 'need03L', nKey: 'need03N' },
  { lKey: 'need04L', nKey: 'need04N' },
  { lKey: 'need05L', nKey: 'need05N' },
  { lKey: 'need06L', nKey: 'need06N' },
] as const;

function HowItWorksPage() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <main id="main-content" tabIndex={-1} className="outline-none relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs mb-8">
          <span className="text-indigo-400 font-semibold">{t('howBadge')}</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            {t('howTitle')}
          </span>
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed max-w-2xl">{t('howSub')}</p>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {HOW_STEPS.map((step) => (
          <div key={step.num} className={`glass-panel p-8 rounded-3xl border-l-4 ${step.border}`} data-testid={`step-${step.num}`}>
            <div className="flex items-start gap-5">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-xl flex-shrink-0 shadow-lg`}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('stepLabel')} {step.num}</span>
                <h3 className="text-white font-bold text-lg mt-1 mb-2">{t(`${step.tKey}T` as TKey)}</h3>
                <p className="text-slate-300 text-sm leading-relaxed mb-3">{t(`${step.tKey}D` as TKey)}</p>
                <p className="text-slate-500 text-xs leading-relaxed italic border-l-2 border-slate-700 pl-3">{t(`${step.tKey}Det` as TKey)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* What you need */}
      <div className="glass-panel p-8 rounded-3xl mt-10">
        <h2 className="text-white font-bold text-lg mb-6">{t('whatNeedTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {NEED_ITEMS.map((item) => (
            <div key={item.lKey} className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/60">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0 text-sm">✓</span>
              <div>
                <p className="text-white text-xs font-semibold mb-0.5">{t(item.lKey)}</p>
                <p className="text-slate-500 text-xs">{t(item.nKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="glass-panel p-8 rounded-3xl mt-6 text-center">
        <p className="text-slate-300 text-sm leading-relaxed mb-6 max-w-xl mx-auto">{t('howCtaText')}</p>
        <button
          onClick={() => setLocation('/')}
          data-testid="button-go-to-evaluator-how"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer"
        >
          {t('goEval')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </main>
  );
}

// ─── Auth View ────────────────────────────────────────────────────────────────

/** Basic email format check: something@something.tld with no whitespace. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthView({ onLogin, storageError }: { onLogin: (username: string) => void; storageError?: string }) {
  const { t, lang } = useLang();
  const [isSignUp, setIsSignUp] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  /** New accounts start with only their own signup answers. A global legacy
   *  profile is never evidence that its data belongs to this new account. */
  function saveSignupProfile(): void {
    const trimmed = { country: country.trim(), purpose };
    const merged: EvalProfile = {
      ...(trimmed.country ? { country: trimmed.country } : {}),
      ...(trimmed.purpose ? { purpose } : {}),
    };
    if (!Object.keys(merged).length && !localStorage.getItem('ge_profile')) return;
    storeEducationProfile(username, merged);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username || !password) return;
    const trimmedEmail = email.trim();
    if (isSignUp && !EMAIL_RE.test(trimmedEmail)) {
      setError(t('errEmail'));
      return;
    }
    if (isSignUp && country.trim() && !isValidCountry(country)) {
      setError(t('errCountry'));
      return;
    }

    try {
      // Prefer the central backend so accounts are visible on the admin board
      // from any device; fall back to this browser's storage when offline.
      try {
        if (isSignUp) {
          const signupProfile: EvalProfile | undefined =
            country.trim() || purpose ? { ...(country.trim() ? { country: country.trim() } : {}), ...(purpose ? { purpose } : {}) } : undefined;
          const r = await apiSignup(username.trim(), trimmedEmail, password, signupProfile);
          if (!r.ok) {
            if (r.error === 'username_taken') { setIsSignUp(false); setError(t('errTaken')); }
            else if (r.error === 'valid_email_required') { setError(t('errEmail')); }
            else setError(t('errUnexpected'));
            return;
          }
          saveSignupProfile();
        } else {
          const r = await apiSignin(username.trim(), password);
          if (!r.ok) { setError(t('errCredentials')); return; }
          // Remember this user's saved answers on this device so the
          // evaluator comes prefilled — fill only fields not already set here.
          restoreEducationProfile(username, r.profile);
        }
        if (trimmedEmail) localStorage.setItem('ge_email', trimmedEmail);
        localStorage.setItem(STORAGE_KEY, username);
        onLogin(username);
        return;
      } catch (err) {
        if (!(err instanceof ApiUnavailableError)) throw err;
        // Backend unreachable — continue with device-local accounts below.
      }

      let users: StoredUser[];
      try {
        users = getUsers();
      } catch (err) {
        setError(err instanceof UserStoreCorruptError ? t('errCorrupt') : t('errLoad'));
        return;
      }

      if (isSignUp) {
        if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
          setIsSignUp(false);
          setError(t('errTaken'));
          return;
        }
        const { hash, salt } = await hashPassword(password);
        const newUser: StoredUser = {
          username,
          email: trimmedEmail,
          password: hash,
          salt,
          createdAt: new Date().toISOString(),
        };
        saveUsers([...users, newUser]);
        saveSignupProfile();
      } else {
        const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
        if (!user) {
          if (users.length === 0) {
            const { hash, salt } = await hashPassword(password);
            saveUsers([{ username, email: '', password: hash, salt, createdAt: new Date().toISOString() }]);
          } else {
            setError(t('errCredentials'));
            return;
          }
        } else {
          const { valid, newHash, newSalt } = await verifyAndMigratePassword(user.password, password, user.salt);
          if (!valid) { setError(t('errCredentials')); return; }
          if (newHash && newSalt) {
            saveUsers(users.map((u) => u.username === user.username ? { ...u, password: newHash, salt: newSalt } : u));
          }
        }
      }

      if (!isSignUp) restoreEducationProfile(username);
      localStorage.setItem(STORAGE_KEY, username);
      onLogin(username);
    } catch (err) {
      setError(err instanceof Error ? `${t('errUnexpected')} (${err.message})` : t('errUnexpected'));
    }
  }

  const iCls = 'w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

  return (
    <div className="space-y-24">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="text-center max-w-4xl mx-auto pt-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
          🛰️ {t('heroBadge')}
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.05]">
          {t('heroLine1')}<br />
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            {t('heroLine2')}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-400 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-14">
          {t('heroSub')}
        </p>

        <Link href="/guides" data-testid="link-home-guides" className="mx-auto mb-10 flex max-w-xl flex-col gap-1 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-5 py-4 text-left hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400">
          <span className="font-bold text-white">{GUIDE_UI[lang].homeEntry} <span aria-hidden="true">→</span></span>
          <span className="text-sm text-slate-300">{GUIDE_UI[lang].homeEntryBody}</span>
        </Link>

        {/* Stats strip */}
        <div className="inline-flex flex-col sm:flex-row items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-sm">
          {([
            [t('stat1'), t('stat1L')],
            [t('stat2'), t('stat2L')],
            [t('stat3'), t('stat3L')],
          ] as [string, string][]).map(([val, label]) => (
            <div key={label} className="px-8 py-4 text-center">
              <div className="text-2xl font-black bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent">{val}</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {([
          ['🗺️', t('f1t'), t('f1d'), 'border-indigo-500/20 hover:border-indigo-500/40'],
          ['🏛️', t('f2t'), t('f2d'), 'border-violet-500/20 hover:border-violet-500/40'],
          ['📋', t('f3t'), t('f3d'), 'border-cyan-500/20 hover:border-cyan-500/40'],
          ['💼', t('f4t'), t('f4d'), 'border-emerald-500/20 hover:border-emerald-500/40'],
        ] as [string, string, string, string][]).map(([icon, title, desc, border]) => (
          <div key={title} className={`group bg-slate-900/60 border ${border} rounded-2xl p-6 backdrop-blur-sm transition-all duration-200 hover:bg-slate-800/60`}>
            <span className="text-2xl mb-3 block">{icon}</span>
            <h3 className="text-white font-bold text-sm mb-1.5">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* ── Service notice (shown when user store is unreadable) ─────── */}
      {storageError && (
        <div className="max-w-md mx-auto">
          <div
            role="status"
            data-testid="banner-service-unavailable"
            className="rounded-2xl border border-amber-500/30 bg-amber-950/40 backdrop-blur-sm px-5 py-4 text-center"
          >
            <p className="text-amber-300 font-semibold text-sm mb-1">{t('svcUnavailableTitle')}</p>
            <p className="text-amber-400/80 text-xs leading-relaxed">
              {t('svcUnavailableSub')}
            </p>
          </div>
        </div>
      )}

      {/* ── Auth Form ────────────────────────────────────────────────────── */}
      <div className="max-w-md mx-auto">
        {/* Section label */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">
            {isSignUp ? t('createAcc') : t('signInAcc')}
          </span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-base tracking-tight" data-testid="text-auth-heading">
              {isSignUp ? t('createAcc') : t('signInAcc')}
            </h2>
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} data-testid="button-toggle-auth" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline bg-transparent border-none cursor-pointer whitespace-nowrap ml-3">
              {isSignUp ? t('alreadyReg') : t('needAcc')}
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-5 leading-relaxed">{t('formNote')}</p>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-auth">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lUser')}</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-username" className={iCls} placeholder={t('pUser')} required />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lPass')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" className={iCls} placeholder="••••••••••••" required />
            </div>
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('lEmail')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" className={iCls} placeholder={t('pEmail')} required />
              </div>
            )}
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    {t('evalLCountry')} <span className="text-slate-600 normal-case">{t('evalLCreditsOpt')}</span>
                  </label>
                  <CountryPicker value={country} onChange={setCountry} data-testid="input-signup-country" className={iCls} placeholder={t('evalPCountry')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    {t('evalLGoal')} <span className="text-slate-600 normal-case">{t('evalLCreditsOpt')}</span>
                  </label>
                  <select value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="select-signup-goal" className={iCls}>
                    <option value="">{t('evalOptGoal')}</option>
                    <option value="University Admission">{t('evalGoal1')}</option>
                    <option value="Employment & HR">{t('evalGoal2')}</option>
                    <option value="Professional Licensing">{t('evalGoal3')}</option>
                    <option value="Immigration (USCIS)">{t('evalGoal4')}</option>
                  </select>
                </div>
              </>
            )}
            {error && (
              <p className="text-red-400 text-xs font-medium bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
            )}
            <button type="submit" data-testid="button-auth-submit" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2">
              <span>{isSignUp ? t('btnCreate') : t('btnSignIn')}</span>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}

// ─── Job Boards ───────────────────────────────────────────────────────────────

const JOB_BOARDS = [
  { name: 'Indeed', url: 'https://www.indeed.com', descKey: 'jobIndeed' as const, color: 'from-blue-600 to-blue-500', initials: 'In' },
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs', descKey: 'jobLinkedIn' as const, color: 'from-sky-700 to-sky-500', initials: 'Li' },
  { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job', descKey: 'jobGlassdoor' as const, color: 'from-emerald-600 to-emerald-500', initials: 'Gd' },
  { name: 'ZipRecruiter', url: 'https://www.ziprecruiter.com', descKey: 'jobZip' as const, color: 'from-orange-600 to-orange-500', initials: 'Zr' },
  { name: 'USAJobs', url: 'https://www.usajobs.gov', descKey: 'jobUSA' as const, color: 'from-red-700 to-red-500', initials: 'US' },
  { name: 'Monster', url: 'https://www.monster.com', descKey: 'jobMonster' as const, color: 'from-violet-600 to-violet-500', initials: 'Mo' },
];

// jobSearchUrl / getAlignedRoles are extracted to ./jobRoles for unit testing.

function JobBoardsSection({ field }: { field?: string }) {
  const { t } = useLang();
  const hasField = Boolean(field && field.trim());
  const roles = hasField ? getAlignedRoles(field!.trim()) : [];
  return (
    <div className="mt-16">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-indigo-400 text-2xl">💼</span>
          <h2 className="text-white font-extrabold text-2xl tracking-tight">
            {hasField ? <>{t('jobAlignedWith')} <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{field}</span></> : t('jobTitle')}
          </h2>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
          {hasField
            ? `${t('jobAlignedDesc1')} ${field} ${t('jobAlignedDesc2')}`
            : t('jobDesc')}
        </p>
      </div>

      {hasField && (
        <div className="glass-panel p-6 rounded-2xl mb-6" data-testid="aligned-roles">
          <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="text-indigo-400">🎯</span> {t('jobRolesTitle')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <a
                key={role}
                href={jobSearchUrl('Indeed', role)}
                target="_blank" rel="noopener noreferrer"
                data-testid={`link-role-${role.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/20 hover:text-white transition-all"
              >
                {role} ↗
              </a>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">{t('jobRolesTip')}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {JOB_BOARDS.map((board) => (
          <a key={board.name} href={hasField ? jobSearchUrl(board.name, field!.trim()) : board.url} target="_blank" rel="noopener noreferrer" data-testid={`link-job-board-${board.name.toLowerCase().replace(/\s+/g, '-')}`} className="glass-panel p-5 rounded-2xl flex items-start gap-4 hover:border-indigo-500/40 transition-all group">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${board.color} flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-lg`}>{board.initials}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-bold text-sm group-hover:text-indigo-300 transition-colors">{board.name}</span>
                <svg className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {hasField ? `${field} ${t('jobPrefiltered')}` : t(board.descKey)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────

const CONTACT_ITEMS = ['contactC1', 'contactC2', 'contactC3', 'contactC4'] as const;

function ContactSection() {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setSendError(false);
    const formData = new FormData(e.currentTarget);
    formData.append('access_key', 'cc575078-c613-4a00-82ab-e5067f30c8d8');
    formData.append('subject', 'VerifED Global – Transfer Help Request');

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({ success: false }));
      if (!response.ok || data.success !== true) throw new Error('Contact form submission failed');
      setName('');
      setEmail('');
      setMessage('');
      setSent(true);
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-12">
      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-indigo-400 text-2xl">🤝</span>
              <h2 className="text-white font-extrabold text-2xl tracking-tight">{t('contactTitle')}</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">{t('contactDesc')}</p>
            <ul className="space-y-3">
              {CONTACT_ITEMS.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-xs text-slate-300">
                  <span className="text-indigo-400 mt-0.5 flex-shrink-0">✓</span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            {sent ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl mb-4">✅</div>
                <p className="text-white font-bold text-lg mb-1">{t('contactSent')}</p>
                <p className="text-slate-400 text-sm">{t('contactSentSub')}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('contactLName')}</label>
                  <input type="text" name="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-contact-name" required placeholder={t('contactPName')} className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('contactLEmail')}</label>
                  <input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-contact-email" required placeholder="name@example.com" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('contactLMsg')}</label>
                  <textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="input-contact-message" required rows={4} placeholder={t('contactPMsg')} className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none" />
                </div>
                {sendError && (
                  <p role="alert" className="text-red-400 text-xs font-medium bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                    {t('contactError')}
                  </p>
                )}
                <button type="submit" data-testid="button-contact-submit" disabled={sending} className="w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2">
                  <span>{sending ? t('contactSending') : t('contactBtn')}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Evaluator View ───────────────────────────────────────────────────────────

function EvaluatorView() {
  const { lang, t } = useLang();
  const username = localStorage.getItem(STORAGE_KEY) || '';
  const [loaded] = useState(() => {
    try { return { profile: loadEducationProfile(username), error: false }; }
    catch { return { profile: {} as EvalProfile, error: true }; }
  });
  const [profile, setProfile] = useState<EvalProfile>(loaded.profile);
  const [active, setActive] = useState<Qualification | null>(null);
  const [syncNotice, setSyncNotice] = useState<'local' | 'synced' | null>(null);
  async function save(profile: EvalProfile) {
    storeEducationProfile(username, profile);
    const pendingKey = `${educationProfileKey(username)}_pending`;
    localStorage.setItem(pendingKey, 'true');
    setProfile(profile);
    try {
      await apiSaveEducationProfile(username, profile);
      localStorage.removeItem(pendingKey);
      setSyncNotice('synced');
    } catch { setSyncNotice('local'); }
  }
  if (loaded.error) return <p role="alert" className="rounded-xl border border-amber-500 p-6 text-amber-100">{lang === 'es' ? 'No se pudo leer su perfil educativo guardado. No se ha sobrescrito. Contacte con soporte antes de volver a introducir sus titulaciones.' : 'Your saved education profile could not be read. It has not been overwritten. Contact support before re-entering your qualifications.'}</p>;
  return <div className="space-y-8">
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="text-3xl font-bold text-white">{lang === 'es' ? 'Su educación. Sus próximos pasos en EE. UU.' : 'Your education. Your next steps in the U.S.'}</h1>
      <p className="mt-3 text-slate-400">{lang === 'es' ? 'Titulaciones separadas, orientación con fuentes y límites claros. No es una evaluación oficial.' : 'Separate qualifications, cited guidance and clear limits. Not an official evaluation.'}</p>
    </div>
    <QualificationWorkflow lang={lang} username={username} initialProfile={profile} onProfileChange={save} onActiveQualification={setActive} />
    {syncNotice && <p role="status" className="text-sm text-slate-300">{syncNotice === 'local'
      ? (lang === 'es' ? 'Guardado en este dispositivo. No se pudo sincronizar; vuelva a guardar cuando haya conexión para tener los cambios en otros dispositivos.' : 'Saved on this device. Sync unavailable; save again when connected to make changes available on other devices.')
      : (lang === 'es' ? 'Sincronizado con su cuenta.' : 'Synced to your account.')}</p>}
    {active && profile.purpose === 'University Admission' && <Suspense fallback={<p>{lang === 'es' ? 'Cargando…' : 'Loading…'}</p>}>
      <ComparablePrograms es={lang === 'es'} profile={{ country: active.country, institution: active.institution, degree: active.awardName, field: active.field, purpose: profile.purpose }} />
    </Suspense>}
    <ContactSection />
    <JobBoardsSection field={active?.field} />
  </div>;
}


// ─── Admin Page ───────────────────────────────────────────────────────────────

type AdminUser = StoredUser & EvalProfile;

// Merged: server-mode API functionality (from main) + full i18n via t() (from task-21)
/**
 * Password gate in front of the admin dashboard.
 *
 * Authorization is server-backed: the submitted password is verified by the
 * API against the ADMIN_API_KEY secret, and only a server "ok" unlocks the
 * dashboard. No client-storage flag is trusted as authorization evidence —
 * on reload, a previously stored key is re-validated with the server before
 * anything is shown. Only when the backend is unreachable (device-local mode,
 * where the board can show at most this browser's own localStorage data) does
 * the gate fall back to the locally stored PBKDF2 admin credential.
 */
function AdminGate() {
  const { t } = useLang();
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<'' | 'wrong' | 'notConfigured' | 'offline'>('');
  const [busy, setBusy] = useState(false);

  // Re-validate a previously stored admin key with the server on mount.
  useEffect(() => {
    const stored = getAdminKey();
    if (!stored) return;
    let alive = true;
    apiVerifyAdminKey(stored)
      .then((r) => { if (alive && r === 'ok') setUnlocked(true); })
      .catch(() => { /* backend unreachable — require manual entry */ });
    return () => { alive = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setMsg('');
    try {
      try {
        const r = await apiVerifyAdminKey(pass);
        if (r === 'ok') {
          setAdminKey(pass); // reused by AdminPage for all admin API calls
          setUnlocked(true);
        } else if (r === 'not_configured') {
          setMsg('notConfigured');
        } else {
          setMsg('wrong');
        }
      } catch {
        // Backend unreachable — FAIL CLOSED. Server verification is the only
        // authorization evidence; no local fallback.
        setMsg('offline');
      }
    } finally {
      setBusy(false);
    }
  }

  if (unlocked) return <AdminPage />;

  return (
    <main id="main-content" tabIndex={-1} className="outline-none relative z-10 max-w-md mx-auto px-6 pt-24 pb-32 flex-grow w-full">
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-white font-bold text-sm mb-1">{t('adminGateTitle')}</h2>
        <p className="text-slate-400 text-xs mb-4">{t('adminGateDesc')}</p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="password"
            value={pass}
            onChange={(e) => { setPass(e.target.value); setMsg(''); }}
            placeholder={t('adminGatePlaceholder')}
            autoFocus
            className="flex-grow bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={busy || !pass}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            {t('adminGateBtn')}
          </button>
        </form>
        {msg === 'wrong' && <p className="text-red-400 text-xs mt-3">{t('adminGateWrong')}</p>}
        {msg === 'notConfigured' && <p className="text-amber-400 text-xs mt-3">{t('adminKeyNotConfigured')}</p>}
        {msg === 'offline' && <p className="text-amber-400 text-xs mt-3">{t('adminGateOffline')}</p>}
      </div>
    </main>
  );
}

function AdminPage() {
  const { lang, t } = useLang();
  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [serverMode, setServerMode]   = useState<boolean | null>(null);
  const [storageErr, setStorageErr]   = useState<string>('');
  const [search, setSearch]           = useState('');
  const [resetTarget, setResetTarget] = useState<StoredUser | null>(null);
  const [newPass, setNewPass]         = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [resetMsg, setResetMsg]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StoredUser | null>(null);
  const [needKey, setNeedKey]         = useState(false);
  const [keyNotConfigured, setKeyNotConfigured] = useState(false);
  const [keyInput, setKeyInput]       = useState('');
  const [refreshing, setRefreshing]   = useState(true);
  const [connectionErr, setConnectionErr] = useState(false);

  function serverToStored(u: ServerUser): AdminUser {
    // Display-only mapping; password material never leaves the server.
    return {
      username: u.username, email: u.email,
      password: ''.padEnd(64, '0'), salt: u.hasSalt ? 'server' : undefined,
      createdAt: u.createdAt,
      country: u.country || undefined,
      institution: u.institution || undefined,
      degree: u.degree || undefined,
      field: u.field || undefined,
      purpose: u.purpose || undefined,
    };
  }

  async function refresh() {
    // Push any accounts that exist only in this browser up to the central
    // database, then show the central list. Fall back to device-local
    // accounts when the backend is unreachable.
    setRefreshing(true);
    setConnectionErr(false);
    let local: AdminUser[] = [];
    try { local = getUsers(); setStorageErr(''); }
    catch (e) { setStorageErr(e instanceof Error ? e.message : String(e)); }
    // In local mode we can at least show this device's own evaluation profile
    try {
      const me = localStorage.getItem(STORAGE_KEY);
      const profile: EvalProfile | null = JSON.parse(localStorage.getItem('ge_profile') || 'null');
      if (me && profile) local = local.map((u) => (u.username === me ? { ...u, ...profile } : u));
    } catch { /* ignore malformed profile */ }
    try {
      await apiImportUsers(local).catch((e) => { if (e instanceof AdminKeyRequiredError) throw e; return 0; });
      const server = await apiListUsers();
      setUsers(server.map(serverToStored));
      setServerMode(true);
      setNeedKey(false);
      setConnectionErr(false);
    } catch (e) {
      if (e instanceof AdminKeyRequiredError) {
        setNeedKey(true);
        setKeyNotConfigured(e.notConfigured);
        setUsers([]);
        setServerMode(true);
        return;
      }
      // Do not erase a central list that was already visible merely because a
      // later refresh hit a temporary cold-start/network failure.
      setUsers((current) => current.length > 0 ? current : local);
      setServerMode(false);
      setConnectionErr(true);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResetPassword() {
    setResetMsg('');
    if (!newPass) { setResetMsg(t('adminResetErrEmpty')); return; }
    if (newPass !== newPassConfirm) { setResetMsg(t('adminResetErrMatch')); return; }
    if (!resetTarget) return;
    if (serverMode) {
      try { await apiResetPassword(resetTarget.username, newPass); }
      catch { setResetMsg(t('adminResetErrServer')); return; }
    } else {
      const { hash, salt } = await hashPassword(newPass);
      let current: StoredUser[];
      try { current = getUsers(); }
      catch (e) { setResetMsg(e instanceof Error ? e.message : String(e)); return; }
      const updated = current.map((u) =>
        u.username === resetTarget.username ? { ...u, password: hash, salt } : u,
      );
      saveUsers(updated);
      setUsers(updated);
    }
    setResetMsg(t('adminResetSuccess'));
    setNewPass(''); setNewPassConfirm('');
    setTimeout(() => { setResetTarget(null); setResetMsg(''); }, 1500);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (serverMode) {
      try { await apiDeleteUser(deleteTarget.username); }
      catch { setDeleteTarget(null); return; }
      // Also remove any device-local copy so imports don't resurrect it
      try {
        const local = getUsers().filter((u) => u.username !== deleteTarget.username);
        saveUsers(local);
      } catch { /* local store unreadable — nothing to clean */ }
      if (localStorage.getItem(STORAGE_KEY) === deleteTarget.username) {
        localStorage.removeItem(STORAGE_KEY);
      }
      setDeleteTarget(null);
      await refresh();
      return;
    }
    let current: StoredUser[];
    try { current = getUsers(); }
    catch (e) {
      setStorageErr(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
      return;
    }
    const updated = current.filter((u) => u.username !== deleteTarget.username);
    saveUsers(updated);
    if (localStorage.getItem(STORAGE_KEY) === deleteTarget.username) {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUsers(updated);
    setDeleteTarget(null);
  }

  // Sort newest-first, then apply search filter
  const sorted = [...users].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const filtered = sorted.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const inputCls = 'w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';
  const dateLocale = lang === 'es' ? 'es-ES' : 'en-US';

  return (
    <main id="main-content" tabIndex={-1} className="outline-none relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24 flex-grow w-full">
      {/* Storage corruption warning */}
      {storageErr && <StorageCorruptBanner message={storageErr} onDismiss={() => setStorageErr('')} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-900/60 border border-rose-700/50 flex items-center justify-center text-lg">🔐</div>
          <div>
            <h1 className="text-white font-extrabold text-2xl tracking-tight">{t('adminTitle')}</h1>
            <p className="text-slate-400 text-xs">
              {serverMode !== true && users.length === 0
                ? t('adminCountUnavailable')
                : `${users.length} ${users.length !== 1 ? t('adminAccountPlural') : t('adminAccountSingular')}`}
              {serverMode !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${serverMode ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/15 border-amber-500/30 text-amber-400'}`}>
                  {serverMode ? t('adminModeServer') : t('adminModeLocal')}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer font-medium self-start sm:self-auto disabled:opacity-60 disabled:cursor-wait"
        >
          {refreshing ? t('adminConnecting') : t('adminRefresh')}
        </button>
      </div>

      {/* Admin key prompt — backend requires a key before showing accounts */}
      {needKey && (
        <div className="glass-panel rounded-2xl p-6 mb-6 border border-indigo-500/30">
          <h2 className="text-white font-bold text-sm mb-1">{t('adminKeyTitle')}</h2>
          <p className={`text-xs mb-4 ${keyNotConfigured ? 'text-amber-400' : 'text-slate-400'}`}>
            {keyNotConfigured ? t('adminKeyNotConfigured') : t('adminKeyDesc')}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setAdminKey(keyInput.trim()); setKeyInput(''); refresh(); }}
          >
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className={inputCls}
              placeholder={t('adminKeyPlaceholder')}
              autoFocus
            />
            <button type="submit" className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all cursor-pointer flex-shrink-0">{t('adminKeyBtn')}</button>
          </form>
          {!keyNotConfigured && getAdminKey() && <p className="text-amber-400 text-xs mt-3">{t('adminKeyRejected')}</p>}
        </div>
      )}

      {connectionErr && (
        <div
          data-testid="admin-connection-error"
          className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200"
          role="status"
        >
          {t('adminConnectionFailed')}
        </div>
      )}

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
          placeholder={t('adminSearchPlaceholder')}
        />
      </div>

      {/* User Grid */}
      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center text-slate-500 text-sm">
          {refreshing && serverMode === null
            ? t('adminConnecting')
            : connectionErr && users.length === 0
              ? t('adminConnectionFailed')
              : users.length === 0 ? t('adminNoUsers') : t('adminNoResults')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((user) => {
            const hasEmail   = Boolean(user.email);
            const secLevel   = user.salt ? 'PBKDF2' : user.password.length === 64 ? 'SHA-256' : 'Legacy';
            const missing    = [...(!hasEmail ? [t('adminFieldEmail')] : [])];
            const incomplete = missing.length > 0;

            return (
              <div
                key={user.username}
                className={`glass-panel rounded-2xl p-5 relative flex flex-col gap-4 border transition-colors ${
                  incomplete ? 'border-amber-500/40' : 'border-slate-700/30'
                }`}
              >
                {/* Top accent bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl ${
                    incomplete
                      ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                      : 'bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500'
                  }`}
                />

                {/* Username + action buttons */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-indigo-300 text-sm bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg truncate max-w-[60%]">
                    @{user.username}
                  </span>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => { setResetTarget(user); setNewPass(''); setNewPassConfirm(''); setResetMsg(''); }}
                      title={t('adminResetTitle')}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-700/50 text-indigo-300 text-xs transition-all cursor-pointer"
                    >🔑</button>
                    <button
                      onClick={() => setDeleteTarget(user)}
                      title={t('adminDeleteTitle')}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-400 text-xs transition-all cursor-pointer"
                    >🗑</button>
                  </div>
                </div>

                {/* Field rows */}
                <div className="space-y-2.5">
                  {/* Email */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">{t('adminFieldEmail')}</span>
                    {hasEmail
                      ? <span className="text-xs text-slate-300 font-mono truncate">{user.email}</span>
                      : <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium flex-shrink-0">{t('adminEmailMissing')}</span>
                    }
                  </div>

                  {/* Password */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">{t('adminFieldPassword')}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium flex-shrink-0">
                      {t('adminPassSet')} {secLevel}
                    </span>
                  </div>

                  {/* Evaluation profile: school / country / intention */}
                  {([
                    [t('adminFieldSchool'), user.institution],
                    [t('adminFieldCountry'), user.country],
                    [t('adminFieldIntention'), user.purpose],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">{label}</span>
                      {value
                        ? <span className="text-xs text-slate-300 truncate">{value}</span>
                        : <span className="text-xs text-slate-600 italic flex-shrink-0">{t('adminFieldNotProvided')}</span>
                      }
                    </div>
                  ))}

                  {/* Joined */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-shrink-0">{t('adminFieldJoined')}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* Incomplete summary footer */}
                {incomplete && (
                  <div className="pt-2 border-t border-amber-500/20">
                    <span className="text-xs text-amber-400">
                      {missing.length} {missing.length !== 1 ? t('adminFieldsNeededPlural') : t('adminFieldsNeededSingular')} {missing.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={refresh}
        disabled={refreshing}
        className="mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer bg-transparent border-none disabled:opacity-60 disabled:cursor-wait"
      >
        {refreshing ? t('adminConnecting') : t('adminRefreshList')}
      </button>

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass-panel p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <h3 className="text-white font-bold text-lg mb-1">{t('adminResetTitle')}</h3>
            <p className="text-slate-400 text-xs mb-6">{t('adminResetFor')} <span className="text-indigo-300 font-mono">@{resetTarget.username}</span></p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('adminResetLNew')}</label>
                <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className={inputCls} placeholder={t('adminResetPNew')} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('adminResetLConfirm')}</label>
                <input type="password" value={newPassConfirm} onChange={(e) => setNewPassConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()} className={inputCls} placeholder={t('adminResetPConfirm')} />
              </div>
              {resetMsg && <p className={`text-xs ${resetMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{resetMsg}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={handleResetPassword} className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">{t('adminResetBtn')}</button>
                <button onClick={() => { setResetTarget(null); setResetMsg(''); }} className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-all cursor-pointer border border-slate-700">{t('adminCancelBtn')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass-panel p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-500" />
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-white font-bold text-lg mb-2">{t('adminDeleteTitle')}</h3>
              <p className="text-slate-400 text-sm mb-6">
                {t('adminDeleteMsg1')} <span className="text-red-400 font-mono">@{deleteTarget.username}</span> {t('adminDeleteMsg2')}
              </p>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition-all cursor-pointer">{t('adminDeleteBtn')}</button>
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-all cursor-pointer border border-slate-700">{t('adminCancelBtn')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const GUIDE_SLUGS = Object.keys(seoPages).filter((r) => r.startsWith('/guides/')).map((r) => r.slice('/guides/'.length));

function NotFoundView() {
  const { lang } = useLang();
  return (
    <main id="main-content" tabIndex={-1} className="relative z-10 mx-auto px-6 py-24 outline-none">
      <h1 className="text-3xl font-bold">{lang === 'es' ? 'Página no encontrada' : 'Page not found'}</h1>
      <Link href="/" className="text-indigo-300 underline">{lang === 'es' ? 'Volver al inicio' : 'Return to homepage'}</Link>
    </main>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appView, setAppView] = useState<AppView>('auth');
  const [username, setUsername] = useState('');
  const [modal, setModal] = useState<'privacy' | 'terms' | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [userStoreError, setUserStoreError] = useState<string>('');

  const toggleLang = () => setLang((l) => (l === 'en' ? 'es' : 'en'));
  const t = (k: TKey) => TX[lang][k];

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // Claim legacy data for its signed-in owner before another account can use
      // the same browser. Preserve it in the new per-account storage.
      try {
        const profile = loadEducationProfile(saved);
        if (Object.keys(profile).length) storeEducationProfile(saved, profile);
      } catch { /* The evaluator displays a blocking message and preserves the raw data. */ }
      setUsername(saved); setAppView('app');
    }

    try { getUsers(); }
    catch (e) { setUserStoreError(e instanceof Error ? e.message : String(e)); }

    // Remove the legacy device-local admin password (ge_admin_pass) if it
    // exists from a previous version. Admin auth is now server-only, so this
    // entry serves no purpose and could mislead future changes.
    localStorage.removeItem('ge_admin_pass');

    // Push this browser's account + evaluation profile to the central
    // database so the admin board sees sign-ups from every device.
    syncOwnAccount();
  }, []);

  function handleLogin(user: string) {
    setUsername(user); setAppView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setUsername(''); setAppView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <LangCtx.Provider value={{ lang, toggleLang, t }}>
    <WouterRouter base={base}>
      <PageMetadata lang={lang} />
      <div className="bg-slate-950 text-slate-100 min-h-screen font-sans relative overflow-x-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
        <div className="glow-effect -top-40 -left-40 rounded-full" />
        <div className="glow-effect top-1/3 -right-40 rounded-full" />

        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-indigo-500 focus:px-4 focus:py-3 focus:font-bold focus:text-white">{GUIDE_UI[lang].skip}</a>
        <Navbar appView={appView} username={username} onLogout={handleLogout} />

        <Switch>
          <Route path="/about">
            <AboutPage />
          </Route>
          <Route path="/how-it-works">
            <HowItWorksPage />
          </Route>
          <Route path="/guides">
            <Suspense fallback={<main id="main-content" className="relative z-10 mx-auto w-full max-w-3xl flex-grow px-6 pt-12"><p role="status" className="text-slate-400">{GUIDE_UI[lang].loading}</p></main>}><GuidesRoute lang={lang} /></Suspense>
          </Route>
          <Route path="/guides/:slug">
            {(params) => GUIDE_SLUGS.includes(params.slug) ? <Suspense fallback={<main id="main-content" className="relative z-10 mx-auto w-full max-w-3xl flex-grow px-6 pt-12"><p role="status" className="text-slate-400">{GUIDE_UI[lang].loading}</p></main>}><GuidesRoute slug={params.slug} lang={lang} /></Suspense> : <NotFoundView />}
          </Route>
          <Route path="/admin">
            <AdminGate />
          </Route>
          <Route path="/">
            <main id="main-content" tabIndex={-1} className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 flex-grow w-full outline-none">
              {appView === 'auth' ? <AuthView onLogin={handleLogin} storageError={userStoreError} /> : <EvaluatorView />}
            </main>
          </Route>
          <Route>
            <NotFoundView />
          </Route>
        </Switch>

        <Footer onPrivacy={() => setModal('privacy')} onTerms={() => setModal('terms')} />

        {modal === 'privacy' && (
          <Modal id="privacy" title={t('privTitle')} onClose={() => setModal(null)}>
            <p dangerouslySetInnerHTML={{ __html: t('privP1') }} />
            <p dangerouslySetInnerHTML={{ __html: t('privP2') }} />
            <p dangerouslySetInnerHTML={{ __html: t('privP3') }} />
          </Modal>
        )}
        {modal === 'terms' && (
          <Modal id="terms" title={t('termsTitle')} onClose={() => setModal(null)}>
            <p dangerouslySetInnerHTML={{ __html: t('termsP1') }} />
            <p dangerouslySetInnerHTML={{ __html: t('termsP2') }} />
            <p dangerouslySetInnerHTML={{ __html: t('termsP3') }} />
            <p dangerouslySetInnerHTML={{ __html: t('termsP4') }} />
          </Modal>
        )}
      </div>
    </WouterRouter>
    </LangCtx.Provider>
  );
}
