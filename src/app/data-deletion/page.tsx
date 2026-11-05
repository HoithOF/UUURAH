import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Delete your data" };

export default function DataDeletion() {
  return (
    <LegalPage title="How to delete your data">
      <h2>Disconnect one app</h2>
      <p>Go to <strong>Connections</strong> and press <strong>Disconnect</strong> next to the app. We stop collecting from it, revoke our access where the app allows, and delete the data we collected from it.</p>
      <h2>Delete your whole company</h2>
      <p>The owner can go to <strong>Settings → Danger zone → Delete this company</strong>. This removes every connection, every synced record, every file and every team membership right away.</p>
      <h2>Delete your own login</h2>
      <p>Go to <strong>Settings → Danger zone → Delete my account</strong>. If you own a company with other people in it, hand ownership to someone else or delete the company first.</p>
      <h2>Facebook, Instagram and Google</h2>
      <p>Removing {site.name} from your Facebook or Google account settings stops our access. To also delete the data we already collected, use one of the options above or email us.</p>
      <h2>Can&apos;t log in?</h2>
      <p>Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> from the address on the account and we&apos;ll delete it within 30 days.</p>
    </LegalPage>
  );
}
