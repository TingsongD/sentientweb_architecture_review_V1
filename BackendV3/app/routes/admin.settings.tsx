import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import pdfParse from "pdf-parse";
import prisma from "~/db.server";
import { requireAdminSession } from "~/lib/auth.server";
import { decryptSecret, encryptSecret, maskSecret } from "~/lib/crypto.server";
import { defaultBranding, defaultTriggers } from "~/lib/tenants.server";
import { BlockedUrlError, DependencyUnavailableError } from "~/lib/errors.server";
import {
  enqueueKnowledgeCrawl,
  enqueueUploadedKnowledgeSource,
} from "~/lib/knowledge-base.server";
import { assertAllowedOutboundUrl } from "~/lib/outbound-url.server";

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function normalizeUploadTitle(
  input: string | null | undefined,
  fallback: string,
) {
  const value = input?.trim();
  return value ? value : fallback;
}

async function extractDocumentText(file: File) {
  const fileName = file.name || "document";
  const contentType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (
    contentType === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf")
  ) {
    const parsed = await pdfParse(buffer);
    return {
      rawText: parsed.text.trim(),
      uploadName: fileName,
      contentType,
      title: normalizeUploadTitle(parsed.info?.Title, fileName),
    };
  }

  const supportedTextTypes = [
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "application/markdown",
  ];
  const isMarkdown =
    fileName.toLowerCase().endsWith(".md") ||
    fileName.toLowerCase().endsWith(".markdown");
  const isText =
    supportedTextTypes.includes(contentType) ||
    isMarkdown ||
    fileName.toLowerCase().endsWith(".txt");

  if (!isText) {
    throw new Error(
      "Only PDF, markdown, and text uploads are supported in Phase 1.",
    );
  }

  return {
    rawText: buffer.toString("utf8").trim(),
    uploadName: fileName,
    contentType,
    title: fileName,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const branding =
    (tenant.branding as ReturnType<typeof defaultBranding>) ??
    defaultBranding();
  const triggerConfig =
    (tenant.triggerConfig as ReturnType<typeof defaultTriggers>) ??
    defaultTriggers();
  const qualificationPrompts = Array.isArray(tenant.qualificationPrompts)
    ? (tenant.qualificationPrompts as string[])
    : [];

  return {
    tenant,
    branding,
    triggerConfig,
    qualificationPrompts,
    knowledgeSources: await prisma.knowledgeSource.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    masked: {
      aiApiKey: tenant.aiApiKeyEncrypted
        ? maskSecret(decryptSecret(tenant.aiApiKeyEncrypted))
        : "",
      calendlyAccessToken: tenant.calendlyAccessTokenEncrypted
        ? maskSecret(decryptSecret(tenant.calendlyAccessTokenEncrypted))
        : "",
      crmWebhookSecret: tenant.crmWebhookSecretEncrypted
        ? maskSecret(decryptSecret(tenant.crmWebhookSecretEncrypted))
        : "",
      handoffWebhookSecret: tenant.handoffWebhookSecretEncrypted
        ? maskSecret(decryptSecret(tenant.handoffWebhookSecretEncrypted))
        : "",
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  if (intent === "crawl") {
    try {
      const rootUrl = String(form.get("rootUrl") ?? "").trim();
      if (!rootUrl) {
        return { ok: false, error: "Root URL is required for crawl." };
      }
      const source = await enqueueKnowledgeCrawl({
        tenantId: tenant.id,
        rootUrl,
        title: String(form.get("crawlTitle") ?? "").trim() || undefined,
      });

      return {
        ok: true,
        message: `Crawl started for ${source.rootUrl ?? source.title}.`,
        sourceId: source.id,
      };
    } catch (error) {
      if (error instanceof BlockedUrlError || error instanceof DependencyUnavailableError) {
        return { ok: false, error: error.message, code: error.code };
      }
      throw error;
    }
  }

  if (intent === "upload") {
    try {
      const rawTextInput = String(form.get("rawText") ?? "").trim();
      const documentTitle = String(form.get("documentTitle") ?? "").trim();
      const fileValue = form.get("document");
      const file =
        fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

      if (!file && !rawTextInput) {
        return {
          ok: false,
          error: "Attach a PDF/markdown file or paste document text.",
        };
      }

      const parsedDocument = file
        ? await extractDocumentText(file)
        : {
            rawText: rawTextInput,
            uploadName: normalizeUploadTitle(
              documentTitle,
              "Manual knowledge note",
            ),
            contentType: "text/plain",
            title: normalizeUploadTitle(documentTitle, "Manual knowledge note"),
          };

      if (!parsedDocument.rawText) {
        return {
          ok: false,
          error: "The uploaded document did not contain readable text.",
        };
      }

      const source = await enqueueUploadedKnowledgeSource({
        tenantId: tenant.id,
        title: normalizeUploadTitle(documentTitle, parsedDocument.title),
        uploadName: parsedDocument.uploadName,
        contentType: parsedDocument.contentType,
        rawText: parsedDocument.rawText,
      });

      return {
        ok: true,
        message: `Document queued: ${source.title ?? source.uploadName ?? "uploaded document"}.`,
        sourceId: source.id,
      };
    } catch (error) {
      if (error instanceof DependencyUnavailableError) {
        return { ok: false, error: error.message, code: error.code };
      }
      throw error;
    }
  }

  const allowedOrigins = String(form.get("allowedOrigins") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const qualificationPrompts = String(form.get("qualificationPrompts") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  const triggerConfig = {
    enabled: parseBoolean(form.get("proactiveEnabled")),
    rules: [
      {
        id: "pricing-intent",
        name: "Pricing page intent",
        enabled: parseBoolean(form.get("pricingTriggerEnabled")),
        pageType: "pricing",
        minTimeOnPageMs: 30000,
        cooldownSeconds: 600,
        message: String(form.get("pricingMessage") ?? ""),
      },
      {
        id: "docs-deep-dive",
        name: "Docs deep dive",
        enabled: parseBoolean(form.get("docsTriggerEnabled")),
        pageType: "docs",
        minTimeOnPageMs: 45000,
        minPagesViewed: 3,
        cooldownSeconds: 900,
        message: String(form.get("docsMessage") ?? ""),
      },
    ],
  };

  const crmWebhookUrl = String(form.get("crmWebhookUrl") ?? "").trim();
  const handoffWebhookUrl = String(form.get("handoffWebhookUrl") ?? "").trim();

  try {
    if (crmWebhookUrl) {
      await assertAllowedOutboundUrl(crmWebhookUrl);
    }
    if (handoffWebhookUrl) {
      await assertAllowedOutboundUrl(handoffWebhookUrl);
    }
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return { ok: false, error: error.message, code: error.code };
    }
    throw error;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      branding: {
        agentName: String(form.get("agentName") ?? "Sentient"),
        accentColor: String(form.get("accentColor") ?? "#0d7a5f"),
        launcherLabel: String(form.get("launcherLabel") ?? "Ask Sentient"),
        tone: String(form.get("tone") ?? "calm, clear, consultative"),
      },
      qualificationPrompts,
      allowedOrigins,
      triggerConfig,
      proactiveMode: parseBoolean(form.get("proactiveEnabled"))
        ? "beta_pricing_docs"
        : "reactive_only",
      aiProvider: String(form.get("aiProvider") ?? tenant.aiProvider),
      aiModel: String(form.get("aiModel") ?? tenant.aiModel),
      aiCredentialMode: String(
        form.get("aiCredentialMode") ?? tenant.aiCredentialMode ?? "managed",
      ),
      aiApiKeyEncrypted: form.get("aiApiKey")
        ? encryptSecret(String(form.get("aiApiKey")))
        : tenant.aiApiKeyEncrypted,
      calendlyEventTypeUri:
        String(form.get("calendlyEventTypeUri") ?? "") || null,
      calendlyAccessTokenEncrypted: form.get("calendlyAccessToken")
        ? encryptSecret(String(form.get("calendlyAccessToken")))
        : tenant.calendlyAccessTokenEncrypted,
      crmWebhookUrl: crmWebhookUrl || null,
      crmWebhookSecretEncrypted: form.get("crmWebhookSecret")
        ? encryptSecret(String(form.get("crmWebhookSecret")))
        : tenant.crmWebhookSecretEncrypted,
      handoffWebhookUrl: handoffWebhookUrl || null,
      handoffWebhookSecretEncrypted: form.get("handoffWebhookSecret")
        ? encryptSecret(String(form.get("handoffWebhookSecret")))
        : tenant.handoffWebhookSecretEncrypted,
    },
  });

  return { ok: true, message: "Settings saved." };
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const pricingRule = data.triggerConfig.rules.find(
    (rule) => rule.id === "pricing-intent",
  );
  const docsRule = data.triggerConfig.rules.find(
    (rule) => rule.id === "docs-deep-dive",
  );

  return (
    <section className="panel stack">
      <h1 style={{ margin: 0 }}>Tenant settings</h1>
      {actionData?.message ? (
        <div className="callout">{actionData.message}</div>
      ) : null}
      {actionData?.error ? (
        <div className="callout">{actionData.error}</div>
      ) : null}
      <Form method="post" className="stack">
        <input type="hidden" name="intent" value="save" />
        <div className="grid two">
          <label className="form-field">
            <span>Agent name</span>
            <input name="agentName" defaultValue={data.branding.agentName} />
          </label>
          <label className="form-field">
            <span>Launcher label</span>
            <input
              name="launcherLabel"
              defaultValue={data.branding.launcherLabel}
            />
          </label>
        </div>
        <div className="grid two">
          <label className="form-field">
            <span>Accent color</span>
            <input
              name="accentColor"
              type="color"
              defaultValue={data.branding.accentColor}
            />
          </label>
          <label className="form-field">
            <span>AI provider</span>
            <select name="aiProvider" defaultValue={data.tenant.aiProvider}>
              <option value="openai">openai</option>
              <option value="gemini">gemini</option>
            </select>
          </label>
        </div>
        <div className="grid two">
          <label className="form-field">
            <span>AI credential mode</span>
            <select
              name="aiCredentialMode"
              defaultValue={data.tenant.aiCredentialMode}
            >
              <option value="managed">managed</option>
              <option value="tenant_key">tenant_key</option>
            </select>
          </label>
          <label className="form-field">
            <span>AI model</span>
            <input name="aiModel" defaultValue={data.tenant.aiModel} />
          </label>
        </div>
        <label className="form-field">
          <span>AI API key</span>
          <input
            name="aiApiKey"
            placeholder={data.masked.aiApiKey || "sk-..."}
          />
          <small className="muted">
            Chat can use OpenAI or Gemini, but knowledge crawl/search embeddings
            remain OpenAI-backed. Leave blank for platform-managed billing, or
            provide an OpenAI tenant key when credential mode is set to{" "}
            <code>tenant_key</code>. Without a usable OpenAI embedding key,
            knowledge retrieval is unavailable instead of degrading.
          </small>
        </label>
        <label className="form-field">
          <span>Tone</span>
          <input name="tone" defaultValue={data.branding.tone} />
        </label>
        <label className="form-field">
          <span>Qualification prompts (one per line)</span>
          <textarea
            name="qualificationPrompts"
            rows={5}
            defaultValue={data.qualificationPrompts.join("\n")}
          />
        </label>
        <label className="form-field">
          <span>Allowed origins (one per line)</span>
          <textarea
            name="allowedOrigins"
            rows={4}
            defaultValue={data.tenant.allowedOrigins.join("\n")}
          />
        </label>

        <section className="panel stack" style={{ padding: 16 }}>
          <label className="form-field">
            <span>
              <input
                name="proactiveEnabled"
                type="checkbox"
                defaultChecked={data.tenant.proactiveMode !== "reactive_only"}
              />{" "}
              Enable proactive beta triggers
            </span>
          </label>
          <div className="grid two">
            <label className="form-field">
              <span>
                <input
                  name="pricingTriggerEnabled"
                  type="checkbox"
                  defaultChecked={pricingRule?.enabled}
                />{" "}
                Pricing trigger enabled
              </span>
              <input
                name="pricingMessage"
                defaultValue={pricingRule?.message}
              />
            </label>
            <label className="form-field">
              <span>
                <input
                  name="docsTriggerEnabled"
                  type="checkbox"
                  defaultChecked={docsRule?.enabled}
                />{" "}
                Docs trigger enabled
              </span>
              <input name="docsMessage" defaultValue={docsRule?.message} />
            </label>
          </div>
        </section>

        <section className="panel stack" style={{ padding: 16 }}>
          <h2 style={{ margin: 0 }}>Calendly</h2>
          <div className="grid two">
            <label className="form-field">
              <span>Calendly access token</span>
              <input
                name="calendlyAccessToken"
                placeholder={data.masked.calendlyAccessToken || "pat_..."}
              />
            </label>
            <label className="form-field">
              <span>Event type URI</span>
              <input
                name="calendlyEventTypeUri"
                defaultValue={data.tenant.calendlyEventTypeUri ?? ""}
              />
            </label>
          </div>
        </section>

        <section className="panel stack" style={{ padding: 16 }}>
          <h2 style={{ margin: 0 }}>CRM + handoff webhooks</h2>
          <div className="grid two">
            <label className="form-field">
              <span>CRM webhook URL</span>
              <input
                name="crmWebhookUrl"
                defaultValue={data.tenant.crmWebhookUrl ?? ""}
              />
            </label>
            <label className="form-field">
              <span>CRM webhook secret</span>
              <input
                name="crmWebhookSecret"
                placeholder={data.masked.crmWebhookSecret || "optional"}
              />
            </label>
          </div>
          <div className="grid two">
            <label className="form-field">
              <span>Handoff webhook URL</span>
              <input
                name="handoffWebhookUrl"
                defaultValue={data.tenant.handoffWebhookUrl ?? ""}
              />
            </label>
            <label className="form-field">
              <span>Handoff webhook secret</span>
              <input
                name="handoffWebhookSecret"
                placeholder={data.masked.handoffWebhookSecret || "optional"}
              />
            </label>
          </div>
        </section>

        <div className="form-actions">
          <button className="button" type="submit">
            Save settings
          </button>
        </div>
      </Form>

      <section className="panel stack" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Knowledge crawl</h2>
        <Form method="post" className="stack">
          <input type="hidden" name="intent" value="crawl" />
          <div className="grid two">
            <label className="form-field">
              <span>Root URL</span>
              <input name="rootUrl" placeholder="https://docs.example.com" />
            </label>
            <label className="form-field">
              <span>Label</span>
              <input name="crawlTitle" placeholder="Docs crawl" />
            </label>
          </div>
          <div className="form-actions">
            <button className="button-secondary" type="submit">
              Start crawl
            </button>
          </div>
        </Form>

        {data.knowledgeSources.length === 0 ? (
          <p className="muted">No knowledge sources yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Chunks</th>
              </tr>
            </thead>
            <tbody>
              {data.knowledgeSources.map((source) => (
                <tr key={source.id}>
                  <td>
                    {source.title ??
                      source.rootUrl ??
                      source.uploadName ??
                      source.id}
                  </td>
                  <td>{source.status}</td>
                  <td>{source.chunkCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Uploaded knowledge</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Add markdown, text, or PDF material for retrieval without changing the
          site crawl.
        </p>
        <Form method="post" encType="multipart/form-data" className="stack">
          <input type="hidden" name="intent" value="upload" />
          <div className="grid two">
            <label className="form-field">
              <span>Document title</span>
              <input name="documentTitle" placeholder="Pricing FAQ" />
            </label>
            <label className="form-field">
              <span>File upload</span>
              <input
                name="document"
                type="file"
                accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
              />
            </label>
          </div>
          <label className="form-field">
            <span>Or paste document text</span>
            <textarea
              name="rawText"
              rows={8}
              placeholder="Paste markdown or plain text content here"
            />
          </label>
          <div className="form-actions">
            <button className="button-secondary" type="submit">
              Add document
            </button>
          </div>
        </Form>
      </section>
    </section>
  );
}
