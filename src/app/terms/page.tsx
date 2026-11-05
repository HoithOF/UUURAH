import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  const n = site.name;
  return (
    <LegalPage title="Terms of service">
      <p>These terms are an agreement between {site.legalName} (&quot;we&quot;) and the business that creates a {n} account (&quot;you&quot;). By using {n} you agree to them.</p>

      <h2>1. The service</h2>
      <p>{n} connects to apps your business uses and shows their data in one dashboard, with warnings, an AI assistant and a few actions such as replying to email. We may improve or change features over time.</p>

      <h2>2. Your account</h2>
      <p>You must be at least 18 and authorized to act for your business. Keep your login safe and tell us right away about any unauthorized use. You&apos;re responsible for what people you invite do in your account.</p>

      <h2>3. Connected apps</h2>
      <p>You connect apps by signing in to them, and you confirm you&apos;re allowed to share their data with us. Those apps are run by other companies under their own terms; we aren&apos;t responsible for their availability or accuracy. Actions you take through {n} (such as sending an email) are carried out in those apps on your behalf.</p>

      <h2>4. Your data</h2>
      <p>You own your data. You give us permission to store and process it only to provide {n} to you, as described in our privacy policy. You can export or delete it at any time.</p>

      <h2>5. Acceptable use</h2>
      <p>Don&apos;t use {n} to break the law, send spam, access data you aren&apos;t allowed to, interfere with the service, or try to get around its security or limits.</p>

      <h2>6. Not professional advice</h2>
      <p>Numbers, warnings and AI answers are based on the data your apps provide and may be incomplete or wrong. They are not financial, tax, legal or accounting advice. Check important decisions with a qualified professional.</p>

      <h2>7. Fees</h2>
      <p>Paid plans are billed in advance through Stripe and renew until cancelled. You can cancel at any time; access continues to the end of the paid period. We&apos;ll give at least 30 days&apos; notice of any price change.</p>

      <h2>8. Ending</h2>
      <p>You can stop using {n} and delete your account at any time. We may suspend or close an account that breaks these terms, with notice when reasonable.</p>

      <h2>9. Disclaimers and liability</h2>
      <p>{n} is provided &quot;as is&quot;. To the extent the law allows, we disclaim all implied warranties, and our total liability for any claim is limited to the amount you paid us in the 12 months before it. We aren&apos;t liable for indirect or consequential losses such as lost profits.</p>

      <h2>10. General</h2>
      <p>These terms are governed by the laws of {site.governingLaw}. If we change them in an important way we&apos;ll email account owners first. Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>
    </LegalPage>
  );
}
