import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sendResendEmail } from "./resend";
import {
  emailTemplates,
  type EmailTemplateName,
  type EmailTemplateProps
} from "./templates";

type SendEmailParams<TTemplate extends EmailTemplateName> = {
  to: string | string[];
  subject: string;
  template: TTemplate;
  props: EmailTemplateProps[TTemplate];
};

export async function sendEmail<TTemplate extends EmailTemplateName>({
  to,
  subject,
  template,
  props
}: SendEmailParams<TTemplate>) {
  const templateDefinition = emailTemplates[template];
  const TemplateComponent = templateDefinition.component as ComponentType<
    EmailTemplateProps[TTemplate]
  >;
  const html = `<!doctype html>${renderToStaticMarkup(
    createElement(TemplateComponent, props)
  )}`;
  const text = templateDefinition.getText(props as never);

  return sendResendEmail({
    to,
    subject,
    html,
    text
  });
}

export type { EmailTemplateName, EmailTemplateProps };
