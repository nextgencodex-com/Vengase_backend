require('dotenv').config();

const { Resend } = require('resend');
const emailjs = require('@emailjs/nodejs');

const CUSTOMER_TARGET = 'himsaradecosta@gmail.com';
const ADMIN_TARGET = 'wevengase@gmail.com';

const mask = (v) => {
  if (!v) return 'not-set';
  if (v.length < 8) return 'set';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
};

async function testEmailJsCustomer() {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  console.log('\n[EMAILJS-CUSTOMER] Config');
  console.log(`EMAILJS_SERVICE_ID: ${serviceId || 'not-set'}`);
  console.log(`EMAILJS_TEMPLATE_ID: ${templateId || 'not-set'}`);
  console.log(`EMAILJS_PUBLIC_KEY: ${mask(publicKey)}`);
  console.log(`EMAILJS_PRIVATE_KEY: ${mask(privateKey)}`);

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    return {
      ok: false,
      provider: 'emailjs',
      reason: 'Missing one or more EmailJS env vars: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY'
    };
  }

  try {
    const templateParams = {
      to_email: CUSTOMER_TARGET,
      email: CUSTOMER_TARGET,
      customer_email: CUSTOMER_TARGET,
      order_id: `TEST-${Date.now()}`,
      message: `EmailJS customer test at ${new Date().toISOString()}`
    };

    const response = await emailjs.send(serviceId, templateId, templateParams, {
      publicKey,
      privateKey
    });

    return {
      ok: true,
      provider: 'emailjs',
      status: response?.status,
      text: response?.text,
      raw: response
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'emailjs',
      reason: error?.message || 'EmailJS send failed',
      raw: error
    };
  }
}

async function testResendAdmin() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'Vengase <orders@vengase.com>';
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'onboarding@resend.dev';

  console.log('\n[RESEND-ADMIN] Config');
  console.log(`RESEND_API_KEY: ${mask(apiKey)}`);
  console.log(`FROM_EMAIL: ${from}`);

  if (!apiKey) {
    return {
      ok: false,
      provider: 'resend',
      reason: 'Missing RESEND_API_KEY'
    };
  }

  try {
    const resend = new Resend(apiKey);
    let response = await resend.emails.send({
      from,
      to: ADMIN_TARGET,
      subject: `Admin Resend Test ${new Date().toISOString()}`,
      html: `<div style="font-family:Arial,sans-serif"><h2>Admin Test</h2><p>This is a Resend admin test.</p><p>${new Date().toISOString()}</p></div>`
    });

    if (response?.error && String(response.error.message || '').toLowerCase().includes('domain is not verified')) {
      console.log(`[RESEND-ADMIN] Primary sender failed due to domain verification. Retrying with ${fallbackFrom} ...`);
      response = await resend.emails.send({
        from: fallbackFrom,
        to: ADMIN_TARGET,
        subject: `Admin Resend Test (fallback sender) ${new Date().toISOString()}`,
        html: `<div style="font-family:Arial,sans-serif"><h2>Admin Test</h2><p>Fallback sender used: ${fallbackFrom}</p><p>${new Date().toISOString()}</p></div>`
      });
    }

    if (response?.error) {
      return {
        ok: false,
        provider: 'resend',
        reason: response.error.message || JSON.stringify(response.error),
        raw: response
      };
    }

    return {
      ok: !!response?.data?.id,
      provider: 'resend',
      messageId: response?.data?.id,
      raw: response
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'resend',
      reason: error?.message || 'Resend send failed',
      raw: error
    };
  }
}

(async () => {
  console.log('=== Dual Email Provider Test ===');
  console.log(`Customer target (EmailJS): ${CUSTOMER_TARGET}`);
  console.log(`Admin target (Resend): ${ADMIN_TARGET}`);

  const emailjsResult = await testEmailJsCustomer();
  const resendResult = await testResendAdmin();

  console.log('\n=== Results ===');
  console.log('[EMAILJS-CUSTOMER]', emailjsResult.ok ? 'OK' : 'FAILED');
  if (emailjsResult.ok) {
    console.log('[EMAILJS-CUSTOMER] Status:', emailjsResult.status, emailjsResult.text || '');
  } else {
    console.log('[EMAILJS-CUSTOMER] Reason:', emailjsResult.reason);
  }

  console.log('[RESEND-ADMIN]', resendResult.ok ? 'OK' : 'FAILED');
  if (resendResult.ok) {
    console.log('[RESEND-ADMIN] Message ID:', resendResult.messageId || 'none');
  } else {
    console.log('[RESEND-ADMIN] Reason:', resendResult.reason);
  }

  process.exit(emailjsResult.ok && resendResult.ok ? 0 : 2);
})();
