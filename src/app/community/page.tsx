import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Community Guidelines - Rally Live",
  description:
    "Community Guidelines for Rally Live. Understand the rules and expectations for participating in the Rally Live community.",
};

export default function CommunityGuidelines() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-text-secondary hover:text-text transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="mb-2 text-4xl font-bold text-text">
          Community Guidelines
        </h1>
        <p className="mb-10 text-sm text-text-secondary">
          Effective Date: February 1, 2026
        </p>

        <div className="space-y-10 text-text-secondary leading-relaxed">
          {/* Intro */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              Our Commitment
            </h2>
            <p>
              Rally Live is built on the belief that live streaming, creative
              expression, and community interaction should be open, inclusive, and
              safe for everyone. These Community Guidelines establish the
              standards of behavior and content that all users must follow when
              using{" "}
              <a
                href="https://rallylive.ca"
                className="underline hover:text-text"
              >
                rallylive.ca
              </a>
              . They apply to all activity on the Platform, including live
              streams, uploaded videos, battles (Timer Wars and Tower Wars),
              messages, profiles, creator services, and the credits and wallet
              system.
            </p>
            <p className="mt-3">
              Violations of these Guidelines may result in content removal,
              account warnings, temporary suspensions, or permanent bans. We
              review all reports and take action based on the severity and
              frequency of violations.
            </p>
          </section>

          {/* 1 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              1. Respectful Behavior
            </h2>
            <p>
              Rally Live is a diverse community. We expect all users to treat
              each other with dignity and respect. Healthy disagreement and
              constructive criticism are welcome, but personal attacks,
              belittling, and hostile behavior are not.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Engage in good faith. Assume positive intent from other users
                before jumping to conclusions.
              </li>
              <li>
                Respect differences in opinion, background, identity, and
                experience.
              </li>
              <li>
                Be mindful of your language and tone, especially during live
                interactions and battles where emotions can run high.
              </li>
              <li>
                Welcome new members to the community and help them understand the
                Platform.
              </li>
            </ul>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              2. Prohibited Content
            </h2>
            <p>
              The following types of content are strictly prohibited on Rally
              Live, whether in live streams, uploaded videos, messages, profiles,
              battle rooms, or any other area of the Platform:
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.1 Hate Speech
            </h3>
            <p>
              Content that promotes violence, discrimination, or hatred against
              individuals or groups based on race, ethnicity, national origin,
              religion, gender, gender identity, sexual orientation, disability,
              age, or any other protected characteristic. This includes slurs,
              dehumanizing language, hateful symbols, and supremacist ideologies.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.2 Harassment and Bullying
            </h3>
            <p>
              Content or behavior intended to intimidate, degrade, shame, or
              target another individual. This includes:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Sustained, unwanted contact or attention directed at a specific
                person;
              </li>
              <li>
                Encouraging others to harass or brigade another user (mob
                harassment);
              </li>
              <li>
                Sharing or threatening to share private or intimate images or
                information without consent (revenge content);
              </li>
              <li>
                Deliberate and repeated provocation (trolling) intended to upset
                or distress another user;
              </li>
              <li>Sexual harassment of any kind.</li>
            </ul>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.3 Violence and Threats
            </h3>
            <p>
              Content that depicts, promotes, glorifies, or incites real-world
              violence. This includes threats of physical harm, depictions of
              graphic violence, terrorism-related content, and instructions for
              carrying out violent acts.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.4 Sexual and Explicit Content
            </h3>
            <p>
              Sexually explicit or pornographic content is not permitted. This
              includes nudity intended to be sexually gratifying, sexual acts,
              and sexually suggestive content involving minors in any capacity.
              Artistic or educational nudity may be permitted in limited
              circumstances but must be clearly marked and appropriate in context.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.5 Self-Harm and Suicide
            </h3>
            <p>
              Content that promotes, glorifies, or provides instructions for
              self-harm or suicide. If you or someone you know is in crisis,
              please contact local emergency services or a crisis helpline
              immediately. We may remove content and provide resources to users
              we believe may be at risk.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.6 Illegal Activity
            </h3>
            <p>
              Content that promotes, facilitates, or depicts illegal activities,
              including but not limited to drug trafficking, the sale of illegal
              weapons, human trafficking, fraud, money laundering, hacking, and
              the distribution of controlled substances.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.7 Spam and Manipulation
            </h3>
            <p>
              Artificially inflating views, followers, or engagement through bots
              or automated tools; posting repetitive or irrelevant content; mass
              unsolicited messaging; misleading clickbait; and any form of
              platform manipulation designed to game algorithms or deceive users.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.8 Impersonation
            </h3>
            <p>
              Creating accounts or content that impersonates another person,
              brand, or organization in a misleading manner. Parody and fan
              accounts must be clearly labeled as such.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              2.9 Doxxing
            </h3>
            <p>
              Sharing or threatening to share another person&apos;s private
              information without their explicit consent, including real names,
              home addresses, phone numbers, email addresses, workplace
              information, financial information, or any other personally
              identifiable information intended to harass or endanger.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              3. Live Streaming Rules
            </h2>
            <p>
              Live streaming carries additional responsibilities because content
              is broadcast in real-time to other users. Streamers must adhere to
              the following rules:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">No Dangerous Activities:</strong>{" "}
                Do not broadcast activities that could cause physical harm to
                yourself or others, including dangerous stunts, reckless driving,
                or consumption of harmful substances.
              </li>
              <li>
                <strong className="text-text">
                  No Underage Users Streaming Alone:
                </strong>{" "}
                Users under 18 must not livestream without a parent or guardian
                present. Rally Live reserves the right to terminate streams and
                suspend accounts that appear to involve unsupervised minors.
              </li>
              <li>
                <strong className="text-text">Moderation Responsibilities:</strong>{" "}
                Stream hosts are responsible for the behavior in their streams.
                Hosts should actively moderate their chat and report viewers who
                violate these Guidelines. Using chat moderators is strongly
                encouraged for larger streams.
              </li>
              <li>
                <strong className="text-text">All Prohibited Content Rules Apply:</strong>{" "}
                All content prohibitions outlined in Section 2 apply equally to
                live streams. The fact that content is live does not excuse
                violations.
              </li>
              <li>
                <strong className="text-text">Privacy of Others:</strong> Do not
                broadcast other people without their knowledge and consent. This
                includes passersby during IRL (in real life) streams.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              4. Battle Rules
            </h2>
            <p>
              Battles on Rally Live, including Timer Wars and Tower Wars, are
              competitive and interactive. While spirited competition is
              encouraged, the following rules must be observed:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Maintain sportsmanship. Trash-talking that crosses into personal
                attacks, slurs, or harassment is not acceptable.
              </li>
              <li>
                Do not exploit bugs, glitches, or technical issues to gain an
                unfair advantage in battles.
              </li>
              <li>
                Colluding with opponents to manipulate battle outcomes is
                prohibited.
              </li>
              <li>
                Audience members in battle rooms must follow the same community
                standards as all other areas of the Platform.
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              5. Messaging Rules
            </h2>
            <p>
              The messaging feature on Rally Live is designed for meaningful
              communication between users. The following rules apply:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">No Unsolicited Explicit Content:</strong>{" "}
                Sending sexually explicit messages, images, or links to users who
                have not consented to receive them is strictly prohibited.
              </li>
              <li>
                <strong className="text-text">Respect Privacy Settings:</strong>{" "}
                If a user has restricted who can message them, do not attempt to
                circumvent those settings through alternative accounts or other
                means.
              </li>
              <li>
                Do not use messaging to spam, solicit, or distribute malicious
                links.
              </li>
              <li>
                Harassment, threats, and hate speech in messages are subject to
                the same enforcement as public content.
              </li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              6. Creator Services Marketplace
            </h2>
            <p>
              The creator services marketplace allows users to offer and purchase
              services from one another. To maintain a fair and trustworthy
              marketplace:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">Deliver What You Promise:</strong>{" "}
                If you list a service, you must deliver the service as described
                within the agreed-upon timeframe. Repeated failure to deliver
                will result in removal from the marketplace and potential account
                suspension.
              </li>
              <li>
                <strong className="text-text">No Scams:</strong> Offering
                services with no intention of delivering, providing fraudulent or
                deceptive service descriptions, or manipulating buyers is
                strictly prohibited.
              </li>
              <li>
                <strong className="text-text">No Prohibited Services:</strong>{" "}
                Services that involve illegal activity, violate third-party
                rights, or contravene these Guidelines may not be listed.
              </li>
              <li>
                Disputes between buyers and sellers should first be resolved
                directly between the parties. Rally Live may mediate disputes at
                its discretion but is not obligated to do so.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              7. Credits and Donations
            </h2>
            <p>
              The Rally Live credits and wallet system must be used honestly and
              in good faith:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">No Fraud:</strong> Do not attempt
                to fraudulently obtain credits through unauthorized means, fake
                accounts, exploiting bugs, or social engineering.
              </li>
              <li>
                <strong className="text-text">No Chargebacks:</strong> Initiating
                fraudulent chargebacks or payment disputes after voluntarily
                purchasing credits is prohibited and may result in immediate
                account termination and pursuit of legal remedies.
              </li>
              <li>
                <strong className="text-text">No Coercion:</strong> Do not
                pressure, manipulate, or coerce other users into sending you
                credits or donations.
              </li>
              <li>
                <strong className="text-text">No Money Laundering:</strong> The
                credits system may not be used for money laundering or any other
                financial crime.
              </li>
              <li>
                <strong className="text-text">Honest Fundraising:</strong> If you
                solicit donations for a specific purpose (such as charity), you
                must use those funds for the stated purpose. Misrepresenting the
                purpose of donations is fraud and will be treated as such.
              </li>
            </ul>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              8. Enforcement
            </h2>
            <p>
              Rally Live enforces these Guidelines through a graduated system of
              consequences. The specific action taken depends on the severity of
              the violation, the user&apos;s history, and the context of the
              incident.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              8.1 Warnings
            </h3>
            <p>
              For minor or first-time violations, we may issue a written warning
              explaining the violation and reminding the user of the applicable
              Guidelines. Warnings are recorded on the user&apos;s account.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              8.2 Content Removal
            </h3>
            <p>
              We may remove any content that violates these Guidelines, including
              live streams (which may be terminated in real-time), uploaded
              videos, messages, comments, profile information, and service
              listings.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              8.3 Temporary Suspensions
            </h3>
            <p>
              For repeated or more serious violations, we may temporarily suspend
              an account for a defined period. During a suspension, the user
              cannot access the Platform, stream, upload content, send messages,
              or participate in battles. Suspension durations increase with
              repeated violations.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-text">
              8.4 Permanent Bans
            </h3>
            <p>
              For severe violations, or after repeated lesser violations, we may
              permanently ban a user from Rally Live. Permanent bans result in
              the complete and irreversible termination of the account. Banned
              users may not create new accounts. Any credits or pending payouts
              may be forfeited.
            </p>
            <p className="mt-3">
              Examples of violations that may result in an immediate permanent ban
              include, but are not limited to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Child sexual abuse material (CSAM) of any kind;</li>
              <li>Credible threats of violence;</li>
              <li>Terrorism-related content;</li>
              <li>Doxxing or swatting;</li>
              <li>Large-scale fraud or financial exploitation.</li>
            </ul>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              9. Reporting Violations
            </h2>
            <p>
              If you encounter content or behavior that violates these Community
              Guidelines, we encourage you to report it. You can report violations
              through the following methods:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-text">In-Platform Reporting:</strong> Use
                the report button available on streams, videos, messages,
                profiles, battle rooms, and service listings to flag content for
                review.
              </li>
              <li>
                <strong className="text-text">Email:</strong> Send a detailed
                report to{" "}
                <a
                  href="mailto:community@rallylive.ca"
                  className="underline hover:text-text"
                >
                  community@rallylive.ca
                </a>{" "}
                including the username of the offending user, a description of
                the violation, and any relevant screenshots or links.
              </li>
            </ul>
            <p className="mt-3">
              All reports are reviewed by our moderation team. We may not be able
              to disclose the specific outcome of a report due to privacy
              considerations, but we take all reports seriously and act on
              verified violations.
            </p>
            <p className="mt-3">
              Filing false or malicious reports is itself a violation of these
              Guidelines and may result in enforcement action against the
              reporter.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              10. Appeal Process
            </h2>
            <p>
              If you believe that an enforcement action taken against your
              account was made in error, you have the right to appeal. To submit
              an appeal:
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-6">
              <li>
                Send an email to{" "}
                <a
                  href="mailto:community@rallylive.ca"
                  className="underline hover:text-text"
                >
                  community@rallylive.ca
                </a>{" "}
                with the subject line &ldquo;Appeal&rdquo; followed by your
                username.
              </li>
              <li>
                Include a clear explanation of why you believe the action was
                incorrect, along with any supporting evidence.
              </li>
              <li>
                Appeals must be submitted within thirty (30) days of the
                enforcement action.
              </li>
            </ol>
            <p className="mt-3">
              Our moderation team will review your appeal and respond within
              fourteen (14) business days. The decision on appeal is final.
              During the appeal review period, the enforcement action remains in
              effect.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              11. Changes to These Guidelines
            </h2>
            <p>
              We may update these Community Guidelines from time to time to
              address new types of content, behavior, or platform features. We
              will notify users of material changes by posting the updated
              Guidelines with a revised effective date. Continued use of the
              Platform after such changes constitutes acceptance of the updated
              Guidelines.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-3 text-2xl font-semibold text-text">
              12. Contact Information
            </h2>
            <p>
              If you have questions about these Community Guidelines, need to
              report a violation, or wish to submit an appeal, please contact us
              at:
            </p>
            <div className="mt-3">
              <p>
                <strong className="text-text">
                  Rally Live - Community Team
                </strong>
              </p>
              <p>
                Email:{" "}
                <a
                  href="mailto:community@rallylive.ca"
                  className="underline hover:text-text"
                >
                  community@rallylive.ca
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
