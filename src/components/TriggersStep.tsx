import React from "react";

import type { TranslatorFn } from "../i18n";
import { TriggerListStep } from "./TriggerListStep";

interface TriggersStepProps {
  pageName: string;
  t: TranslatorFn;
}

export function TriggersStep({ pageName, t }: TriggersStepProps) {
  return (
    <>
      <p style={{ color: "#A5A5A5", fontSize: 12, lineHeight: 1.5, margin: 0, minHeight: 18 }}>
        {t("triggerListPrompt")}
      </p>
      <TriggerListStep pageName={pageName} />
    </>
  );
}
