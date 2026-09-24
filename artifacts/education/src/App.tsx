import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { hashPassword, verifyAndMigratePassword } from './auth';
import {
  type StoredUser,
  UserStoreCorruptError,
  getUsers,
  saveUsers,
} from './userStore';
import { StorageCorruptBanner } from './StorageCorruptBanner';
import { jobSearchUrl, getAlignedRoles } from './jobRoles';
import { classifyEducationLevel } from './educationLevel';
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
  apiSaveContacted,
  apiFetchContacted,
  apiSaveRoadmapSteps,
  apiFetchRoadmapSteps,
  type EvalProfile,
  type InstitutionVerification as InstitutionVerificationResult,
} from './api';
import { contactedStorageKey, loadContacted, mergeContacted } from './contactedSync';
import { SchoolFinder } from './SchoolFinder';
import { InstitutionVerification } from './InstitutionVerification';

/**
 * Best-effort push of this visitor's own account + evaluation profile to the
 * central database. Runs once per page load; makes accounts created before
 * the backend existed (or while offline) appear on the admin board.
 */
function syncOwnAccount(): void {
  const username = localStorage.getItem(STORAGE_KEY);
  if (!username) return;
  let profile: EvalProfile | undefined;
  try { profile = JSON.parse(localStorage.getItem('ge_profile') || 'null') || undefined; } catch { /* ignore */ }
  try {
    const me = getUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (me) { void apiSyncSelf(me, profile); return; }
  } catch { /* local store unreadable */ }
  // Account exists only server-side — still push the profile if we have one
  if (profile) void apiSaveProfile(username, profile);
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
    stat2: 'NACES', stat2L: 'Agency Aligned',
    stat3: '< 2 min', stat3L: 'To Your Roadmap',
    f1t: 'Credential Mapping', f1d: 'See exactly how your foreign degree maps to U.S. equivalency standards, institution types, and academic frameworks.',
    f2t: 'NACES Agency Matching', f2d: 'Find the right accredited evaluation agency for your specific country, degree level, and end goal.',
    f3t: 'Licensing Roadmap', f3d: 'Get field-specific licensing and regulatory requirements for your U.S. career path, state by state.',
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
    about03P2: 'We map your credentials to U.S. equivalency standards, help you understand which evaluation agencies apply to your situation, surface the field-specific licensing and employment requirements you need to know, and connect you with the job boards where real opportunities are waiting.',
    about03P3: 'We cannot promise the road ahead will be short. But we can promise you will not be walking it without a map.',
    val1T: 'Honest Guidance', val1D: 'We tell you what we know — and what we do not know. No false promises, no shortcuts.',
    val2T: 'Specific Answers', val2D: 'Your country. Your degree. Your field. The right answer depends on all three.',
    val3T: 'Built for the Journey', val3D: 'We are with you from your first question to your first U.S. job application.',
    aboutCtaText: 'Ready to find out how your credentials translate? Start with the evaluator — it takes less than two minutes and gives you a real picture of where you stand.',
    // How It Works page
    howBadge: '⚡ Simple, Step-by-Step',
    stepLabel: 'Step',
    whatNeedTitle: '📦 What You Will Need to Get Started',
    howCtaText: 'Ready to get started? The evaluator takes less than two minutes. Enter your details and we will generate your equivalency report and action roadmap instantly.',
    step01T: 'Create Your Account',
    step01D: 'Sign up with a username and email. Your information stays private and secure — it is used only to save your progress and correspond with you about your evaluation.',
    step01Det: 'We keep your data strictly confidential. It is never shared with government agencies, employers, or third parties.',
    step02T: 'Enter Your Credential Details',
    step02D: 'Tell us your country of education, institution name, degree level, and field of study. The more detail you provide, the more specific your results will be.',
    step02Det: 'You can also note your primary goal — university admission, employment, professional licensing, or immigration — so we can tailor the roadmap to your path.',
    step03T: 'We Analyze Your Credentials',
    step03D: 'Our platform maps your degree to its U.S. equivalent, identifies the relevant NACES evaluation agencies, and surfaces field-specific licensing and regulatory requirements.',
    step03Det: 'Results are generated instantly based on your inputs, giving you a clear starting point before you spend time or money on official evaluations.',
    step04T: 'Follow Your Personalized Roadmap',
    step04D: "You receive a step-by-step action plan: verify your institution, map your coursework, align with your goal's requirements, and prepare your NACES application dossier.",
    step04Det: 'Each step is checkable so you can track your progress as you move through the process.',
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
    stat2: 'NACES', stat2L: 'Agencias Acreditadas',
    stat3: '< 2 min', stat3L: 'Para Tu Hoja de Ruta',
    f1t: 'Mapeo de Credenciales', f1d: 'Ve exactamente cómo tu título extranjero se equipara con los estándares de equivalencia de EE.UU., tipos de instituciones y marcos académicos.',
    f2t: 'Agencias NACES', f2d: 'Encuentra la agencia evaluadora acreditada correcta para tu país, nivel de título y objetivo final.',
    f3t: 'Hoja de Ruta de Licencias', f3d: 'Obtén los requisitos de licencias específicos por campo para tu carrera en EE.UU., estado por estado.',
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
    about03P2: 'Mapeamos tus credenciales a los estándares de equivalencia de EE.UU., te ayudamos a entender qué agencias evaluadoras aplican a tu situación, mostramos los requisitos de licencia y empleo específicos del campo que necesitas saber, y te conectamos con las bolsas de trabajo donde esperan oportunidades reales.',
    about03P3: 'No podemos prometer que el camino por delante será corto. Pero sí podemos prometerte que no lo caminarás sin un mapa.',
    val1T: 'Orientación Honesta', val1D: 'Te decimos lo que sabemos — y lo que no sabemos. Sin promesas falsas, sin atajos.',
    val2T: 'Respuestas Específicas', val2D: 'Tu país. Tu título. Tu campo. La respuesta correcta depende de los tres.',
    val3T: 'Construido Para el Camino', val3D: 'Estamos contigo desde tu primera pregunta hasta tu primera solicitud de empleo en EE.UU.',
    aboutCtaText: '¿Listo para descubrir cómo se traducen tus credenciales? Comienza con el evaluador — tarda menos de dos minutos y te da una imagen real de dónde estás.',
    // How It Works page
    howBadge: '⚡ Simple, Paso a Paso',
    stepLabel: 'Paso',
    whatNeedTitle: '📦 Lo Que Necesitarás Para Comenzar',
    howCtaText: '¿Listo para comenzar? El evaluador tarda menos de dos minutos. Ingresa tus datos y generaremos tu informe de equivalencia y hoja de ruta de acción al instante.',
    step01T: 'Crear Tu Cuenta',
    step01D: 'Regístrate con un nombre de usuario y correo electrónico. Tu información permanece privada y segura — solo se usa para guardar tu progreso y corresponderte sobre tu evaluación.',
    step01Det: 'Mantenemos tus datos estrictamente confidenciales. Nunca se comparten con agencias gubernamentales, empleadores ni terceros.',
    step02T: 'Ingresa los Detalles de Tu Credencial',
    step02D: 'Cuéntanos tu país de estudios, nombre de la institución, nivel del título y campo de estudio. Cuanto más detalle proporciones, más específicos serán tus resultados.',
    step02Det: 'También puedes indicar tu objetivo principal — admisión universitaria, empleo, licencia profesional o inmigración — para adaptar la hoja de ruta a tu camino.',
    step03T: 'Analizamos Tus Credenciales',
    step03D: 'Nuestra plataforma mapea tu título a su equivalente en EE.UU., identifica las agencias evaluadoras NACES relevantes y muestra los requisitos de licencias y regulaciones específicos de tu campo.',
    step03Det: 'Los resultados se generan al instante en base a tus datos, dándote un punto de partida claro antes de que gastes tiempo o dinero en evaluaciones oficiales.',
    step04T: 'Sigue Tu Hoja de Ruta Personalizada',
    step04D: 'Recibes un plan de acción paso a paso: verifica tu institución, mapea tu plan de estudios, alinéate con los requisitos de tu objetivo y prepara tu expediente de solicitud NACES.',
    step04Det: 'Cada paso es verificable para que puedas hacer seguimiento de tu progreso mientras avanzas en el proceso.',
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

/** Maps the canonical English goal value (stored in localStorage / DB) to its TX key. */
const GOAL_TX_KEYS: Partial<Record<string, TKey>> = {
  'University Admission': 'evalGoal1',
  'Employment & HR': 'evalGoal2',
  'Professional Licensing': 'evalGoal3',
  'Immigration (USCIS)': 'evalGoal4',
};
function useLang() { return useContext(LangCtx); }
type AppView = 'auth' | 'app';

// Only raw inputs are stored; all derived display strings are computed at render-time
// from the active language so that language switches always reflect the current locale.
interface EvalResult {
  country: string;
  institution: string;
  degree: string;
  field: string;
  purpose: string;
}

// Spanish synonyms are included so users who type field names in Spanish get the correct pathway.
function getUsLevel(
  degree: string,
  institution: string,
  field: string,
  t: (k: TKey) => string,
): string {
  const level = classifyEducationLevel({ degree, institution, field });
  const keyByLevel: Record<ReturnType<typeof classifyEducationLevel>, TKey> = {
    secondary: 'usLevelSecondary',
    associate: 'usLevelAssociate',
    bachelor: 'usLevelBachelor',
    master: 'usLevelMaster',
    doctor: 'usLevelDoctor',
    unknown: 'usLevelUnknown',
  };
  return t(keyByLevel[level]);
}

function getInsight(field: string, t: (k: TKey) => string): string {
  const f = field.toLowerCase();
  if (f.includes('account') || f.includes('finance') || f.includes('audit') ||
      f.includes('contab') || f.includes('finanz') || f.includes('auditor') || f.includes('contabilid')) return t('insightAccount');
  if (f.includes('engineering') || f.includes('tech') || f.includes('computer') ||
      f.includes('ingeni') || f.includes('tecnolog') || f.includes('computac') || f.includes('informát') || f.includes('informat') || f.includes('sistem')) return t('insightEngineering');
  if (f.includes('nursing') || f.includes('health') || f.includes('medicine') ||
      f.includes('enfermer') || f.includes('salud') || f.includes('medic') || f.includes('medicina')) return t('insightHealth');
  return t('insightGeneral');
}

function getRoadmap(country: string, institution: string, field: string, purpose: string, t: (k: TKey) => string) {
  return [
    {
      title: `${t('rm1Title')} ${institution || 'Foreign Institution'}`,
      desc: `${t('rm1DescPre')} ${country || 'International'} ${t('rm1DescSuf')}`,
    },
    {
      title: t('rm2Title'),
      desc: `${t('rm2DescPre')} ${field || 'your field'}.`,
    },
    {
      title: `${t('rm3TitlePre')} ${purpose || t('rm3TitleFallback')} ${t('rm3TitleSuf')}`,
      desc: t('rm3Desc'),
    },
    {
      title: t('rm4Title'),
      desc: t('rm4Desc'),
    },
  ];
}
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
  const { t } = useLang();
  const [, setLocation] = useLocation();
  return (
    <nav className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center cursor-pointer bg-transparent border-none p-0"
          data-testid="link-home"
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`.replace(/\/+/g, '/')}
            alt="VerifED Global"
            className="h-10 w-auto object-contain"
          />
        </button>

        <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-400">
          <Link href="/about" className="hover:text-white transition-colors" data-testid="link-about">{t('about')}</Link>
          <Link href="/how-it-works" className="hover:text-white transition-colors" data-testid="link-how-it-works">{t('howItWorks')}</Link>
          <LangToggle />
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile lang toggle */}
          <div className="md:hidden"><LangToggle /></div>

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
    </nav>
  );
}

function Footer({ onPrivacy, onTerms }: { onPrivacy: () => void; onTerms: () => void }) {
  const { t } = useLang();
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-6 relative z-10 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <p className="text-xs text-slate-400 font-medium">{t('footerCopy')}</p>
          <p className="text-[11px] text-slate-500 mt-1">{t('footerTag')}</p>
        </div>
        <div className="flex items-center space-x-6 text-xs text-slate-400 font-medium">
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
    <main className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full space-y-16">
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
    <main className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 flex-grow w-full space-y-8">
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
  const { t } = useLang();
  const [isSignUp, setIsSignUp] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  /** Merge the sign-up answers into the saved eval profile (without clobbering
   *  anything the evaluator already captured) so the admin board and later
   *  syncs see them even if the user never runs the evaluator. */
  function saveSignupProfile(): void {
    const trimmed = { country: country.trim(), purpose };
    if (!trimmed.country && !trimmed.purpose) return;
    let existing: EvalProfile = {};
    try { existing = JSON.parse(localStorage.getItem('ge_profile') || 'null') || {}; } catch { /* ignore */ }
    const merged: EvalProfile = {
      ...existing,
      ...(trimmed.country && !existing.country ? { country: trimmed.country } : {}),
      ...(trimmed.purpose && !existing.purpose ? { purpose: trimmed.purpose } : {}),
    };
    localStorage.setItem('ge_profile', JSON.stringify(merged));
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
          if (r.profile) {
            let existing: EvalProfile = {};
            try { existing = JSON.parse(localStorage.getItem('ge_profile') || 'null') || {}; } catch { /* ignore */ }
            const merged = { ...r.profile, ...Object.fromEntries(Object.entries(existing).filter(([, v]) => v)) };
            try { localStorage.setItem('ge_profile', JSON.stringify(merged)); } catch { /* storage full/blocked */ }
          }
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

// ─── Step content generators ──────────────────────────────────────────────────

function getVerifyContent(verification: InstitutionVerificationResult | null, institution: string, country: string, degree: string, t: (k: TKey) => string) {
  const selected = verification?.selected;
  if (!selected) {
    return {
      status: 'Unverified institution — user chose to continue',
      rows: [
        { label: 'Verification status', value: 'UNVERIFIED — no source-backed institution match was confirmed' },
        { label: t('verifyInstitution'), value: institution },
        { label: t('verifyCountry'), value: country },
        { label: t('verifyDegree'), value: degree },
        { label: t('verifyRegistry'), value: 'No corroborating directory result was selected' },
        { label: t('verifyRecognition'), value: 'Not checked — no accreditation or authenticity claim is made' },
        { label: 'Next step', value: 'Ask a qualified credential evaluator to verify the institution and documents directly' },
      ],
      action: null,
    };
  }
  return {
    status: t('verifyStatus'),
    rows: [
      { label: t('verifyInstitution'), value: selected.name },
      { label: t('verifyCountry'), value: selected.country || 'Unavailable' },
      { label: t('verifyDegree'), value: degree },
      { label: t('verifyRegistry'), value: selected.sources.map((source) => source.name).join(', ') },
      { label: 'Higher-education type', value: selected.higherEducationType || 'Unavailable' },
      { label: 'Official website listing', value: selected.officialWebsite || 'Unavailable; live availability not checked' },
      ...(selected.closureDate ? [{ label: 'Reported closure date', value: `${selected.closureDate}${selected.archiveUrl ? ' — archived history available' : ''}` }] : []),
      ...(selected.archiveUrl ? [{ label: 'Internet Archive evidence', value: selected.archiveUrl }] : []),
      ...selected.sources.map((source) => ({ label: `Source: ${source.name}`, value: source.url })),
      { label: t('verifyRecognition'), value: t('verifyRecognitionVal') },
      { label: 'Evidence retrieved', value: new Date(verification.retrievedAt).toLocaleString() },
    ],
    action: { label: t('verifyActionLabel'), url: `https://www.wikidata.org/wiki/${selected.entityId}` } as { label: string; url: string } | null,
  };
}

function getCourseworkContent(field: string, credits: string, t: (k: TKey) => string) {
  const f = field.toLowerCase();
  let rows: { regional: string; usSCU: string; notes: string }[] = [];
  if (f.includes('account') || f.includes('finance') ||
      f.includes('contab') || f.includes('finanz') || f.includes('auditor') || f.includes('contabilid')) {
    rows = [
      { regional: t('cwAcct1'), usSCU: '6 SCU', notes: t('cwNoteAASCB') },
      { regional: t('cwAcct2'), usSCU: '3 SCU', notes: t('cwNoteCPAPath') },
      { regional: t('cwAcct3'), usSCU: '3 SCU', notes: t('cwNoteStateMin') },
      { regional: t('cwAcct4'), usSCU: '3 SCU', notes: t('cwNoteTaxElec') },
      { regional: t('cwAcct5'), usSCU: '3 SCU', notes: t('cwNote150') },
      { regional: t('cwAcct6'), usSCU: '6 SCU', notes: t('cwNoteCoreBiz') },
    ];
  } else if (f.includes('engineer') || f.includes('tech') || f.includes('computer') ||
             f.includes('ingeni') || f.includes('tecnolog') || f.includes('computac') || f.includes('informat') || f.includes('sistem')) {
    rows = [
      { regional: t('cwEng1'), usSCU: '9 SCU', notes: t('cwNoteABETMath') },
      { regional: t('cwEng2'), usSCU: '8 SCU', notes: t('cwNoteLabCred') },
      { regional: t('cwEng3'), usSCU: '30–36 SCU', notes: t('cwNoteMajorMap') },
      { regional: t('cwEng4'), usSCU: '6 SCU', notes: t('cwNoteSenDes') },
    ];
  } else if (f.includes('nurs') || f.includes('health') || f.includes('medic') ||
             f.includes('enfermer') || f.includes('salud') || f.includes('medicina')) {
    rows = [
      { regional: t('cwHealth1'), usSCU: '8 SCU', notes: t('cwNoteWithLab') },
      { regional: t('cwHealth2'), usSCU: '3 SCU', notes: t('cwNoteClinReq') },
      { regional: t('cwHealth3'), usSCU: '18–24 SCU', notes: t('cwNoteNCLEXPre') },
      { regional: t('cwHealth4'), usSCU: '500+ hrs', notes: t('cwNoteStateBdMin') },
    ];
  } else {
    rows = [
      { regional: t('cwGen1'), usSCU: '30–36 SCU', notes: t('cwNoteCourseRev') },
      { regional: t('cwGen2'), usSCU: '30 SCU', notes: t('cwNoteGenEd') },
      { regional: t('cwGen3'), usSCU: '12–18 SCU', notes: t('cwNoteInstElec') },
      { regional: t('cwGen4'), usSCU: '3–6 SCU', notes: t('cwNoteIfApp') },
    ];
  }
  const totalSCU = credits ? `${t('cwTotalEstimated')} ${credits}` : t('cwTotalDefault');
  return { rows, totalSCU };
}

function getPrereqContent(field: string, purpose: string, t: (k: TKey) => string) {
  const f = field.toLowerCase();
  const p = purpose.toLowerCase();
  const items: { label: string; value: string; link?: string }[] = [];

  if (f.includes('account') || f.includes('finance') ||
      f.includes('contab') || f.includes('finanz') || f.includes('auditor') || f.includes('contabilid')) {
    items.push(
      { label: t('preqCPACredit'), value: t('preqCPACreditVal') },
      { label: t('preqGPA'), value: t('preqGPAVal') },
      { label: t('preqAcctHrs'), value: t('preqAcctHrsVal') },
      { label: t('preqBizHrs'), value: t('preqBizHrsVal') },
      { label: t('preqNASBA'), value: t('preqNASBAVal'), link: 'https://nasba.org/licensure/applyforalicense/' },
    );
  } else if (f.includes('engineer') || f.includes('tech') || f.includes('computer') ||
             f.includes('ingeni') || f.includes('tecnolog') || f.includes('computac') || f.includes('informat') || f.includes('sistem')) {
    items.push(
      { label: t('preqFE'), value: t('preqFEVal') },
      { label: t('preqGPAMin'), value: t('preqGPAMinVal') },
      { label: t('preqABET'), value: t('preqABETVal') },
      { label: t('preqNCEES'), value: t('preqNCEESVal'), link: 'https://ncees.org/engineering/fe/' },
    );
  } else if (f.includes('nurs') || f.includes('health') || f.includes('medic') ||
             f.includes('enfermer') || f.includes('salud') || f.includes('medicina')) {
    items.push(
      { label: t('preqCGFNS'), value: t('preqCGFNSVal') },
      { label: t('preqEnglish'), value: t('preqEnglishVal') },
      { label: t('preqClinical'), value: t('preqClinicalVal') },
      { label: t('preqNCLEX'), value: t('preqNCLEXVal'), link: 'https://www.ncsbn.org/nclex.htm' },
    );
  } else {
    items.push(
      { label: t('preqGPAGen'), value: t('preqGPAGenVal') },
      { label: t('preqEnglishGen'), value: t('preqEnglishGenVal') },
      { label: t('preqCredEval'), value: t('preqCredEvalVal') },
    );
  }

  if (p.includes('immigration') || p.includes('inmigraci')) {
    items.push({ label: t('preqUSCIS'), value: t('preqUSCISVal'), link: 'https://www.uscis.gov/working-in-the-united-states' });
  }
  if (p.includes('university') || p.includes('universitaria') || p.includes('admisi')) {
    items.push({ label: t('preqGradAdm'), value: t('preqGradAdmVal') });
  }

  return items;
}

function exportDossier(result: EvalResult, usLevel: string, verifyRows: { label: string; value: string }[], prereqItems: { label: string; value: string }[], lang: Lang, t: (k: TKey) => string) {
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>VerifED Global – NACES Dossier</title>
<style>
  body { font-family: Georgia, serif; max-width: 780px; margin: 40px auto; padding: 0 30px; color: #1a1a2e; line-height: 1.6; }
  .header { border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 32px; }
  .logo { font-size: 24px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; }
  .subtitle { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }
  .ref { font-size: 11px; color: #9ca3af; float: right; margin-top: -40px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #4f46e5; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td { padding: 8px 10px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  td:first-child { font-weight: 600; color: #374151; width: 42%; }
  td:last-child { color: #1f2937; }
  .badge { display: inline-block; background: #ede9fe; color: #5b21b6; border-radius: 20px; padding: 4px 14px; font-size: 12px; font-weight: 700; margin: 4px 4px 4px 0; }
  .notice { font-size: 11px; color: #6b7280; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #9ca3af; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">VerifED Global</div>
  <div class="subtitle">${t('dossierSubtitle')}</div>
  <div class="ref">${t('dossierGenerated')} ${today}<br/>REF-2026-US</div>
</div>

<h2>${t('dossierSecCredential')}</h2>
<table>
  <tr><td>${t('dossierRowInstitution')}</td><td>${escapeHtml(result.institution)}</td></tr>
  <tr><td>${t('dossierRowCountry')}</td><td>${escapeHtml(result.country)}</td></tr>
  <tr><td>${t('dossierRowDegree')}</td><td>${escapeHtml(result.degree)}</td></tr>
  <tr><td>${t('dossierRowField')}</td><td>${escapeHtml(result.field)}</td></tr>
  <tr><td>${t('dossierRowUSEq')}</td><td><strong>${escapeHtml(usLevel)}</strong></td></tr>
  ${result.purpose ? `<tr><td>${t('dossierRowGoal')}</td><td>${escapeHtml(result.purpose)}</td></tr>` : ''}
</table>

<h2>${t('dossierSecVerification')}</h2>
<table>
  ${verifyRows.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`).join('')}
</table>

<h2>${t('dossierSecNACES')}</h2>
<table>
  <tr><td>World Education Services (WES)</td><td><a href="https://www.wes.org">wes.org</a></td></tr>
  <tr><td>Educational Credential Evaluators (ECE)</td><td><a href="https://www.ece.org">ece.org</a></td></tr>
  <tr><td>Josef Silny &amp; Associates</td><td><a href="https://www.jsilny.org">jsilny.org</a></td></tr>
  <tr><td>SpanTran</td><td><a href="https://spantran.com">spantran.com</a></td></tr>
</table>

<h2>${t('dossierSecRegulatory')}</h2>
<table>
  ${prereqItems.map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`).join('')}
</table>

<h2>${t('dossierSecInsight')}</h2>
<p style="font-size:13px; color:#374151;">${getInsight(result.field, t).replace(/\n/g, '<br/>')}</p>

<h2>${t('dossierSecTags')}</h2>
<div>
  <span class="badge">🎓 ${escapeHtml(usLevel)}</span>
  <span class="badge">📚 ${escapeHtml(result.field)}</span>
  <span class="badge">📍 ${escapeHtml(result.country)}</span>
  ${result.purpose ? `<span class="badge">🎯 ${escapeHtml(result.purpose)}</span>` : ''}
</div>

<p class="notice">
  ${t('dossierDisclaimer')}
</p>

<div class="footer">${t('dossierFooter')}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VerifED-Global-Dossier-${result.institution.replace(/[^a-z0-9]+/gi, '-').slice(0, 80) || 'institution'}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Evaluator View ───────────────────────────────────────────────────────────

// ─── NACES Agency Outreach ────────────────────────────────────────────────────
const NACES_AGENCIES = [
  { name: 'Academic Evaluation Services, Inc.', since: 'May 2008', url: 'https://aes-edu.org/' },
  { name: 'Center for Applied Research, Evaluation & Education, Inc.', since: 'March 1987', url: 'https://www.iescaree.com/' },
  { name: 'Center for Educational Documentation', since: 'June 2026', url: 'https://cedevaluations.com/' },
  { name: 'Educational Credential Evaluators, Inc.', since: 'March 1987', url: 'https://www.ece.org/' },
  { name: 'Educational Perspectives, nfp', since: 'April 2003', url: 'https://www.edperspective.org/' },
  { name: 'Educational Records Evaluation Service, Inc.', since: 'April 1993', url: 'http://www.eres.com/' },
  { name: 'Foreign Academic Credential Service, Inc.', since: 'March 1987', url: 'https://facsusa.com/' },
  { name: 'Foundation for International Services, Inc.', since: 'March 1987', url: 'https://www.fis-web.com/' },
  { name: 'Global Credential Evaluators, Inc.', since: 'March 2004', url: 'https://gceus.com/' },
  { name: 'Globe Language Services', since: 'May 2022', url: 'https://www.globelanguage.com/' },
  { name: 'Institute of Foreign Credential Services, Inc.', since: 'May 2022', url: 'https://ifcsevals.com/' },
  { name: 'International Consultants of Delaware, Inc.', since: 'March 1987', url: 'https://www.icdeval.com/' },
  { name: 'International Education Evaluations, Inc.', since: 'May 2018', url: 'https://www.myiee.org/' },
  { name: 'International Education Research Foundation, Inc.', since: 'March 1987', url: 'https://ierf.org/' },
  { name: 'Josef Silny and Associates, Inc. International Education Consultants', since: 'April 1989', url: 'http://www.jsilny.com/' },
  { name: 'SpanTran: The Evaluation Company', since: 'April 1996', url: 'https://evalcompany.com/' },
  { name: 'Transcript Research', since: 'September 2011', url: 'https://transcriptresearch.com/' },
  { name: 'World Education Services, Inc.', since: 'March 1987', url: 'https://www.wes.org/' },
];

function getSignedInUser(): { username: string; email: string } {
  const username = localStorage.getItem(STORAGE_KEY) || '';
  let email = '';
  try {
    const u = getUsers().find((x) => x.username.toLowerCase() === username.toLowerCase());
    email = u?.email || '';
  } catch { /* store unreadable — draft still works without email */ }
  if (!email) email = localStorage.getItem('ge_email') || '';
  return { username, email };
}

function buildAgencyDraft(agency: string, result: EvalResult, user: { username: string; email: string }) {
  const subject = `Credential Evaluation Inquiry — ${result.degree} in ${result.field} (${result.country})`;
  const body = [
    `Dear ${agency} Evaluation Team,`,
    '',
    `My name is ${user.username}. I earned a ${result.degree} in ${result.field} from ${result.institution} in ${result.country}, and I am seeking a course-by-course credential evaluation${result.purpose ? ` for ${result.purpose.toLowerCase()}` : ''} in the United States.`,
    '',
    'Could you please advise me on:',
    '• The documents required from my institution and country',
    '• Your current fees and processing times',
    '• Whether my documents must be sent directly by my institution',
    '• Any translation requirements for my transcripts',
    '',
    `You can reach me at this email address${user.email ? ` (${user.email})` : ''}.`,
    '',
    'Thank you for your time and assistance.',
    '',
    'Sincerely,',
    user.username,
  ].join('\n');
  return { subject, body };
}

function AgencyOutreach({ result }: { result: EvalResult }) {
  const { lang, t } = useLang();
  const [copied, setCopied] = useState<string | null>(null);
  const user = getSignedInUser();
  const [contacted, setContacted] = useState<Record<string, string>>(() => loadContacted(user.username));

  // Restore checkmarks from the central database (best-effort). Server entries
  // fill in agencies not marked locally; local marks always win, so offline
  // behavior is unchanged. If the merge added anything, persist and push back.
  useEffect(() => {
    if (!user.username) return;
    let cancelled = false;
    void apiFetchContacted(user.username).then((remote) => {
      if (cancelled || !remote) return;
      setContacted((prev) => {
        const merged = mergeContacted(remote, prev);
        if (merged === null) return prev;
        try { localStorage.setItem(contactedStorageKey(user.username), JSON.stringify(merged)); } catch { /* storage full/unavailable */ }
        void apiSaveContacted(user.username, merged);
        return merged;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.username]);

  function toggleContacted(agencyName: string) {
    setContacted((prev) => {
      const next = { ...prev };
      const removals: string[] = [];
      if (next[agencyName]) {
        delete next[agencyName];
        // Tell the server to remove this key explicitly, so the union merge
        // on the server side doesn't keep it from a stale entry.
        removals.push(agencyName);
      } else {
        next[agencyName] = new Date().toISOString().slice(0, 10);
      }
      try { localStorage.setItem(contactedStorageKey(user.username), JSON.stringify(next)); } catch { /* storage full/unavailable */ }
      if (user.username) void apiSaveContacted(user.username, next, removals);
      return next;
    });
  }

  function formatContactedDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function copyDraft(agencyName: string) {
    const { subject, body } = buildAgencyDraft(agencyName, result, user);
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(agencyName);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-slate-800/80">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-indigo-400">✉️</span>
        <h4 className="text-white font-bold text-xs uppercase tracking-wider">{t('agencyTitle')}</h4>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-4">
        {t('agencyDescPre')}{user.email ? <> {t('agencyDescEmail')} (<span className="text-slate-300 font-mono">{user.email}</span>)</> : ''}{t('agencyDescSuf')}
      </p>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {NACES_AGENCIES.map((agency) => {
          const contactedDate = contacted[agency.name];
          const slug = agency.name.slice(0, 12).toLowerCase().replace(/[^a-z]+/g, '-');
          return (
            <div key={agency.name} className={`flex items-center gap-3 p-3 rounded-xl border ${contactedDate ? 'bg-emerald-950/40 border-emerald-700/40' : 'bg-slate-900/70 border-slate-800/70'}`} data-testid={`agency-${slug}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-semibold truncate">{agency.name}</p>
                <p className="text-[10px] text-slate-500">{t('agencyMemberSince')} {agency.since}</p>
                {contactedDate && (
                  <p className="text-[10px] text-emerald-400 font-semibold" data-testid={`agency-contacted-date-${slug}`}>{t('agencyContacted')} · {formatContactedDate(contactedDate)}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => toggleContacted(agency.name)}
                  title={contactedDate ? t('agencyContacted') : t('agencyMark')}
                  aria-pressed={!!contactedDate}
                  data-testid={`agency-toggle-contacted-${slug}`}
                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${contactedDate ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}`}
                >
                  {contactedDate ? t('agencyContacted') : t('agencyMark')}
                </button>
                <button type="button" onClick={() => copyDraft(agency.name)} title="Copy pre-written email draft" className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors cursor-pointer">{t('agencyDraft')}</button>
                <button type="button" onClick={() => copyDraft(agency.name)} title="Copy email draft" className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white transition-colors cursor-pointer">
                  {copied === agency.name ? t('agencyCopied') : t('agencyCopy')}
                </button>
                <a href={agency.url} target="_blank" rel="noopener noreferrer" title="Visit agency website" className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white transition-colors">{t('agencySite')}</a>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
        {t('agencyTip')}
      </p>
    </div>
  );
}

function EvaluatorView() {
  const { lang, t } = useLang();
  // Prefill from what the user already told us (sign-up questions or a
  // previous evaluation) — never ask the same question twice.
  const saved = useMemo<EvalProfile>(() => {
    try { return JSON.parse(localStorage.getItem('ge_profile') || 'null') || {}; } catch { return {}; }
  }, []);
  const [country, setCountry] = useState(saved.country || '');
  const [institution, setInstitution] = useState(saved.institution || '');
  const [degree, setDegree] = useState(saved.degree || '');
  const [field, setField] = useState(saved.field || '');
  const [credits, setCredits] = useState('');
  const [purpose, setPurpose] = useState(saved.purpose || '');
  // Evidence is ephemeral and must be checked again after a reload; never
  // reconstruct a verified-looking report from saved self-reported inputs.
  const [result, setResult] = useState<EvalResult | null>(null);
  const [institutionVerification, setInstitutionVerification] = useState<InstitutionVerificationResult | null>(null);
  const [continueUnverified, setContinueUnverified] = useState(false);
  const [countryErr, setCountryErr] = useState('');
  const evalUser = getSignedInUser();
  const roadmapStepsKey = `ge_roadmap_steps_${evalUser.username.toLowerCase() || 'anon'}`;
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(roadmapStepsKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) return [Boolean(parsed[0]), Boolean(parsed[1]), Boolean(parsed[2]), Boolean(parsed[3])];
    } catch { /* corrupted — start fresh */ }
    return [false, false, false, false];
  });
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Restore roadmap step checkmarks from the central database (best-effort).
  // Server entries fill in steps not checked locally; local marks always win.
  // If the merge added anything, persist locally and push back.
  useEffect(() => {
    if (!evalUser.username) return;
    let cancelled = false;
    void apiFetchRoadmapSteps(evalUser.username).then((remote) => {
      if (cancelled || !Array.isArray(remote) || remote.length === 0) return;
      setCheckedSteps((prev) => {
        const merged: boolean[] = prev.map((local, i) => local || Boolean(remote[i]));
        const anyNew = merged.some((v, i) => v && !prev[i]);
        if (!anyNew) return prev;
        try { localStorage.setItem(roadmapStepsKey, JSON.stringify(merged)); } catch { /* storage full/unavailable */ }
        void apiSaveRoadmapSteps(evalUser.username, merged);
        return merged;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalUser.username]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCountry(country)) {
      setCountryErr(t('errCountry'));
      return;
    }
    if ((!institutionVerification?.selected || institutionVerification.status !== 'verified') && !continueUnverified) return;
    setCountryErr('');
    // Store only raw inputs — derived strings (usLevel, insight, roadmap) are computed
    // at render time from the active language, so toggling language after submission
    // always shows text in the current locale without re-submitting the form.
    setResult({ country, institution, degree, field, purpose });
    const resetSteps: boolean[] = [false, false, false, false];
    setCheckedSteps(resetSteps);
    setExpandedStep(null);
    setDownloaded(false);
    // Persist evaluation details so the admin board can show school/country/intention.
    const profile = { country, institution, degree, field, purpose };
    try { localStorage.setItem('ge_profile', JSON.stringify(profile)); } catch { /* storage full/blocked */ }
    const username = localStorage.getItem(STORAGE_KEY);
    if (username) void apiSaveProfile(username, profile);
    // Reset roadmap steps on new evaluation (new inputs = fresh progress)
    try { localStorage.setItem(roadmapStepsKey, JSON.stringify(resetSteps)); } catch { /* storage full/blocked */ }
    if (username) void apiSaveRoadmapSteps(username, resetSteps);
    if (window.innerWidth < 1024) {
      setTimeout(() => { document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    }
  }

  function toggleStep(i: number) {
    const next = !checkedSteps[i];
    setCheckedSteps((prev) => {
      const updated = prev.map((v, idx) => (idx === i ? next : v));
      try { localStorage.setItem(roadmapStepsKey, JSON.stringify(updated)); } catch { /* storage full/unavailable */ }
      if (evalUser.username) void apiSaveRoadmapSteps(evalUser.username, updated);
      return updated;
    });
    setExpandedStep(next ? i : (expandedStep === i ? null : expandedStep));
  }

  return (
    <div>
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 mb-6 shadow-sm">
          <span className="text-indigo-400 font-semibold">{t('evalBadge')}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.1]">
          {t('evalH1')}{' '}
          <span className="bg-gradient-to-r from-blue-400 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">{t('evalH2')}</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-normal leading-relaxed">
          {t('evalSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Input Card */}
        <section className="lg:col-span-5">
          <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg tracking-tight">{t('evalFormTitle')}</h2>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">{t('evalFormStep')}</span>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5" data-testid="form-eval">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLCountry')}</label>
                <CountryPicker value={country} onChange={(v) => { setCountry(v); setInstitutionVerification(null); setContinueUnverified(false); setResult(null); if (countryErr) setCountryErr(''); }} data-testid="input-country" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder={t('evalPCountry')} required />
                {countryErr && <p className="mt-1.5 text-red-400 text-xs font-medium" data-testid="error-country">{countryErr}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLInstitution')}</label>
                <input value={institution} onChange={(e) => { setInstitution(e.target.value); setInstitutionVerification(null); setContinueUnverified(false); setResult(null); }} data-testid="input-institution" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder={t('evalPInstitution')} required />
                <InstitutionVerification
                  name={institution}
                  country={country}
                  lang={lang}
                  onChange={(value) => { setInstitutionVerification(value); if (value) setContinueUnverified(false); }}
                  onContinueUnverified={() => { setInstitutionVerification(null); setContinueUnverified(true); }}
                />
                {continueUnverified && <p role="status" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs font-semibold text-amber-200">{lang === 'es' ? 'Continuará con una institución no verificada. El informe mantendrá esta advertencia.' : 'You will continue with an unverified institution. The report will retain this warning.'}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLDegree')}</label>
                  <input value={degree} onChange={(e) => setDegree(e.target.value)} data-testid="input-degree" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder={t('evalPDegree')} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLField')}</label>
                  <input value={field} onChange={(e) => setField(e.target.value)} data-testid="input-field" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder={t('evalPField')} required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLCredits')} <span className="text-slate-500 font-normal">{t('evalLCreditsOpt')}</span></label>
                  <input value={credits} onChange={(e) => setCredits(e.target.value)} data-testid="input-credits" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder={t('evalPCredits')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('evalLGoal')}</label>
                  <select value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="select-purpose" className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                    <option value="">{t('evalOptGoal')}</option>
                    <option value="University Admission">{t('evalGoal1')}</option>
                    <option value="Employment & HR">{t('evalGoal2')}</option>
                    <option value="Professional Licensing">{t('evalGoal3')}</option>
                    <option value="Immigration (USCIS)">{t('evalGoal4')}</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={!institutionVerification?.selected && !continueUnverified} data-testid="button-eval-submit" className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center space-x-2">
                <span>{t('evalBtn')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
              {!institutionVerification?.selected && !continueUnverified && <p className="text-center text-xs text-amber-300">{lang === 'es' ? 'Compruebe la institución primero. Si no hay evidencia, podrá continuar con una advertencia explícita.' : 'Check the institution first. If evidence is unavailable, you may then continue with an explicit warning.'}</p>}
            </form>
          </div>
        </section>

        {/* Results Column */}
        <section className="lg:col-span-7" id="results-section">
          {result && (institutionVerification || continueUnverified) ? (() => {
            // Derive all display strings from the current language at render time.
            // This ensures toggling EN↔ES after submission immediately re-renders in the new locale.
            const usLevel = getUsLevel(result.degree, result.institution, result.field, t);
            const insight = getInsight(result.field, t);
            const roadmap = getRoadmap(result.country, result.institution, result.field, result.purpose, t);
            return (
            <div className="space-y-6" data-testid="results-container">
              {continueUnverified && (
                <div role="alert" data-testid="report-unverified-warning" className="rounded-2xl border-2 border-amber-500/50 bg-amber-950/40 p-5 text-sm font-semibold text-amber-100">
                  {lang === 'es'
                    ? 'Institución no verificada: no se confirmó una coincidencia respaldada por fuentes. Esto no significa que la institución sea falsa. El expediente conserva esta incertidumbre para revisión profesional.'
                    : 'Unverified institution: no source-backed match was confirmed. This does not mean the institution is fake. The dossier preserves this uncertainty for professional review.'}
                </div>
              )}
              <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-indigo-500 relative overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {t('evalCrawlComplete')}
                  </span>
                  <span className="text-xs text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">REF-2026-US</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-white leading-snug mb-6" data-testid="text-summary">
                  {t('evalSummaryPre')} {usLevel}.
                  <span className="block mt-3 text-sm font-normal leading-relaxed text-slate-400">
                    {t('evalSummaryPost')}
                  </span>
                  <span className="block mt-2 text-xs font-normal leading-relaxed text-slate-500">
                    {result.institution} ({result.country}) · {result.field}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2.5 pt-4 border-t border-slate-800/80" data-testid="badges-container">
                  <span className="px-3.5 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-bold">🎓 {usLevel}</span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-bold">📚 {result.field}</span>
                  <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-800 text-xs font-bold">📍 {result.country}</span>
                  {result.purpose && <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-bold">🎯 {GOAL_TX_KEYS[result.purpose] ? t(GOAL_TX_KEYS[result.purpose]!) : result.purpose}</span>}
                </div>
              </div>

              <div className="glass-panel p-8 rounded-3xl" data-testid="insight-card">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-3 flex items-center">
                  <span className="text-indigo-400 mr-2 text-lg">📊</span> {t('evalInsightTitle')}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line" data-testid="text-insight">{insight}</p>
              </div>

              <div className="glass-panel p-8 rounded-3xl relative overflow-hidden" data-testid="roadmap-section">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center">
                    <span className="text-indigo-400 mr-2 text-lg">🛰️</span> {t('evalRoadmapTitle')}
                  </h3>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{t('evalRoadmapSynced')}</span>
                </div>
                <p className="text-xs text-slate-400 mb-6">{t('evalRoadmapDesc')}</p>

                {(() => {
                  const verifyContent = getVerifyContent(institutionVerification, result.institution, result.country, result.degree, t);
                  const courseworkContent = getCourseworkContent(result.field, result.field, t);
                  const prereqContent = getPrereqContent(result.field, result.purpose, t);

                  const steps = [
                    {
                      title: roadmap[0].title,
                      desc: roadmap[0].desc,
                      icon: '🔍',
                      content: (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400">{verifyContent.status}</span>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              {verifyContent.rows.map((row) => (
                                <tr key={row.label} className="border-b border-slate-800/60">
                                  <td className="py-2 pr-4 text-slate-400 font-semibold w-2/5">{row.label}</td>
                                  <td className="py-2 text-slate-200">{row.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                           {verifyContent.action && <a href={verifyContent.action.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                            {verifyContent.action.label} →
                           </a>}
                        </div>
                      ),
                    },
                    {
                      title: roadmap[1].title,
                      desc: roadmap[1].desc,
                      icon: '📐',
                      content: (
                        <div className="mt-4">
                          <p className="text-xs text-slate-400 mb-3">{courseworkContent.totalSCU}</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-700">
                                <th className="text-left py-2 pr-3 text-slate-400 font-semibold">{t('cwColSubject')}</th>
                                <th className="text-left py-2 pr-3 text-indigo-400 font-semibold">{t('cwColSCU')}</th>
                                <th className="text-left py-2 text-slate-400 font-semibold hidden sm:table-cell">{t('cwColNotes')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {courseworkContent.rows.map((row) => (
                                <tr key={row.regional} className="border-b border-slate-800/60">
                                  <td className="py-2 pr-3 text-slate-200">{row.regional}</td>
                                  <td className="py-2 pr-3 font-bold text-indigo-300">{row.usSCU}</td>
                                  <td className="py-2 text-slate-500 hidden sm:table-cell">{row.notes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <a href="https://www.naces.org/members" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                            {t('cwNACESLink')}
                          </a>
                          <AgencyOutreach result={result} />
                        </div>
                      ),
                    },
                    {
                      title: roadmap[2].title,
                      desc: roadmap[2].desc,
                      icon: '⚖️',
                      content: (
                        <div className="mt-4 space-y-2">
                          {prereqContent.map((item) => (
                            <div key={item.label} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-slate-800/60">
                              <span className="text-xs font-semibold text-slate-400 w-full sm:w-2/5 flex-shrink-0">{item.label}</span>
                              <span className="text-xs text-slate-200 flex-1">
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{item.value} →</a>
                                ) : item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      ),
                    },
                    {
                      title: roadmap[3].title,
                      desc: roadmap[3].desc,
                      icon: '📦',
                      content: (
                        <div className="mt-4">
                          <p className="text-xs text-slate-300 leading-relaxed mb-4">
                            {t('dossierDesc')}
                          </p>
                          <div className="grid grid-cols-2 gap-2 mb-5">
                            {(['dossierItem1', 'dossierItem2', 'dossierItem3', 'dossierItem4', 'dossierItem5', 'dossierItem6'] as const).map((key) => (
                              <div key={key} className="flex items-center gap-2 text-xs text-slate-300">
                                <span className="text-emerald-400 flex-shrink-0">✓</span> {t(key)}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => { exportDossier(result, getUsLevel(result.degree, result.institution, result.field, t), verifyContent.rows, prereqContent, lang, t); setDownloaded(true); }}
                            data-testid="button-export-dossier"
                            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                          >
                            {downloaded ? (
                              <><span>{t('dossierDownloaded')}</span></>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span>{t('dossierDownload')}</span>
                              </>
                            )}
                          </button>
                          {downloaded && <p className="text-xs text-slate-400 text-center mt-2">{t('dossierOpenNote')}</p>}
                        </div>
                      ),
                    },
                  ];

                  return (
                    <div className="space-y-3">
                      {steps.map((step, idx) => (
                        <div key={idx} data-testid={`roadmap-step-${idx}`} className={`rounded-2xl border transition-all ${checkedSteps[idx] ? 'bg-indigo-500/5 border-indigo-500/40' : 'bg-slate-900/70 border-slate-800/80'}`}>
                          <button
                            type="button"
                            onClick={() => toggleStep(idx)}
                            className="w-full flex items-start gap-3.5 p-4 text-left cursor-pointer"
                          >
                            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${checkedSteps[idx] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-transparent'}`}>
                              {checkedSteps[idx] && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm">{step.icon}</span>
                                <strong className={`text-xs md:text-sm font-bold transition-colors ${checkedSteps[idx] ? 'text-indigo-300' : 'text-white'}`}>{idx + 1}. {step.title}</strong>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                            </div>
                            <svg className={`w-4 h-4 text-slate-500 flex-shrink-0 mt-1 transition-transform ${checkedSteps[idx] ? 'rotate-180 text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {checkedSteps[idx] && (
                            <div className="px-4 pb-5 border-t border-indigo-500/20">
                              {step.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ); })() : (
            <div className="glass-panel p-16 text-center rounded-3xl flex flex-col items-center justify-center min-h-[500px] border-dashed border-2 border-slate-800/80" data-testid="placeholder-state">
              <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center text-3xl text-indigo-400 mb-6 shadow-xl scraper-pulse">🛰️</div>
              <h3 className="font-bold text-white text-xl mb-2">{t('evalEmptyTitle')}</h3>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">{t('evalEmptyDesc')}</p>
            </div>
          )}
        </section>
      </div>

      {result && result.purpose === 'University Admission' && (
        <SchoolFinder 
          username={getSignedInUser().username || null}
          profile={{
            country: result.country,
            institution: result.institution,
            degree: result.degree,
            field: result.field,
            purpose: result.purpose
          }}
          t={t}
        />
      )}

      <ContactSection />
      <JobBoardsSection field={result?.field} />
    </div>
  );
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
    <main className="relative z-10 max-w-md mx-auto px-6 pt-24 pb-32 flex-grow w-full">
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
    <main className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24 flex-grow w-full">
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
    if (saved) { setUsername(saved); setAppView('app'); }

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
      <div className="bg-slate-950 text-slate-100 min-h-screen font-sans relative overflow-x-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
        <div className="glow-effect -top-40 -left-40 rounded-full" />
        <div className="glow-effect top-1/3 -right-40 rounded-full" />

        <Navbar appView={appView} username={username} onLogout={handleLogout} />

        <Switch>
          <Route path="/about">
            <AboutPage />
          </Route>
          <Route path="/how-it-works">
            <HowItWorksPage />
          </Route>
          <Route path="/admin">
            <AdminGate />
          </Route>
          <Route>
            <main className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 flex-grow w-full">
              {appView === 'auth' ? <AuthView onLogin={handleLogin} storageError={userStoreError} /> : <EvaluatorView />}
            </main>
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
