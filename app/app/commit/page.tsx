import { CommitForm } from "@/components/commit-form";
import { Rule } from "@/components/ui";

export default function CommitPage() {
  return (
    <div className="space-y-6">
      <Rule left="commit a finding" right="seller" />
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Your evidence is encrypted in this browser before it leaves. What goes on chain is a hash of the claim, a hash of the ciphertext, the
        institution that can prove you wrong, a deadline, your price split, your bond, and an exclusivity window you choose now — before anyone
        knows what the package is worth. You will not be in the delivery path, and you cannot delay publication.
      </p>
      <CommitForm />
    </div>
  );
}
