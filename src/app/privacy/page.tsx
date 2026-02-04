import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - Rally Live",
  description:
    "Privacy Policy for Rally Live. Learn how we collect, use, and protect your personal information on rallylive.ca.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-text-secondary hover:text-text transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="mb-2 text-4xl font-bold text-text">Privacy Policy</h1>
        <p className="mb-10 text-sm text-text-secondary">
          Effective Date: February 1, 2026
        </p>

        <div className="space-y-10 text-text-secondary leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              1. Introduction
            </h2>
            <p>
              Rally Live (&ldquo;Rally Live,&rdquo; &ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to
              protecting your privacy. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your personal information
              when you visit and use our platform at{" "}
              <a
                href="https://rallylive.ca"
                className="underline hover:text-text"
              >
                rallylive.ca
              </a>{" "}
              (the &ldquo;Platform&rdquo;), including our live streaming, video,
              battle, messaging, creator services, and credits features.
            </p>
            <p className="mt-3">
              By using Rally Live, you consent to the data practices described in
              this Privacy Policy. If you do not agree with this Privacy Policy,
              please do not use the Platform.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              2. Information We Collect
            </h2>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.1 Information You Provide
            </h3>
            <p>
              When you create an account or use the Platform, we may collect the
              following information directly from you:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Account Information:</strong>{" "}
                Email address, username, display name, password, and date of
                birth.
              </li>
              <li>
                <strong className="text-text">Profile Information:</strong>{" "}
                Profile picture, biography, social media links, and any other
                information you choose to add to your public profile.
              </li>
              <li>
                <strong className="text-text">Content:</strong> Videos, live
                streams, comments, messages, battle participation data, and
                creator service listings you post or upload to the Platform.
              </li>
              <li>
                <strong className="text-text">Payment Information:</strong> When
                you purchase credits or receive payouts, we collect billing
                details such as your name, billing address, and payment method
                information. Full payment card details are processed and stored
                by our third-party payment processors (Stripe and PayPal) and are
                not stored on our servers.
              </li>
              <li>
                <strong className="text-text">Communications:</strong> Messages
                you send to other users, support inquiries, and any other
                communications through the Platform.
              </li>
            </ul>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.2 Information from Third-Party Authentication (Google OAuth)
            </h3>
            <p>
              If you choose to sign in using Google OAuth, we receive the
              following information from your Google account:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Your Google account name (first and last name);</li>
              <li>Your Google email address;</li>
              <li>Your Google profile picture (avatar).</li>
            </ul>
            <p className="mt-3">
              We use this information solely to create and manage your Rally Live
              account. We do not access your Google contacts, calendar, drive
              files, or any other Google services data. You may revoke Rally
              Live&apos;s access to your Google account at any time through your
              Google account security settings.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.3 Information Collected Automatically
            </h3>
            <p>
              When you access or use the Platform, we automatically collect
              certain information, including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Usage Data:</strong> Pages visited,
                features used, videos watched, streams viewed, search queries,
                click patterns, time spent on the Platform, and interaction data
                (likes, follows, donations, battle participation).
              </li>
              <li>
                <strong className="text-text">Device Information:</strong> IP
                address, browser type and version, operating system, device type,
                screen resolution, and unique device identifiers.
              </li>
              <li>
                <strong className="text-text">Location Data:</strong> Approximate
                geographic location derived from your IP address.
              </li>
              <li>
                <strong className="text-text">Log Data:</strong> Server logs
                that record your interactions with the Platform, including access
                times, error logs, and referring URLs.
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              3. How We Use Your Information
            </h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Account Management:</strong> To
                create, maintain, and secure your account, and to verify your
                identity.
              </li>
              <li>
                <strong className="text-text">Content Delivery:</strong> To
                deliver, display, and recommend content including live streams,
                videos, and battle experiences.
              </li>
              <li>
                <strong className="text-text">Payments and Transactions:</strong>{" "}
                To process credit purchases, donations, creator service
                transactions, and payouts.
              </li>
              <li>
                <strong className="text-text">Personalization:</strong> To
                personalize your experience, including content recommendations,
                search results, and notification preferences.
              </li>
              <li>
                <strong className="text-text">Analytics:</strong> To analyze
                usage patterns and trends, measure the effectiveness of features,
                and improve the Platform.
              </li>
              <li>
                <strong className="text-text">Safety and Enforcement:</strong> To
                detect, investigate, and prevent fraud, abuse, security incidents,
                and violations of our Terms of Service and Community Guidelines.
              </li>
              <li>
                <strong className="text-text">Communications:</strong> To send
                you service-related notices, updates, security alerts, and
                support messages. With your consent, we may send promotional
                communications which you can opt out of at any time.
              </li>
              <li>
                <strong className="text-text">Legal Compliance:</strong> To
                comply with applicable laws, regulations, legal processes, and
                governmental requests.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              4. Third-Party Services
            </h2>
            <p>
              We work with trusted third-party service providers to operate the
              Platform. These providers have access to your information only as
              necessary to perform their functions and are contractually obligated
              to protect your data.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              4.1 Google AdSense
            </h3>
            <p>
              We use Google AdSense (publisher ID: ca-pub-9621220928003263) to
              display advertisements on the Platform. Google AdSense uses cookies
              and similar technologies to serve ads based on your prior visits to
              Rally Live and other websites. Google&apos;s use of advertising
              cookies enables it and its partners to serve ads based on your
              browsing activity. You may opt out of personalized advertising by
              visiting{" "}
              <a
                href="https://www.google.com/settings/ads"
                className="underline hover:text-text"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Ads Settings
              </a>
              .
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              4.2 Payment Processors
            </h3>
            <p>
              We use Stripe and PayPal to process payments for credit purchases
              and creator payouts. When you make a payment, your payment
              information is transmitted directly to and processed by these
              providers. We do not store your full credit card number or bank
              account details on our servers. Please review{" "}
              <a
                href="https://stripe.com/privacy"
                className="underline hover:text-text"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stripe&apos;s Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href="https://www.paypal.com/privacy"
                className="underline hover:text-text"
                target="_blank"
                rel="noopener noreferrer"
              >
                PayPal&apos;s Privacy Policy
              </a>{" "}
              for more information.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              4.3 Cloudflare
            </h3>
            <p>
              We use Cloudflare for content delivery network (CDN) services,
              distributed denial-of-service (DDoS) protection, and performance
              optimization. Cloudflare may process your IP address and request
              data to provide these services. Please review{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                className="underline hover:text-text"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cloudflare&apos;s Privacy Policy
              </a>{" "}
              for more information.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              5. Cookies and Tracking Technologies
            </h2>
            <p>
              Rally Live uses cookies and similar tracking technologies to
              enhance your experience on the Platform. The types of cookies we
              use include:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Essential Cookies:</strong>{" "}
                Required for the Platform to function properly, including
                authentication, session management, and security features.
              </li>
              <li>
                <strong className="text-text">Analytics Cookies:</strong> Used to
                collect information about how you use the Platform, helping us
                improve functionality and user experience.
              </li>
              <li>
                <strong className="text-text">Advertising Cookies:</strong> Used
                by Google AdSense and its partners to deliver relevant
                advertisements and measure ad performance.
              </li>
              <li>
                <strong className="text-text">Preference Cookies:</strong> Used
                to remember your settings and preferences, such as language and
                display options.
              </li>
            </ul>
            <p className="mt-3">
              You can manage your cookie preferences through your browser
              settings. Please note that disabling certain cookies may affect the
              functionality of the Platform.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              6. Data Sharing and Disclosure
            </h2>
            <p>
              We do not sell your personal information. We may share your
              information in the following circumstances:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">With Your Consent:</strong> When
                you explicitly authorize us to share your information.
              </li>
              <li>
                <strong className="text-text">Public Content:</strong> Content
                you post publicly on the Platform (streams, videos, profile
                information, comments) is visible to other users and may be
                indexed by search engines.
              </li>
              <li>
                <strong className="text-text">Service Providers:</strong> With
                third-party providers who assist us in operating the Platform, as
                described in Section 4.
              </li>
              <li>
                <strong className="text-text">Legal Requirements:</strong> When
                required by law, regulation, legal process, or governmental
                request, or when we believe disclosure is necessary to protect
                our rights, your safety, or the safety of others.
              </li>
              <li>
                <strong className="text-text">Business Transfers:</strong> In
                connection with a merger, acquisition, reorganization, or sale of
                assets, your information may be transferred as part of that
                transaction. We will notify you of any such change.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              7. Data Retention
            </h2>
            <p>
              We retain your personal information for as long as your account is
              active or as needed to provide you with our services. We may also
              retain and use your information as necessary to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Comply with legal obligations;</li>
              <li>Resolve disputes;</li>
              <li>Enforce our agreements;</li>
              <li>Protect against fraud and abuse.</li>
            </ul>
            <p className="mt-3">
              When you delete your account, we will delete or anonymize your
              personal information within a reasonable timeframe, except where
              retention is required by law or for legitimate business purposes
              (such as transaction records for tax and accounting purposes). Some
              information may persist in backups for a limited period before being
              permanently deleted.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              8. Your Rights
            </h2>
            <p>
              Depending on your jurisdiction, you may have the following rights
              regarding your personal information:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Access:</strong> You may request a
                copy of the personal information we hold about you.
              </li>
              <li>
                <strong className="text-text">Correction:</strong> You may
                request that we correct inaccurate or incomplete personal
                information.
              </li>
              <li>
                <strong className="text-text">Deletion:</strong> You may request
                that we delete your personal information, subject to certain
                legal exceptions.
              </li>
              <li>
                <strong className="text-text">Data Portability:</strong> You may
                request a copy of your personal information in a structured,
                commonly used, and machine-readable format.
              </li>
              <li>
                <strong className="text-text">Withdrawal of Consent:</strong>{" "}
                Where we rely on your consent to process your information, you
                may withdraw that consent at any time.
              </li>
              <li>
                <strong className="text-text">Objection:</strong> You may object
                to certain processing of your personal information, such as
                direct marketing.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at{" "}
              <a
                href="mailto:privacy@rallylive.ca"
                className="underline hover:text-text"
              >
                privacy@rallylive.ca
              </a>
              . We will respond to your request within thirty (30) days.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              9. Data Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              alteration, disclosure, or destruction. These measures include
              encryption of data in transit and at rest, access controls, regular
              security assessments, and secure coding practices.
            </p>
            <p className="mt-3">
              However, no method of transmission over the Internet or method of
              electronic storage is completely secure. While we strive to protect
              your personal information, we cannot guarantee its absolute
              security.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              10. Children&apos;s Privacy
            </h2>
            <p>
              Rally Live is not directed to children under the age of 13. We do
              not knowingly collect personal information from children under 13.
              If we become aware that we have collected personal information from
              a child under 13 without verification of parental consent, we will
              take steps to delete that information promptly.
            </p>
            <p className="mt-3">
              We comply with the Children&apos;s Online Privacy Protection Act
              (COPPA) and equivalent Canadian regulations. If you believe we have
              inadvertently collected information from a child under 13, please
              contact us immediately at{" "}
              <a
                href="mailto:privacy@rallylive.ca"
                className="underline hover:text-text"
              >
                privacy@rallylive.ca
              </a>
              .
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              11. Canadian Privacy Law Compliance (PIPEDA)
            </h2>
            <p>
              Rally Live complies with the Personal Information Protection and
              Electronic Documents Act (PIPEDA) and applicable provincial privacy
              legislation. In accordance with PIPEDA, we adhere to the following
              principles:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Accountability:</strong> We are
                responsible for the personal information under our control and
                have designated a privacy officer to oversee compliance.
              </li>
              <li>
                <strong className="text-text">Identifying Purposes:</strong> We
                identify the purposes for which personal information is collected
                at or before the time of collection.
              </li>
              <li>
                <strong className="text-text">Consent:</strong> We obtain your
                knowledge and consent for the collection, use, and disclosure of
                your personal information, except where exempted by law.
              </li>
              <li>
                <strong className="text-text">Limiting Collection:</strong> We
                limit the collection of personal information to what is necessary
                for the identified purposes.
              </li>
              <li>
                <strong className="text-text">
                  Limiting Use, Disclosure, and Retention:
                </strong>{" "}
                We do not use or disclose personal information for purposes other
                than those for which it was collected, except with your consent or
                as required by law.
              </li>
              <li>
                <strong className="text-text">Accuracy:</strong> We keep personal
                information as accurate, complete, and up-to-date as necessary.
              </li>
              <li>
                <strong className="text-text">Safeguards:</strong> We protect
                personal information with appropriate security safeguards.
              </li>
              <li>
                <strong className="text-text">Openness:</strong> We make
                information about our privacy policies and practices readily
                available.
              </li>
              <li>
                <strong className="text-text">Individual Access:</strong> Upon
                request, we will inform you of the existence, use, and disclosure
                of your personal information and provide you access to that
                information.
              </li>
              <li>
                <strong className="text-text">Challenging Compliance:</strong>{" "}
                You may challenge our compliance with these principles by
                contacting our privacy officer.
              </li>
            </ul>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              12. International Data Transfers
            </h2>
            <p>
              Your information may be transferred to and processed in countries
              other than Canada where our service providers operate. When we
              transfer personal information outside of Canada, we ensure that
              appropriate safeguards are in place to protect your information in
              accordance with applicable privacy laws.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              13. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in our practices, technology, legal requirements, or other
              factors. We will notify you of material changes by posting the
              updated Privacy Policy on the Platform with a revised effective
              date. Your continued use of the Platform after such changes
              constitutes acceptance of the updated Privacy Policy.
            </p>
            <p className="mt-3">
              We encourage you to review this Privacy Policy periodically to stay
              informed about how we are protecting your information.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              14. Contact Information
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="mt-3">
              <p>
                <strong className="text-text">Rally Live - Privacy Team</strong>
              </p>
              <p>
                Email:{" "}
                <a
                  href="mailto:privacy@rallylive.ca"
                  className="underline hover:text-text"
                >
                  privacy@rallylive.ca
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
