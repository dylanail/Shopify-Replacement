/**
 * Ten transactional templates. Handlebars over a shared, brand-tokenised layout.
 * Merchants can override subject/html per store; these are the defaults.
 */
export interface TemplateDef {
  key: string;
  name: string;
  trigger: string;
  subject: string;
  delayMinutes: number;
  html: string;
}

const layout = (body: string) => `<!doctype html><html><body style="margin:0;background:{{brand.backgroundColor}};font-family:{{brand.bodyFont}},Helvetica,Arial,sans-serif;color:{{brand.textColor}}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e9e2d9">
<tr><td style="padding:28px 32px 8px;font-family:{{brand.displayFont}},Georgia,serif;font-size:22px;letter-spacing:.02em">{{#if brand.logoUrl}}<img src="{{brand.logoUrl}}" alt="{{brand.name}}" height="36" style="display:block">{{else}}{{brand.name}}{{/if}}</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:16px 32px;background:#faf6f2;font-size:12px;color:#7a6f66">{{brand.name}} · {{storeUrl}} · <a href="{{unsubscribeUrl}}" style="color:#7a6f66">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;

const orderLines = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #eee">{{#each order.items}}<tr><td style="padding:10px 0;border-bottom:1px solid #eee">{{title}} <span style="color:#7a6f66">{{variantTitle}}</span> × {{quantity}}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eee">{{money lineTotal ../order.currency}}</td></tr>{{/each}}
<tr><td style="padding:8px 0;color:#7a6f66">Subtotal</td><td align="right">{{money order.subtotalCents order.currency}}</td></tr>
{{#if order.discountCents}}<tr><td style="padding:4px 0;color:#7a6f66">Discount</td><td align="right">−{{money order.discountCents order.currency}}</td></tr>{{/if}}
<tr><td style="padding:4px 0;color:#7a6f66">Shipping</td><td align="right">{{money order.shippingCents order.currency}}</td></tr>
<tr><td style="padding:4px 0;color:#7a6f66">Tax</td><td align="right">{{money order.taxCents order.currency}}</td></tr>
<tr><td style="padding:10px 0;font-weight:600">Total</td><td align="right" style="font-weight:600">{{money order.totalCents order.currency}}</td></tr></table>`;

const button = (href: string, label: string) => `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:{{brand.primaryColor}};color:#fff;text-decoration:none;padding:12px 20px;font-weight:600">${label}</a></p>`;

export const TEMPLATES: TemplateDef[] = [
  { key: "order_confirmation", name: "Order confirmation", trigger: "order.paid", delayMinutes: 0, subject: "Order #{{order.number}} confirmed — thank you, {{customer.firstName}}", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Thank you, {{customer.firstName}}.</h1><p>We've received order <strong>#{{order.number}}</strong> and we're getting it ready.</p>${orderLines}<p style="color:#7a6f66">Shipping to {{order.shippingAddress.line1}}, {{order.shippingAddress.city}} {{order.shippingAddress.postalCode}}</p>${button("{{orderUrl}}", "View your order")}`) },
  { key: "order_shipped", name: "Order shipped", trigger: "fulfillment.shipped", delayMinutes: 0, subject: "Your order #{{order.number}} is on its way", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">It's on the way.</h1><p>Order #{{order.number}} shipped{{#if fulfillment.provider}} via {{fulfillment.provider}}{{/if}}.</p>{{#if fulfillment.trackingNumber}}<p>Tracking: <a href="{{fulfillment.trackingUrl}}">{{fulfillment.trackingNumber}}</a></p>{{/if}}${button("{{fulfillment.trackingUrl}}", "Track package")}`) },
  { key: "order_delivered", name: "Order delivered", trigger: "fulfillment.delivered", delayMinutes: 0, subject: "Delivered: order #{{order.number}}", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Delivered.</h1><p>Order #{{order.number}} has arrived. We hope it's everything you wanted.</p>${button("{{storeUrl}}", "Back to {{brand.name}}")}`) },
  { key: "order_cancelled", name: "Order cancelled", trigger: "order.cancelled", delayMinutes: 0, subject: "Order #{{order.number}} cancelled", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Order cancelled.</h1><p>Order #{{order.number}} has been cancelled{{#if reason}}: {{reason}}{{/if}}. Any payment will be refunded to the original method within 5–10 business days.</p>`) },
  { key: "refund_issued", name: "Refund issued", trigger: "refund.created", delayMinutes: 0, subject: "Refund of {{money refund.amountCents order.currency}} for order #{{order.number}}", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Refund on its way.</h1><p>We've refunded <strong>{{money refund.amountCents order.currency}}</strong> for order #{{order.number}}. It typically appears in 5–10 business days.</p>`) },
  { key: "welcome", name: "Welcome", trigger: "customer.created", delayMinutes: 0, subject: "Welcome to {{brand.name}}", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Welcome, {{customer.firstName}}.</h1><p>{{brand.description}}</p>{{#if welcomeCode}}<p>Here's <strong>{{welcomeCode}}</strong> for 10% off your first order.</p>{{/if}}${button("{{storeUrl}}", "Start browsing")}`) },
  { key: "password_reset", name: "Password reset", trigger: "customer.password_reset", delayMinutes: 0, subject: "Reset your {{brand.name}} password", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Reset your password.</h1><p>This link is valid for 60 minutes.</p>${button("{{resetUrl}}", "Choose a new password")}<p style="color:#7a6f66">If you didn't ask for this, ignore this email.</p>`) },
  { key: "abandoned_cart", name: "Abandoned cart", trigger: "cart.abandoned", delayMinutes: 240, subject: "You left something behind", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">Still thinking it over?</h1><p>Your cart is saved. {{#each cart.items}}<br>· {{title}} × {{quantity}}{{/each}}</p>${button("{{cartUrl}}", "Return to cart")}`) },
  { key: "review_request", name: "Review request", trigger: "fulfillment.delivered", delayMinutes: 7 * 24 * 60, subject: "How was your {{firstItemTitle}}?", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">A minute of your time?</h1><p>You've had your {{firstItemTitle}} for a week. A short review helps other people decide{{#if incentiveCode}} — and earns you <strong>{{incentiveCode}}</strong> on your next order{{/if}}.</p>${button("{{reviewUrl}}", "Write a review")}`) },
  { key: "payment_failed", name: "Payment failed (subscription)", trigger: "subscription.payment_failed", delayMinutes: 0, subject: "Action needed: payment failed for your {{brand.name}} subscription", html: layout(`<h1 style="font-family:{{brand.displayFont}},Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">We couldn't charge your card.</h1><p>Attempt {{attempt}} of 3. We'll retry tomorrow; update your card to keep your subscription active.</p>${button("{{portalUrl}}", "Update payment method")}`) },
];

export const templateByKey = (key: string) => TEMPLATES.find((t) => t.key === key);
