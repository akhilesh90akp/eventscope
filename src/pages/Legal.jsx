/**
 * Legal — Terms of Service, Privacy Policy, and "How we protect your data"
 *
 * Public pages (no sign-in needed), reachable at #/terms, #/privacy and
 * #/data-protection from the login screen, sign-up and Settings.
 * Written in plain language as a starting draft — have them reviewed by a
 * lawyer before onboarding paying customers. Business details come from
 * src/constants/legal.js.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect } from 'react';
import { LEGAL } from '../constants/legal';

// ============================================================
// CONSTANTS
// ============================================================

/** Short names for the business details used throughout the text */
const { productName: N, businessName: B, contactEmail: E, jurisdiction: J, dataRegion: R } = LEGAL;

// ============================================================
// SUB-COMPONENTS
// ============================================================
const H = ({ children }) => <h2 className="text-lg font-bold text-gray-900 mt-8 mb-2">{children}</h2>;
const P = ({ children }) => <p className="text-[15px] leading-relaxed text-gray-700 mb-3">{children}</p>;
const UL = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed text-gray-700 mb-3">
    {items.map((t, i) => <li key={i}>{t}</li>)}
  </ul>
);

// ============================================================
// CONTENT — one component per page
// ============================================================

function Terms() {
  return (
    <>
      <P>These terms are an agreement between your business (“you”) and {B} (“we”), which provides {N}. By creating an account or using {N}, you agree to them.</P>
      <H>1. What {N} is</H>
      <P>{N} is an online tool for event businesses to prepare quotations and bills, track events, and record costs and profit. We provide it “as is” and keep improving it.</P>
      <H>2. Your account and team</H>
      <UL items={[
        'The person who creates the company account is its owner and is responsible for who they add to the team.',
        'Sign-in is with Google. Keep your Google account secure — anyone who can sign in as you can use your company’s data.',
        'Owners can add and remove staff at any time. Removed staff lose access immediately.',
      ]} />
      <H>3. Your data belongs to you</H>
      <UL items={[
        'Everything your business enters — clients, events, quotations, bills, costs — belongs to you. We don’t claim ownership of it.',
        'We use it only to run the service for you. We never sell it and never show you ads.',
        'You can download your Job Log as Excel at any time, and ask us for a full copy of your data.',
        'You are responsible for having the right to store your clients’ details (for example, collecting them for their event).',
      ]} />
      <H>4. Plans and payment</H>
      <UL items={[
        'New accounts start on a free pilot. We’ll tell you clearly before anything becomes paid.',
        'Paid plans are monthly. Prices are shown on our pricing page in INR, plus GST where applicable.',
        'You can cancel any time; you keep access until the end of the period you’ve paid for. We don’t refund part-months.',
      ]} />
      <H>5. Acceptable use</H>
      <P>Don’t use {N} for anything illegal, try to access another company’s data, disrupt the service, or resell it without our written permission.</P>
      <H>6. Suspension and closing an account</H>
      <UL items={[
        'If payment is overdue or these terms are seriously broken, we may suspend your account. A suspended account can still view its data but can’t make changes. We’ll tell you why and how to fix it.',
        'If you close your account, you’ll have 30 days to export your data. After that we delete it, except anything we must keep by law.',
      ]} />
      <H>7. Our responsibility</H>
      <P>We work hard to keep {N} available and your data safe, but we can’t promise it will never be interrupted. Always check quotations and bills before sending them. As far as the law allows, our total liability to you is limited to the fees you paid us in the 3 months before the problem.</P>
      <H>8. Changes</H>
      <P>We may update these terms. For important changes we’ll tell you in the app or by email at least 15 days before they apply.</P>
      <H>9. Law and contact</H>
      <P>These terms are governed by the laws of India, and the courts of {J} have jurisdiction. Questions: {E}.</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <P>This policy explains what {B} collects when you use {N}, why, and your choices. We follow India’s Digital Personal Data Protection Act, 2023.</P>
      <H>What we collect</H>
      <UL items={[
        'Your sign-in details from Google: name, email address and profile photo.',
        'A backup email and phone number, if you give them at sign-up — used only to verify it’s you if you lose access to your Google account, and to contact you about your account.',
        'Your company details that you enter: business name, address, GSTIN/PAN, phone, bank details for invoices, logo.',
        'Your business records: clients, events, quotations, bills, costs and income.',
        'Basic technical information needed to run the app (for example, error logs).',
      ]} />
      <H>Your clients’ details</H>
      <P>When you store your clients’ names and phone numbers in {N}, you decide what to collect and why — we only store and process them on your behalf, to run the service for you. We don’t contact your clients or use their details for anything else.</P>
      <H>How we use it</H>
      <UL items={[
        'To provide the service: sign-in, saving your data, generating quotations, bills and reports.',
        'To support you when you ask for help.',
        'To send important account messages (for example, changes to these policies).',
      ]} />
      <P>We do not sell your data, share it with advertisers, or show ads.</P>
      <H>Who processes it</H>
      <UL items={[
        `Google Firebase (Google Cloud) stores your data and handles sign-in. Data is stored in ${R}.`,
        'GitHub Pages serves the app’s files (no business data is stored there).',
      ]} />
      <H>How long we keep it</H>
      <P>As long as your account is open. If you close it, we delete your data 30 days later, except anything we must keep by law.</P>
      <H>Your rights</H>
      <P>You can ask to see, correct, export or delete your personal data, or withdraw consent, by emailing {E}. We’ll respond within 30 days.</P>
      <H>Security</H>
      <P>See <a href="#/data-protection" className="text-violet-700 underline">How we protect your data</a>.</P>
      <H>Contact</H>
      <P>Privacy questions or complaints: {E}. {B}, {J}.</P>
    </>
  );
}

function DataProtection() {
  return (
    <>
      <P>Your quotations, bills, costs and profit figures are sensitive. Here, in plain words, is how {N} keeps them safe.</P>
      <H>Every company is walled off</H>
      <P>Each company’s data is kept in its own separate space. Every request is checked on our servers — not just in the app — so a login from one company can never read or change another company’s data, even if someone tampered with the app itself. We test these rules automatically every time we change them.</P>
      <H>Only your team gets in</H>
      <UL items={[
        'Sign-in is through Google, so we never see or store passwords.',
        'Only people the owner adds can join a company. An invite works only for the exact Google account it was sent to, and nobody joins until they choose to accept it.',
        'Owners can remove someone at any time; their access stops immediately.',
      ]} />
      <H>Owner and staff see different things</H>
      <P>Staff can work on events, quotations, bills and costs. Only the owner can change company settings, bank details and the team, and only the owner sees Reports and profit figures.</P>
      <H>Encrypted, in India</H>
      <P>Data is encrypted while travelling between your device and our servers, and while stored. It’s stored on Google Cloud in {R}.</P>
      <H>Your data stays yours</H>
      <UL items={[
        'We never sell your data or use it for advertising.',
        'Download your Job Log as Excel any time, or ask us for a full copy of everything.',
        'Close your account and we delete your data after 30 days.',
      ]} />
      <H>If something goes wrong</H>
      <P>If we ever discover a problem affecting your data, we’ll tell you promptly and explain what we’re doing about it. Questions: {E}.</P>
    </>
  );
}

// ============================================================
// PAGE TABLE
// ============================================================

/** #/<key> → page title + content component */
const PAGES = {
  terms: { title: 'Terms of Service', body: Terms },
  privacy: { title: 'Privacy Policy', body: Privacy },
  'data-protection': { title: 'How we protect your data', body: DataProtection },
};

// ============================================================
// Legal — MAIN COMPONENT
// ============================================================

export default function Legal({ page }) {
  const doc = PAGES[page] || PAGES.terms;
  const Body = doc.body;

  useEffect(() => { document.title = `${doc.title} — ${N}`; }, [doc.title]);

  return (
    <div className="min-h-[100dvh] bg-bb-bg">
      <header className="bg-bb-sidebar">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-4">
          <a href="#/"><img src={import.meta.env.BASE_URL + 'eventscope-logo-horizontal.svg'} alt={N} className="h-[18px]" /></a>
          <nav className="flex-1 flex justify-end gap-4 text-xs text-bb-sidebar-muted">
            {Object.entries(PAGES).map(([key, p]) => (
              <a key={key} href={`#/${key}`} className={key === page ? 'text-white font-semibold' : 'hover:text-white'}>{p.title.replace('How we protect your data', 'Data protection')}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">
        <article className="bg-white rounded-2xl border border-bb-border p-6 sm:p-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{doc.title}</h1>
          <p className="text-xs text-gray-500 mt-1 mb-6">Last updated {LEGAL.lastUpdated}</p>
          <Body />
        </article>
        <p className="text-center text-xs text-bb-muted mt-6"><a href="#/" className="underline">Back to {N}</a></p>
      </main>
    </div>
  );
}
