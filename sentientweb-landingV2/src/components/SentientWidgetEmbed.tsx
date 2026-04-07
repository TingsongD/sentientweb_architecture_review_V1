import Script from "next/script";
import { getSentientWidgetEmbedConfig } from "@/config/site";

export default function SentientWidgetEmbed() {
  const widget = getSentientWidgetEmbedConfig();
  if (!widget) return null;

  return (
    <Script
      id="sentientweb-widget"
      src={widget.agentScriptUrl}
      strategy="afterInteractive"
      data-install-key={widget.installKey}
    />
  );
}
