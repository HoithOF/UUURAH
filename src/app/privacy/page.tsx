import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  const n = site.name;
  return (
    <LegalPage title="Privacy policy">
      <p>
        {n} is operated by {site.legalName} (&quot;we&quot;, &quot;us&quot;). {n} lets a business connect the apps it already uses and see
        its numbers in one dashboard. This policy explains what we collect, why, who we share it with, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, company name, a one-way hash of your password, time zone, and team roles.</li>
        <li>
          <strong>Data from apps you connect:</strong> only from apps an owner or admin chooses to connect, and only what that app&apos;s sign-in allows. Depending
          on the app this includes sales, refunds, fees and payouts; invoices and bills; bank balances and transactions; ad spend and results; email
          metadata (sender, subject, a short preview, date) and the emails you send through {n}; calendar events; CRM deals; payroll totals and employee
          names and job titles. We do not collect card numbers or bank logins: you sign in on the app&apos;s own page, and it gives us an access token.
        </li>
        <li><strong>Files you upload,</strong> such as spreadsheets of sales or spending.</li>
        <li><strong>Questions you ask the assistant</strong> and its answers, while the page is open.</li>
        <li><strong>Technical data:</strong> IP address, browser type and request logs, used for security and to fix problems. We use one sign-in cookie and one cookie that remembers which company you&apos;re viewing. We don&apos;t use advertising or tracking cookies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show your business&apos;s numbers, warnings and health in the dashboard.</li>
        <li>To do what you ask, such as sending an email reply or answering a question.</li>
        <li>To send account emails (confirmations, password resets, invites) and the alerts you turn on.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or use it to train AI models.</p>

      <h2>Google user data</h2>
      <p>
        When you connect Google (Calendar, Gmail send, Google Ads), {n}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use
        requirements. We use Google data only to show it to you in the dashboard and to take the actions you request (such as sending an email you wrote or
        answering a calendar invite). We do not transfer it to others except as needed to provide those features, to comply with law, or as part of a
        merger with notice to you; we do not use it for advertising; and no person at {n} reads it unless you ask us to for support, it&apos;s needed for
        security, or the law requires it.
      </p>

      <h2>The AI assistant</h2>
      <p>
        When you use Ask, your question and the relevant numbers from your connected apps are sent to Anthropic, which runs the Claude model that writes the
        answer. Anthropic processes this data on our behalf under its commercial terms, which do not allow it to train models on this data. The assistant
        can only read your data; it can&apos;t send, change or pay anything.
      </p>

      <h2>Who we share it with</h2>
      <p>We share data only with service providers that help us run {n}, under contracts that limit how they use it:</p>
      <ul>
        <li>Hosting and database: Netlify and our database provider</li>
        <li>Email delivery: Resend</li>
        <li>AI answers: Anthropic</li>
        <li>Connection services you choose to use: Plaid (bank accounts), Merge (payroll and HR), Twilio (phone and texting), Stripe (billing)</li>
      </ul>
      <p>We may also disclose data if the law requires it, or to protect people&apos;s safety or our rights.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep data while your account is open. When you disconnect an app we stop collecting from it. When you delete a company or your account, we delete
        its data from our live systems right away and from backups within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, every app sign-in token is encrypted (AES-256-GCM), all traffic uses HTTPS, each company&apos;s data is kept separate, and
        two-step login is available for every user. No system is perfectly secure; if we learn of a breach that affects you, we&apos;ll tell you promptly.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Disconnect any app at any time on the Connections page.</li>
        <li>Delete your account or your whole company in Settings. See <Link href="/data-deletion">how to delete your data</Link>.</li>
        <li>Ask us for a copy of your data, or to correct it, by emailing {site.contactEmail}.</li>
        <li>Depending on where you live (for example California or the EU/UK), you may have further rights, including to object to or restrict processing. We honor these requests and won&apos;t treat you differently for making them.</li>
      </ul>

      <h2>Children</h2>
      <p>{n} is for businesses and isn&apos;t meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we make important changes we&apos;ll email account owners before they take effect.</p>

      <h2>Contact</h2>
      <p>{site.legalName}, {site.address}. Email: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></p>
    </LegalPage>
  );
}
