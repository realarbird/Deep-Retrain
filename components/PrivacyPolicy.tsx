import { buttonClass } from "@/components/ui/primitives";

export const PRIVACY_POLICY_URL = "/privacy.html";

export function PrivacyPolicy() {
  return (
    <div className="border-t border-line pt-6">
      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
        Privacy policy<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
