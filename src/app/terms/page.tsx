import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Rally Live",
  description:
    "Terms of Service for Rally Live, the live streaming and battle platform. Read our terms governing use of rallylive.ca.",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-text-secondary hover:text-text transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="mb-2 text-4xl font-bold text-text">Terms of Service</h1>
        <p className="mb-10 text-sm text-text-secondary">
          Effective Date: February 1, 2026
        </p>

        <div className="space-y-10 text-text-secondary leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              1. Acceptance of Terms
            </h2>
            <p>
              Welcome to Rally Live (&ldquo;Rally Live,&rdquo; &ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using our
              website at{" "}
              <a
                href="https://rallylive.ca"
                className="underline hover:text-text"
              >
                rallylive.ca
              </a>{" "}
              (the &ldquo;Platform&rdquo;), including all associated services,
              features, content, and applications, you agree to be bound by these
              Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to
              these Terms, you must not access or use the Platform.
            </p>
            <p className="mt-3">
              We reserve the right to modify these Terms at any time. We will
              notify you of material changes by posting the updated Terms on the
              Platform with a revised effective date. Your continued use of the
              Platform after such changes constitutes acceptance of the updated
              Terms.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              2. Eligibility
            </h2>
            <p>
              You must be at least 13 years of age to use Rally Live. If you are
              between 13 and 18 years of age (or the age of majority in your
              jurisdiction), you may only use the Platform with the consent and
              supervision of a parent or legal guardian who agrees to be bound by
              these Terms.
            </p>
            <p className="mt-3">
              By creating an account, you represent and warrant that you meet the
              eligibility requirements stated above, and that all registration
              information you provide is truthful and accurate.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              3. Account Registration and Responsibilities
            </h2>
            <p>
              To access certain features of the Platform, you must create an
              account. You may register using an email address and password or
              through a third-party authentication provider such as Google OAuth.
            </p>
            <p className="mt-3">You agree to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Provide accurate, current, and complete information during
                registration;
              </li>
              <li>
                Maintain and promptly update your account information to keep it
                accurate;
              </li>
              <li>
                Maintain the security and confidentiality of your login
                credentials;
              </li>
              <li>
                Accept responsibility for all activity that occurs under your
                account;
              </li>
              <li>
                Immediately notify us at{" "}
                <a
                  href="mailto:support@rallylive.ca"
                  className="underline hover:text-text"
                >
                  support@rallylive.ca
                </a>{" "}
                if you suspect unauthorized use of your account.
              </li>
            </ul>
            <p className="mt-3">
              You may not transfer, sell, or assign your account to any other
              person. We reserve the right to suspend or terminate accounts that
              violate these Terms.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              4. Platform Features and Services
            </h2>
            <p>Rally Live provides the following features and services:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Live Streaming:</strong> Users may
                broadcast live video content to other users on the Platform.
              </li>
              <li>
                <strong className="text-text">Video Uploads:</strong> Users may
                upload, publish, and share pre-recorded video content.
              </li>
              <li>
                <strong className="text-text">Battles:</strong> Interactive
                competitive formats including Timer Wars and Tower Wars, where
                creators compete in real-time battle rooms.
              </li>
              <li>
                <strong className="text-text">Messaging:</strong> Direct and
                group messaging between users.
              </li>
              <li>
                <strong className="text-text">
                  Creator Services Marketplace:
                </strong>{" "}
                A marketplace where creators may offer and purchase services from
                other creators.
              </li>
              <li>
                <strong className="text-text">Credits and Wallet System:</strong>{" "}
                An in-platform virtual currency system used for donations, tips,
                and transactions.
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              5. User Content
            </h2>
            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              5.1 Ownership
            </h3>
            <p>
              You retain ownership of the content you create and upload to Rally
              Live (&ldquo;User Content&rdquo;), including live streams, videos,
              comments, messages, and profile information.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              5.2 License Grant
            </h3>
            <p>
              By submitting User Content to the Platform, you grant Rally Live a
              worldwide, non-exclusive, royalty-free, sublicensable, and
              transferable license to use, reproduce, distribute, prepare
              derivative works of, display, and perform your User Content in
              connection with the Platform and Rally Live&apos;s business
              operations, including for the purpose of promoting and
              redistributing part or all of the Platform.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              5.3 Representations
            </h3>
            <p>You represent and warrant that:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                You own or have the necessary rights and permissions to submit
                your User Content;
              </li>
              <li>
                Your User Content does not infringe upon the intellectual
                property, privacy, or other rights of any third party;
              </li>
              <li>
                Your User Content complies with these Terms and all applicable
                laws and regulations.
              </li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              6. Prohibited Conduct
            </h2>
            <p>You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Use the Platform for any unlawful purpose or in violation of any
                applicable law or regulation;
              </li>
              <li>
                Upload, stream, or distribute content that is defamatory,
                obscene, pornographic, abusive, threatening, or otherwise
                objectionable;
              </li>
              <li>
                Harass, bully, intimidate, stalk, or threaten any other user;
              </li>
              <li>
                Impersonate any person or entity, or falsely represent your
                affiliation with any person or entity;
              </li>
              <li>
                Engage in any activity that interferes with or disrupts the
                Platform or its servers and networks;
              </li>
              <li>
                Use bots, scrapers, or other automated means to access the
                Platform without our prior written consent;
              </li>
              <li>
                Attempt to gain unauthorized access to any accounts, systems, or
                networks connected to the Platform;
              </li>
              <li>
                Manipulate the credits or wallet system, including through
                fraudulent transactions, chargebacks, or exploitation of bugs;
              </li>
              <li>
                Circumvent or disable any security or access control features of
                the Platform;
              </li>
              <li>
                Collect or harvest personal information of other users without
                their consent;
              </li>
              <li>
                Promote or facilitate any form of illegal activity, including but
                not limited to drug trafficking, fraud, or money laundering.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              7. Monetization and Revenue Sharing
            </h2>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              7.1 Credits System
            </h3>
            <p>
              Rally Live operates a virtual credits system. Users may purchase
              credits using real currency through supported payment processors.
              Credits may be used to send donations and tips to creators, purchase
              creator services, and participate in platform features. Credits have
              no cash value outside the Platform and are non-refundable except as
              required by applicable law.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              7.2 Donations and Tips
            </h3>
            <p>
              Users may send credits as donations or tips to creators during live
              streams, on videos, and through the creator services marketplace.
              Donations are voluntary and non-refundable. Rally Live retains a
              platform fee from each transaction as disclosed at the time of
              purchase.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              7.3 Ad Revenue Sharing
            </h3>
            <p>
              Eligible creators may participate in Rally Live&apos;s ad revenue
              sharing program. Revenue share percentages are determined by
              follower-based tiers as follows:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Tier 1 (Starting):</strong> 10% of
                ad revenue generated on your content
              </li>
              <li>
                <strong className="text-text">Tier 2 (Growing):</strong> 30% of
                ad revenue
              </li>
              <li>
                <strong className="text-text">Tier 3 (Established):</strong> 50%
                of ad revenue
              </li>
              <li>
                <strong className="text-text">Tier 4 (Partner):</strong> 70% of
                ad revenue
              </li>
              <li>
                <strong className="text-text">Tier 5 (Elite):</strong> 80% of ad
                revenue
              </li>
            </ul>
            <p className="mt-3">
              Tier thresholds, revenue share percentages, and program
              requirements are subject to change at Rally Live&apos;s discretion.
              Updated terms will be communicated to participating creators in
              advance.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              7.4 Payouts
            </h3>
            <p>
              Creators may request payouts of earned revenue once they meet the
              minimum payout threshold. Payouts are processed through third-party
              payment processors such as Stripe or PayPal. Rally Live is not
              responsible for fees charged by payment processors. You are solely
              responsible for reporting and paying any taxes owed on income earned
              through the Platform.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              8. Intellectual Property
            </h2>
            <p>
              The Platform and its original content (excluding User Content),
              features, and functionality are and will remain the exclusive
              property of Rally Live and its licensors. The Platform is protected
              by copyright, trademark, and other intellectual property laws of
              Canada and foreign jurisdictions.
            </p>
            <p className="mt-3">
              The Rally Live name, logo, and all related names, logos, product
              and service names, designs, and slogans are trademarks of Rally
              Live. You may not use such marks without our prior written
              permission.
            </p>
            <p className="mt-3">
              If you believe that your intellectual property rights have been
              infringed upon by content on the Platform, please contact us at{" "}
              <a
                href="mailto:support@rallylive.ca"
                className="underline hover:text-text"
              >
                support@rallylive.ca
              </a>{" "}
              with a detailed description of the alleged infringement.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              9. Termination
            </h2>
            <p>
              We may suspend or terminate your account and access to the Platform
              at our sole discretion, without prior notice or liability, for any
              reason, including but not limited to a breach of these Terms.
            </p>
            <p className="mt-3">
              You may terminate your account at any time by contacting us at{" "}
              <a
                href="mailto:support@rallylive.ca"
                className="underline hover:text-text"
              >
                support@rallylive.ca
              </a>{" "}
              or through your account settings. Upon termination, your right to
              use the Platform will immediately cease. Any credits remaining in
              your wallet at the time of termination are forfeited unless a payout
              has been requested and approved prior to termination.
            </p>
            <p className="mt-3">
              Sections of these Terms that by their nature should survive
              termination will survive, including but not limited to ownership
              provisions, warranty disclaimers, indemnity, and limitations of
              liability.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              10. Disclaimers
            </h2>
            <p>
              THE PLATFORM IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS
              AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              NON-INFRINGEMENT, AND COURSE OF DEALING.
            </p>
            <p className="mt-3">
              Rally Live does not warrant that the Platform will be
              uninterrupted, timely, secure, or error-free. We do not warrant the
              accuracy, reliability, or completeness of any content on the
              Platform, including User Content. We are not responsible for any
              damage or loss resulting from your use of or reliance on any content
              or services available through the Platform.
            </p>
            <p className="mt-3">
              Rally Live does not endorse, verify, or assume responsibility for
              any User Content, creator services, or transactions between users.
              Any interactions, transactions, or disputes between users are solely
              between those users.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              11. Limitation of Liability
            </h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
              SHALL RALLY LIVE, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS,
              SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT
              LIMITATION LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER
              INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Your access to or use of (or inability to access or use) the Platform;</li>
              <li>Any conduct or content of any third party on the Platform;</li>
              <li>Any User Content obtained from the Platform;</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content;</li>
              <li>Any transactions conducted through the credits or wallet system;</li>
              <li>Any loss or damage arising from battles, competitions, or interactive features.</li>
            </ul>
            <p className="mt-3">
              IN NO EVENT SHALL RALLY LIVE&apos;S TOTAL AGGREGATE LIABILITY TO
              YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE PLATFORM EXCEED
              THE GREATER OF (A) THE AMOUNT YOU HAVE PAID TO RALLY LIVE IN THE
              TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED CANADIAN
              DOLLARS (CAD $100.00).
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              12. Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless Rally Live and
              its officers, directors, employees, agents, and affiliates from and
              against any and all claims, liabilities, damages, losses, costs, and
              expenses (including reasonable attorneys&apos; fees) arising out of
              or related to: (a) your use of the Platform; (b) your User Content;
              (c) your violation of these Terms; (d) your violation of any rights
              of another party; or (e) your conduct in connection with the
              Platform.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              13. Governing Law and Dispute Resolution
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of Canada and the province in which Rally Live operates,
              without regard to conflict of law principles.
            </p>
            <p className="mt-3">
              Any dispute arising out of or relating to these Terms or the
              Platform shall first be attempted to be resolved through good-faith
              negotiation. If the dispute cannot be resolved within thirty (30)
              days of written notice, either party may submit the dispute to
              binding arbitration in accordance with Canadian arbitration rules, or
              pursue the matter in the courts of competent jurisdiction in Canada.
            </p>
            <p className="mt-3">
              You agree that any claims or causes of action arising out of or
              related to the Platform or these Terms must be filed within one (1)
              year after such claim or cause of action arose, or be forever
              barred.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              14. Severability
            </h2>
            <p>
              If any provision of these Terms is held to be invalid, illegal, or
              unenforceable, the remaining provisions shall continue in full force
              and effect. The invalid or unenforceable provision shall be modified
              to the minimum extent necessary to make it valid and enforceable
              while preserving its original intent.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              15. Entire Agreement
            </h2>
            <p>
              These Terms, together with our{" "}
              <Link href="/privacy" className="underline hover:text-text">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/community" className="underline hover:text-text">
                Community Guidelines
              </Link>
              , constitute the entire agreement between you and Rally Live
              regarding your use of the Platform, and supersede all prior
              agreements, understandings, and communications, whether written or
              oral.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              16. Contact Information
            </h2>
            <p>
              If you have any questions or concerns about these Terms of Service,
              please contact us at:
            </p>
            <div className="mt-3">
              <p>
                <strong className="text-text">Rally Live</strong>
              </p>
              <p>
                Email:{" "}
                <a
                  href="mailto:support@rallylive.ca"
                  className="underline hover:text-text"
                >
                  support@rallylive.ca
                </a>
              </p>
              <p>
                Website:{" "}
                <a
                  href="https://rallylive.ca"
                  className="underline hover:text-text"
                >
                  rallylive.ca
                </a>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-16 border-t border-white/10 pt-6 text-center text-sm text-text-secondary">
          <p>&copy; 2026 Rally Live. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
